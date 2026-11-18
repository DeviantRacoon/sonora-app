import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { mkdirSync, existsSync, rmSync } from 'node:fs'
import { mkdir, readdir, rename, rm, stat, utimes } from 'node:fs/promises'
import path from 'node:path'
import { download, MUSIC_DIR } from './ytdlp.js'

const CONCURRENCY = 2, MAX_PENDING = 1000, MAX_PLAYBACK = 16
const RETENTION = Number(process.env.CACHE_RETENTION_HOURS || 24) * 60 * 60_000
const root = path.resolve(MUSIC_DIR, '.sonora'), cacheDir = path.join(root, 'cache'), tempDir = path.join(root, 'tmp')
mkdirSync(cacheDir, { recursive: true })
rmSync(tempDir, { recursive: true, force: true })
mkdirSync(tempDir, { recursive: true })
// shortcut: un solo proceso usa esta cola, añadir reservas SQL antes de escalar a varias instancias.
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, allowExitOnIdle: true }) : null
pool?.on('error', (e) => console.error('PostgreSQL:', e.message))
await pool?.query('CREATE TABLE IF NOT EXISTS queue_batches (id TEXT PRIMARY KEY, data JSONB NOT NULL); CREATE TABLE IF NOT EXISTS queue_jobs (id INTEGER PRIMARY KEY, data JSONB NOT NULL)')
let writes = Promise.resolve(), paused = false, closing = false, probeTimer, wakeTimer, pumping = false, lastBatch
const unavailable = () => Object.assign(new Error('La cola no está disponible; inténtalo de nuevo'), { status: 503 })
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))
function probe() {
  if (probeTimer || closing) return
  probeTimer = setTimeout(async () => {
    probeTimer = null
    try { await pool.query('SELECT 1'); paused = false; pump() } catch { probe() }
  }, 5000)
  probeTimer.unref()
}
function write(sql, params, retry = true) {
  if (!pool) return Promise.resolve()
  const operation = writes.then(async () => {
    for (;;) {
      try { await pool.query(sql, params); paused = false; queueMicrotask(pump); return }
      catch (error) {
        paused = true
        console.error('Error guardando cola:', error.message)
        if (!retry) { probe(); throw unavailable() }
        await delay(5000)
      }
    }
  })
  writes = operation.catch(() => {})
  return operation
}
const saveJob = (job) => write('INSERT INTO queue_jobs VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2', [job.jid, JSON.stringify(job)])
const saveBatch = (batch) => write('INSERT INTO queue_batches VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2', [batch.bid, JSON.stringify(batch)])
const load = async (table) => pool ? (await pool.query(`SELECT data FROM ${table}`)).rows.map((r) => r.data) : []
const jobs = new Map((await load('queue_jobs')).map((j) => [j.jid, j]))
const batches = new Map((await load('queue_batches')).map((b) => [b.bid, b]))
const queued = new Map(), totals = new Map(), activeFiles = new Map(), downloads = new Map(), executions = new Map(), tasks = new Set(), transitions = new Map(), retrying = new Set(), removing = new Set(), playbackAdmissions = new Map()
const pending = [0, 0], reservations = [0, 0]
let n = 0
export const events = new EventEmitter()
const isPending = (job) => job.status === 'queued' || job.status === 'downloading'
const score = (job) => job.status === 'error' ? 100 : job.percent
const kind = (batch) => batch.playback ? 1 : 0
const capacity = (type, count) => pending[type] + reservations[type] + count <= (type ? MAX_PLAYBACK : MAX_PENDING)
for (const batch of batches.values()) totals.set(batch.bid, { complete: 0, failed: 0, sum: 0 })
for (const job of jobs.values()) {
  n = Math.max(n, job.jid)
  job.attempts ??= 0
  job.nextAttemptAt ??= null
  if (job.status === 'downloading') {
    job.status = job.attempts >= 3 ? 'error' : 'queued'
    job.percent = 0
    job.nextAttemptAt = null
    if (job.status === 'error') job.error = 'La descarga se interrumpió durante el último intento'
    await saveJob(job)
  }
  if (job.status === 'done' && (!job.file || !existsSync(job.file))) {
    job.status = 'error'; job.error = 'No se encontró el MP3; vuelve a intentarlo'; delete job.file
    await saveJob(job)
  }
  const total = totals.get(job.bid)
  total.complete += Number(job.status === 'done')
  total.failed += Number(job.status === 'error')
  total.sum += score(job)
  if (isPending(job)) pending[kind(batches.get(job.bid))]++
  if (job.status === 'queued') queued.set(job.jid, job)
}
const publicJob = ({ file, ...job }) => job
const batchState = (batch) => {
  const { complete, failed, sum } = totals.get(batch.bid), total = batch.jids.length
  return { bid: batch.bid, title: batch.title, total, complete, failed, percent: Math.round(sum / total), ready: complete + failed === total, available: complete > 0 }
}
for (const batch of batches.values()) {
  const ready = batchState(batch).ready
  if (ready && !batch.completedAt || !ready && batch.completedAt) {
    batch.completedAt = ready ? Date.now() : null
    await saveBatch(batch)
  }
}
function publish(job) {
  const batch = batches.get(job.bid)
  events.emit('job', { type: 'job', ...publicJob(job) }, batch.owner, batch.playback)
  events.emit('job', { type: 'batch', ...batchState(batch) }, batch.owner, batch.playback)
}
function apply(job, patch) {
  const total = totals.get(job.bid), batch = batches.get(job.bid), wasPending = isPending(job)
  total.complete -= Number(job.status === 'done')
  total.failed -= Number(job.status === 'error')
  total.sum -= score(job)
  Object.assign(job, patch)
  total.complete += Number(job.status === 'done')
  total.failed += Number(job.status === 'error')
  total.sum += score(job)
  pending[kind(batch)] += Number(isPending(job)) - Number(wasPending)
  if (job.status === 'queued') queued.set(job.jid, job)
  else queued.delete(job.jid)
  batch.completedAt = batchState(batch).ready ? Date.now() : null
}
function transition(job, patch) {
  const operation = (transitions.get(job.jid) || Promise.resolve()).then(async () => {
    await saveJob({ ...job, ...patch })
    apply(job, patch)
    await saveBatch(batches.get(job.bid))
    publish(job)
  })
  transitions.set(job.jid, operation)
  operation.finally(() => { if (transitions.get(job.jid) === operation) transitions.delete(job.jid) }).catch(() => {})
  return operation
}
export const snapshot = (owner) => [...jobs.values()].filter(job => batches.get(job.bid).owner === owner && !batches.get(job.bid).playback).map((job) => ({ type: 'job', ...publicJob(job) }))
export const batchSnapshot = (owner) => [...batches.values()].filter(batch => batch.owner === owner && !batch.playback).map((batch) => ({ type: 'batch', ...batchState(batch) }))
export const getBatch = (bid, owner) => {
  const batch = batches.get(bid)
  if (!batch || batch.owner !== owner || removing.has(bid)) return null
  return { ...batchState(batch), files: batch.jids.map((id) => jobs.get(id)).filter((j) => j.status === 'done').map((j) => ({ file: j.file, title: j.title })) }
}
export function holdFiles(files) {
  for (const { file } of files) activeFiles.set(file, (activeFiles.get(file) || 0) + 1)
  let released = false
  return () => { if (released) return; released = true; for (const { file } of files) { const count = activeFiles.get(file) - 1; if (count) activeFiles.set(file, count); else activeFiles.delete(file) } }
}
export async function enqueue(items, album, owner, playback = false) {
  if (closing || paused) throw unavailable()
  const type = Number(playback)
  if (!capacity(type, items.length)) return null
  reservations[type] += items.length
  try {
    const bid = randomUUID()
    const batch = { bid, owner, playback, title: album || (items.length === 1 ? items[0].title : 'Selección de canciones'), jids: [], completedAt: null }
    const added = items.map((it) => ({ jid: ++n, bid, id: it.id, title: it.title, album: album || null, status: 'queued', percent: 0, error: null, attempts: 0, nextAttemptAt: null }))
    batch.jids = added.map((j) => j.jid)
    await write("WITH b AS (INSERT INTO queue_batches VALUES ($1, $2)) INSERT INTO queue_jobs SELECT (j->>'jid')::int, j FROM jsonb_array_elements($3::jsonb) j", [bid, JSON.stringify(batch), JSON.stringify(added)], false)
    batches.set(bid, batch)
    totals.set(bid, { complete: 0, failed: 0, sum: 0 })
    pending[type] += added.length
    for (const job of added) { jobs.set(job.jid, job); queued.set(job.jid, job) }
    for (const job of added) events.emit('job', { type: 'job', ...publicJob(job) }, owner, playback)
    events.emit('job', { type: 'batch', ...batchState(batch) }, owner, playback)
    pump()
    return batchState(batch)
  } finally { reservations[type] -= items.length }
}
async function cachedDownload(job, progress) {
  const file = path.join(cacheDir, `${job.id}.mp3`)
  try { const info = await stat(file); if (info.isFile() && Date.now() - info.mtimeMs < RETENTION) { await utimes(file, new Date(), new Date()); return file } } catch (e) { if (e.code !== 'ENOENT') throw e }
  if (downloads.has(job.id)) { const entry = downloads.get(job.id); entry.listeners.add(progress); try { return await entry.promise } finally { entry.listeners.delete(progress) } }
  const directory = path.join(tempDir, randomUUID()), listeners = new Set([progress])
  const promise = (async () => {
    try { const result = await download({ id: job.id, directory }, (percent) => { for (const listener of listeners) listener(percent) }); await rename(result, file); return file }
    finally { await rm(directory, { recursive: true, force: true }) }
  })()
  downloads.set(job.id, { promise, listeners })
  try { return await promise } finally { downloads.delete(job.id) }
}
function nextJob() {
  const now = Date.now(), eligible = [...queued.values()].filter(job => !transitions.has(job.jid) && (!job.nextAttemptAt || job.nextAttemptAt <= now) && (executions.size < CONCURRENCY || executions.has(job.id)))
  const playback = eligible.find(job => batches.get(job.bid).playback)
  if (playback) return playback
  const ids = [...new Set(eligible.map(job => job.bid))]
  if (!ids.length) return null
  const bid = ids[(ids.indexOf(lastBatch) + 1) % ids.length]
  return eligible.find(job => job.bid === bid)
}
function wake() {
  clearTimeout(wakeTimer)
  let next = Infinity
  for (const job of queued.values()) if (job.nextAttemptAt > Date.now()) next = Math.min(next, job.nextAttemptAt)
  if (next < Infinity && !closing) {
    wakeTimer = setTimeout(pump, Math.max(1, next - Date.now()))
    wakeTimer.unref()
  }
}
function pump() {
  if (pumping || closing || paused) return
  pumping = true
  try {
    for (;;) {
      const job = nextJob()
      if (!job) break
      queued.delete(job.jid)
      if (!batches.get(job.bid).playback) lastBatch = job.bid
      let entry = executions.get(job.id), start = false
      if (!entry) {
        let resolve, reject
        const promise = new Promise((yes, no) => { resolve = yes; reject = no })
        promise.catch(() => {})
        entry = { promise, resolve, reject, listeners: new Set() }
        executions.set(job.id, entry)
        start = true
      }
      const task = run(job, entry, start)
      tasks.add(task)
      task.catch(error => console.error('Error ejecutando cola:', error.message)).finally(() => { tasks.delete(task); pump() })
    }
    wake()
  } finally { pumping = false }
}
async function run(job, entry, start) {
  await transition(job, { status: 'downloading', attempts: job.attempts + 1, nextAttemptAt: null, error: null })
  const progress = (percent) => {
    percent = Math.floor(percent)
    if (percent !== job.percent && job.status === 'downloading') { apply(job, { percent }); publish(job) }
  }
  entry.listeners.add(progress)
  if (start) {
    cachedDownload(job, percent => { for (const listener of entry.listeners) listener(percent) })
      .then(entry.resolve, entry.reject)
      .finally(() => { if (executions.get(job.id) === entry) executions.delete(job.id); pump() })
  }
  try {
    const file = await entry.promise
    await transition(job, { status: 'done', percent: 100, file, error: null, nextAttemptAt: null })
  } catch (error) {
    const nextAttemptAt = job.attempts < 3 ? Date.now() + (job.attempts === 1 ? 2000 : 10000) : null
    await transition(job, { status: nextAttemptAt ? 'queued' : 'error', percent: 0, error: error.message, nextAttemptAt })
  } finally { entry.listeners.delete(progress) }
}
export async function retry(jid, owner) {
  if (closing || paused) throw unavailable()
  const job = jobs.get(jid), batch = job && batches.get(job.bid)
  if (job?.status !== 'error' || batch.owner !== owner || removing.has(job.bid) || retrying.has(jid) || !capacity(kind(batch), 1)) return false
  const type = kind(batch)
  reservations[type]++
  retrying.add(jid)
  try {
    await transition(job, { status: 'queued', percent: 0, error: null, attempts: 0, nextAttemptAt: null })
    pump()
    return true
  } finally { reservations[type]--; retrying.delete(jid) }
}
let cleaning = false
async function cleanup() {
  if (cleaning || closing || paused) return
  cleaning = true
  try {
    const now = Date.now()
    for (const [bid, batch] of batches) {
      if (!batch.completedAt || now - batch.completedAt < RETENTION || batch.jids.some((id) => activeFiles.has(jobs.get(id)?.file) || retrying.has(id) || transitions.has(id))) continue
      removing.add(bid)
      await write('WITH j AS (DELETE FROM queue_jobs WHERE id = ANY($1)) DELETE FROM queue_batches WHERE id = $2', [batch.jids, bid])
      for (const id of batch.jids) jobs.delete(id)
      batches.delete(bid)
      totals.delete(bid)
      removing.delete(bid)
      events.emit('job', { type: 'batch_removed', bid }, batch.owner, batch.playback)
    }
    const referenced = new Set([...jobs.values()].map((j) => j.file).filter(Boolean))
    for (const name of await readdir(cacheDir)) {
      const file = path.join(cacheDir, name)
      if (referenced.has(file) || activeFiles.has(file) || downloads.has(name.slice(0, -4))) continue
      try { if (now - (await stat(file)).mtimeMs >= RETENTION && !activeFiles.has(file) && !downloads.has(name.slice(0, -4)) && ![...jobs.values()].some((j) => j.file === file)) await rm(file, { force: true }) } catch (e) { if (e.code !== 'ENOENT') throw e }
    }
  } finally { cleaning = false }
}
cleanup().catch((e) => console.error('Error limpiando descargas:', e.message))
const cleanupTimer = setInterval(() => cleanup().catch((e) => console.error('Error limpiando descargas:', e.message)), 60 * 60_000)
cleanupTimer.unref()
queueMicrotask(pump)

