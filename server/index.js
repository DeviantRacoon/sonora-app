import express from 'express'
import { fileURLToPath } from 'node:url'
import { access } from 'node:fs/promises'
import { ZipFile } from 'yazl'
import { search, playlist, isVideoId, isPlaylistId, safeName } from './services/ytdlp.js'
import { enqueue, retry, snapshot, batchSnapshot, getBatch, holdFiles, events } from './services/queue.js'
import { cached } from './services/cache.js'

const app = express()
app.use(express.json())

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
  const batch = enqueue(items.map((i) => ({ id: i.id, title: String(i.title || i.id), index: i.index })), album ? String(album) : null)
  if (!batch) return res.status(429).json({ error: 'La cola está llena; inténtalo más tarde' })
  res.json(batch)
}))

app.get('/api/downloads/batches/:bid/file', wrap(async (req, res) => {
  const batch = getBatch(req.params.bid)
  if (!batch) return res.status(404).json({ error: 'Descarga no encontrada' })
  if (!batch.available || !batch.ready) return res.status(409).json({ error: 'La descarga todavía no está lista' })
  const release = holdFiles(batch.files)
  res.once('close', release)
  res.once('finish', release)
  try { await Promise.all(batch.files.map(({ file }) => access(file))) } catch (e) { release(); throw e }
  if (batch.total === 1) return res.download(batch.files[0].file, `${safeName(batch.files[0].title)}.mp3`)
  res.attachment(`${safeName(batch.title)}.zip`)
  const archive = new ZipFile()
  archive.on('error', (error) => res.destroy(error))
  archive.outputStream.on('error', (error) => res.destroy(error))
  res.on('close', () => archive.outputStream.destroy())
  archive.outputStream.pipe(res)
  batch.files.forEach(({ file, title }, index) => archive.addFile(file, `${String(index + 1).padStart(2, '0')} - ${safeName(title)}.mp3`, { compress: false }))
  archive.end()
}))

app.post('/api/downloads/:jid/retry', (req, res) => res.json({ ok: retry(Number(req.params.jid)) }))

// SSE: snapshot inicial + un evento por cambio de job
app.get('/api/downloads/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  res.flushHeaders()
  const send = (job) => res.write(`data: ${JSON.stringify(job)}\n\n`)
  events.on('job', send)
  batchSnapshot().forEach(send)
  snapshot().forEach(send)
  req.on('close', () => events.off('job', send))
})

const dist = fileURLToPath(new URL('../web/dist', import.meta.url))
app.use(express.static(dist))

const port = process.env.PORT || 3001
const host = process.env.HOST || '127.0.0.1'
app.listen(port, host, () => console.log(`API en http://${host}:${port}`))
