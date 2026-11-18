import { Router } from 'express'
import { Pool } from 'pg'
import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isVideoId } from './ytdlp.js'
import { buildRecommendations } from './recommendations.js'

const hash = token => createHash('sha256').update(token).digest('hex')
const safeTrack = track => track && isVideoId(track.id) && typeof track.title === 'string' && track.title.length <= 500 && typeof track.channel === 'string' && track.channel.length <= 300
  ? { id: track.id, title: track.title, channel: track.channel } : null
function validEvent(event) {
  if (!event || !safeTrack(event.track)) return false
  const { eventId, kind, weight = 1 } = event
  return typeof eventId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(eventId) && ['play', 'download'].includes(kind) && Number.isFinite(weight) && weight > 0 && weight <= 3
}
export async function profileRoutes() {
  const router = Router()
  if (!process.env.DATABASE_URL) {
    router.use((req, res) => res.status(503).json({ error: 'Personalización no disponible' }))
    return router
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, allowExitOnIdle: true })
  pool.on('error', error => console.error('PostgreSQL:', error.message))
  try {
    await pool.query(await readFile(new URL('../migrations/001-profiles.sql', import.meta.url), 'utf8'))
  } catch (error) {
    console.warn('PostgreSQL no disponible al iniciar (revisa Docker `db`):', error.message)
    router.use((req, res) => res.status(503).json({ error: 'Personalización no disponible (base de datos desconectada)' }))
    return router
  }
  const cleanup = () => pool.query("DELETE FROM profiles WHERE last_seen < now() - interval '1 year'; DELETE FROM taste_events WHERE created_at < now() - interval '90 days'").catch(e => console.error('Limpieza de perfiles:', e.message))
  await cleanup()
  setInterval(cleanup, 3600000).unref()
  const limits = new Map(), building = new Set(), retryAfter = new Map()
  const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => { console.error('Perfiles:', e.message); res.status(503).json({ error: 'Personalización no disponible' }) })
  // shortcut: límite por conexión de red, configurar proxy de confianza al escalar detrás de un gateway.
  router.use((req, res, next) => {
    const key = req.socket.remoteAddress, now = Date.now()
    const entry = limits.get(key)
    if (!entry || now - entry.time > 60000) limits.set(key, { time: now, count: 1 })
    else if (++entry.count > 120) return res.status(429).json({ error: 'Demasiadas peticiones' })
    if (limits.size > 10000) for (const [k,v] of limits) if (now-v.time > 60000) limits.delete(k)
    res.set('Cache-Control', 'no-store'); next()
  })
  router.post('/profile', wrap(async (req, res) => {
    const token = randomBytes(32).toString('hex')
    await pool.query('INSERT INTO profiles(token_hash) VALUES($1)', [hash(token)])
    res.status(201).json({ token })
  }))
  router.use(wrap(async (req, res) => {
    const token = req.headers.authorization?.replace(/^Bearer /, '')
    if (!/^[a-f0-9]{64}$/.test(token || '')) return res.status(401).json({ error: 'Perfil inválido' })
    const id = hash(token)
    const { rows: [profile] } = await pool.query('UPDATE profiles SET last_seen=now() WHERE token_hash=$1 RETURNING *', [id])
    if (!profile) return res.status(401).json({ error: 'Perfil no encontrado' })
    const track = req.body?.track
    const cleanTrack = safeTrack(track)
    if (req.method === 'DELETE' && req.path === '/profile') {
      await pool.query('DELETE FROM profiles WHERE token_hash=$1', [id]); return res.json({ ok: true })
    }
    if (req.method === 'PATCH' && req.path === '/profile' && typeof req.body.enabled === 'boolean') {
      await pool.query('UPDATE profiles SET enabled=$2 WHERE token_hash=$1', [id, req.body.enabled]); return res.json({ ok: true })
    }
    if (req.method === 'POST' && ['/profile/events', '/profile/events/batch'].includes(req.path)) {
      const events = req.path.endsWith('/batch') ? req.body?.events : [req.body]
      if (!Array.isArray(events) || !events.length || events.length > 500 || !events.every(validEvent)) return res.status(400).json({ error: 'Evento inválido' })
      const unique = new Map(events.map(event => [`${event.kind}:${event.track.id}`, { eventId: event.eventId, kind: event.kind, track: safeTrack(event.track), weight: event.kind === 'play' ? 1 : (event.weight ?? 1) }]))
      if (profile.enabled) await pool.query(`
        INSERT INTO taste_events(profile,event_id,kind,track,weight)
        SELECT $1,(e->>'eventId')::uuid,e->>'kind',e->'track',(e->>'weight')::real
        FROM jsonb_array_elements($2::jsonb) e
        WHERE NOT EXISTS (SELECT 1 FROM taste_events t WHERE t.profile=$1 AND t.kind=e->>'kind' AND t.track->>'id'=e->'track'->>'id' AND t.created_at > now() - interval '1 day')
        ON CONFLICT DO NOTHING`, [id, JSON.stringify([...unique.values()])])
      return res.json({ ok: true })
    }
    if (req.method === 'PUT' && req.path.startsWith('/profile/preferences/')) {
      if (!cleanTrack || req.path.split('/').at(-1) !== track.id || !['like','exclude',null].includes(req.body.kind)) return res.status(400).json({ error: 'Preferencia inválida' })
      if (req.body.kind === null) await pool.query('DELETE FROM preferences WHERE profile=$1 AND video_id=$2', [id,track.id])
      else await pool.query('INSERT INTO preferences VALUES($1,$2,$3,$4) ON CONFLICT(profile,video_id) DO UPDATE SET kind=$3,track=$4', [id,track.id,req.body.kind,cleanTrack])
      await pool.query('UPDATE profiles SET generated_at=NULL WHERE token_hash=$1', [id])
      return res.json({ ok: true })
    }
    if (req.method !== 'GET' || req.path !== '/recommendations') return res.sendStatus(404)
    const { rows: prefs } = await pool.query('SELECT * FROM preferences WHERE profile=$1', [id])
    const { rows: activity } = await pool.query("SELECT track,sum(weight * exp(-extract(epoch FROM (now()-created_at))/2592000)) AS score FROM taste_events WHERE profile=$1 AND created_at > now()-interval '90 days' GROUP BY track ORDER BY score DESC", [id])
    const excluded = prefs.filter(p => p.kind === 'exclude').map(p => p.video_id)
    const seeds = [...prefs.filter(p => p.kind === 'like').map(p => p.track), ...activity.map(e => e.track)].filter(t => !excluded.includes(t.id))
    const preferences = Object.fromEntries(prefs.map(p => [p.video_id,p.kind]))
    if (!profile.enabled) return res.json({ state: 'disabled', tracks: [], preferences })
    if (new Set(seeds.map(t => t.id)).size < 3) return res.json({ state: 'learning', tracks: [], preferences })
    const stale = !profile.generated_at || Date.now()-new Date(profile.generated_at).getTime() > 21600000
    if (stale && Date.now() > (retryAfter.get(id) || 0) && !building.has(id) && building.size < 2) {
      building.add(id)
      retryAfter.set(id, Date.now() + 300000)
      if (retryAfter.size > 10000) for (const [key,time] of retryAfter) if (time < Date.now()) retryAfter.delete(key)
      buildRecommendations(seeds, [...excluded,...activity.map(e => e.track.id)]).then(tracks => pool.query('UPDATE profiles SET recommendations=$2,generated_at=now() WHERE token_hash=$1', [id,JSON.stringify(tracks)])).catch(e => console.error('Recomendaciones:', e.message)).finally(() => building.delete(id))
    }
    res.json({ state: profile.recommendations?.length ? 'ready' : building.has(id) ? 'building' : 'unavailable', tracks: (profile.recommendations || []).filter(t => !excluded.includes(t.id)), preferences })
  }))
  return router
}