export async function preparePlayback(id, owner) {
  const key = `${owner}:${id}`
  if (playbackAdmissions.has(key)) return playbackAdmissions.get(key)
  const operation = (async () => {
    const batch = [...batches.values()].find(b => !removing.has(b.bid) && b.owner === owner && b.playback && jobs.get(b.jids[0]).id === id)
    if (!batch) return enqueue([{ id, title: id }], null, owner, true)
    if (jobs.get(batch.jids[0]).status === 'error' && !await retry(batch.jids[0], owner)) return null
    return batchState(batch)
  })()
  playbackAdmissions.set(key, operation)
  try { return await operation } finally { playbackAdmissions.delete(key) }
}
export async function shutdownQueue() {
  closing = true
  clearTimeout(wakeTimer)
  clearTimeout(probeTimer)
  clearInterval(cleanupTimer)
  let timer
  const drained = Promise.allSettled([...tasks, writes]).then(() => true)
  const finished = await Promise.race([drained, new Promise(resolve => { timer = setTimeout(() => resolve(false), 10000) })])
  clearTimeout(timer)
  if (finished) await pool?.end()
}

export async function removeBatch(bid, owner) {
  const batch = batches.get(bid)
  if (!batch || batch.owner !== owner) return false
  if (batch.jids.some((id) => activeFiles.has(jobs.get(id)?.file))) return false
  db.exec('BEGIN')
  try {
    for (const id of batch.jids) deleteJob.run(id)
    deleteBatch.run(bid)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  const filesToDelete = []
  for (const id of batch.jids) {
    const job = jobs.get(id)
    if (job?.file) filesToDelete.push(job.file)
    jobs.delete(id)
  }
  batches.delete(bid)
  events.emit('job', { type: 'batch_removed', bid }, batch.owner, batch.playback)

  const referenced = new Set([...jobs.values()].map((j) => j.file).filter(Boolean))
  for (const file of filesToDelete) {
    if (!referenced.has(file) && !activeFiles.has(file)) {
      try { await rm(file, { force: true }) } catch {}
    }
  }
  return true
}

export async function purgeCompleted(owner) {
  const toRemove = [...batches.values()].filter(b => (!owner || b.owner === owner) && batchState(b).ready)
  for (const b of toRemove) {
    await removeBatch(b.bid, b.owner)
  }
  const referenced = new Set([...jobs.values()].map((j) => j.file).filter(Boolean))
  try {
    for (const name of await readdir(cacheDir)) {
      const file = path.join(cacheDir, name)
      if (!referenced.has(file) && !activeFiles.has(file)) {
        await rm(file, { force: true }).catch(() => {})
      }
    }
  } catch {}
  return true
}
