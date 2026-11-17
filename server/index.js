import express from 'express'
import { fileURLToPath } from 'node:url'
import { access } from 'node:fs/promises'
import { ZipFile } from 'yazl'
import { search, playlist, isVideoId, isPlaylistId, safeName } from './services/ytdlp.js'
import { enqueue, retry, removeBatch, purgeCompleted, snapshot, batchSnapshot, getBatch, holdFiles, events, preparePlayback } from './services/queue.js'
import { cached } from './services/cache.js'

import { profileRoutes } from './services/profiles.js'

const app = express()
const origins = (process.env.FRONTEND_ORIGINS || '').split(',').filter(Boolean)
app.use((req, res, next) => {
  if (origins.includes(req.headers.origin)) {
    res.set('Access-Control-Allow-Origin', req.headers.origin)
    res.vary('Origin')
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Sonora-Device')
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
app.use(express.json({ limit: '128kb' }))
const profiles = await profileRoutes()
app.use('/api', (req, res, next) => /^\/(profile(?:\/|$)|recommendations$)/.test(req.path) ? profiles(req, res, next) : next())
app.get('/api/health', (req, res) => res.json({ ok: true }))

// A random browser token scopes history, events, retries and files to one installation.
app.use(['/api/downloads', '/api/audio'], (req, res, next) => {
  const owner = req.get('X-Sonora-Device') || req.query.device
  if (typeof owner !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(owner))
    return res.status(401).json({ error: 'Identificador de dispositivo requerido' })
  req.device = owner
  res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' })
  next()
})

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(500).json({ error: e.message }))

app.get('/api/search', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 200)
  if (!q) return res.status(400).json({ error: 'Falta q' })
  res.json(await cached(`search:${q}`, () => search(q)))
}))

app.get('/api/playlist', wrap(async (req, res) => {
  const id = String(req.query.id || '')
  if (!isPlaylistId(id)) return res.status(400).json({ error: 'ID de playlist inválido' })
  res.json(await cached(`playlist:${id}`, () => playlist(id)))
}))

app.post('/api/downloads', wrap(async (req, res) => {
  const { items, album } = req.body || {}
  if (!Array.isArray(items) || !items.length || items.length > 200 || !items.every((i) => isVideoId(i?.id)))
    return res.status(400).json({ error: 'Items inválidos' })
  const batch = enqueue(items.map((i) => ({ id: i.id, title: String(i.title || i.id), index: i.index })), album ? String(album) : null, req.device)
  if (!batch) return res.status(429).json({ error: 'La cola está llena; inténtalo más tarde' })
  res.json(batch)
}))

app.get('/api/downloads/batches/:bid/file', wrap(async (req, res) => {
  const batch = getBatch(req.params.bid, req.device)
  if (!batch) return res.status(404).json({ error: 'Descarga no encontrada' })
  if (!batch.available || !batch.ready) return res.status(409).json({ error: 'La descarga todavía no está lista' })
  const release = holdFiles(batch.files)
  res.once('close', release)
  res.once('finish', release)
  try { await Promise.all(batch.files.map(({ file }) => access(file))) } catch (e) { release(); throw e }

  const autoClean = () => {
    setTimeout(() => {
      removeBatch(req.params.bid, req.device).catch(() => {})
    }, 1500)
  }
  res.once('finish', autoClean)

  if (batch.total === 1) {
    return res.download(batch.files[0].file, `${safeName(batch.files[0].title)}.mp3`, (err) => {
      if (err) res.off('finish', autoClean)
    })
  }
  res.attachment(`${safeName(batch.title)}.zip`)
  const archive = new ZipFile()
  archive.on('error', (error) => { res.off('finish', autoClean); res.destroy(error) })
  archive.outputStream.on('error', (error) => { res.off('finish', autoClean); res.destroy(error) })
  res.on('close', () => archive.outputStream.destroy())
  archive.outputStream.pipe(res)
  batch.files.forEach(({ file, title }, index) => archive.addFile(file, `${String(index + 1).padStart(2, '0')} - ${safeName(title)}.mp3`, { compress: false }))
  archive.end()
}))

app.post('/api/downloads/purge', wrap(async (req, res) => {
  await purgeCompleted(req.device)
  res.json({ ok: true })
}))

app.delete('/api/downloads/batches/:bid', wrap(async (req, res) => {
  const ok = await removeBatch(req.params.bid, req.device)
  if (!ok) return res.status(404).json({ error: 'Descarga no encontrada o en uso' })
  res.json({ ok: true })
}))

app.post('/api/downloads/:jid/retry', (req, res) => res.json({ ok: retry(Number(req.params.jid), req.device) }))

app.get('/api/downloads', (req, res) => res.set('Cache-Control', 'no-store').json({ jobs: snapshot(req.device), batches: batchSnapshot(req.device) }))

// SSE: snapshot inicial + un evento por cambio de job
app.get('/api/downloads/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  res.flushHeaders()
  const send = (job, owner, playback = false) => { if (owner === req.device && !playback) res.write(`data: ${JSON.stringify(job)}\n\n`) }
  events.on('job', send)
  batchSnapshot(req.device).forEach(job => send(job, req.device))
  snapshot(req.device).forEach(job => send(job, req.device))
  req.on('close', () => events.off('job', send))
})

// Keep preparation in the bounded download queue; native audio supports HTTP ranges.
app.get('/api/audio/:id', wrap(async (req, res) => {
  if (!isVideoId(req.params.id)) return res.status(400).json({ error: 'ID de canción inválido' })
  const queued = preparePlayback(req.params.id, req.device)
  if (!queued) return res.status(429).json({ error: 'La cola está llena; inténtalo más tarde' })
  if (!queued.ready) await new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); events.off('job', update); res.off('close', closed) }
    const closed = () => { cleanup(); resolve() }
    const update = item => { if (item.type === 'batch' && item.bid === queued.bid && item.ready) { cleanup(); resolve() } }
    const timer = setTimeout(() => { cleanup(); reject(new Error('La canción tardó demasiado en prepararse. Vuelve a intentarlo.')) }, 180000)
    events.on('job', update)
    res.once('close', closed)
  })
  if (res.destroyed) return
  const batch = getBatch(queued.bid, req.device)
  if (!batch?.available) return res.status(502).json({ error: 'No se pudo preparar el audio. Vuelve a intentarlo.' })
  const release = holdFiles(batch.files)
  res.once('close', release)
  res.once('finish', release)
  res.type('audio/mpeg').sendFile(batch.files[0].file, { cacheControl: false }, error => {
    if (error && !res.headersSent) res.status(error.status || 500).end()
  })
}))

const dist = fileURLToPath(new URL('../web/dist', import.meta.url))
app.use(express.static(dist, { setHeaders: (res, file) => { if (file.endsWith('/sw.js')) res.set('Cache-Control', 'no-cache') } }))

const port = process.env.PORT || 3001
const host = process.env.HOST || '127.0.0.1'
app.listen(port, host, () => console.log(`API en http://${host}:${port}`))
