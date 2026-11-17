import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, existsSync, rmSync } from 'node:fs'
import { mkdir, readdir, rename, rm, stat, utimes } from 'node:fs/promises'
import path from 'node:path'
import { download, MUSIC_DIR } from './ytdlp.js'

const CONCURRENCY = 2, MAX_PENDING = 500, RETENTION = 7 * 24 * 60 * 60_000
const root = path.resolve(MUSIC_DIR, '.sonora'), cacheDir = path.join(root, 'cache'), tempDir = path.join(root, 'tmp')
mkdirSync(cacheDir, { recursive: true })
rmSync(tempDir, { recursive: true, force: true })
mkdirSync(tempDir, { recursive: true })
const db = new DatabaseSync(path.join(root, 'queue.sqlite'))
db.exec('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS batches (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, data TEXT NOT NULL)')
const saveJob = db.prepare('INSERT OR REPLACE INTO jobs VALUES (?, ?)')
const saveBatch = db.prepare('INSERT OR REPLACE INTO batches VALUES (?, ?)')
const jobs = new Map(db.prepare('SELECT data FROM jobs').all().map(({ data }) => { const j = JSON.parse(data); return [j.jid, j] }))
const batches = new Map(db.prepare('SELECT data FROM batches').all().map(({ data }) => { const b = JSON.parse(data); return [b.bid, b] }))
let n = Math.max(0, ...jobs.keys()), running = 0
export const events = new EventEmitter()
const activeFiles = new Map(), downloads = new Map()

for (const job of jobs.values()) {
  if (job.status === 'downloading') { job.status = 'queued'; job.percent = 0 }
  if (job.status === 'done' && (!job.file || !existsSync(job.file))) { job.status = 'error'; job.error = 'No se encontró el MP3; vuelve a intentarlo'; delete job.file }
  saveJob.run(job.jid, JSON.stringify(job))
}
for (const batch of batches.values()) {
  if (!batch.completedAt && batch.jids.every((id) => ['done', 'error'].includes(jobs.get(id)?.status))) { batch.completedAt = Date.now(); saveBatch.run(batch.bid, JSON.stringify(batch)) }
}
const publicJob = ({ file, ...job }) => job
const batchState = (batch) => {
  const items = batch.jids.map((id) => jobs.get(id))
  const complete = items.filter((j) => j.status === 'done').length
  const failed = items.filter((j) => j.status === 'error').length
  return { bid: batch.bid, title: batch.title, total: items.length, complete, failed, percent: Math.round(items.reduce((sum, j) => sum + (j.status === 'error' ? 100 : j.percent), 0) / items.length), ready: complete + failed === items.length, available: complete > 0 }
}
const publish = (job) => {
  events.emit('job', { type: 'job', ...publicJob(job) }, batches.get(job.bid).owner, batches.get(job.bid).playback)
  events.emit('job', { type: 'batch', ...batchState(batches.get(job.bid)) }, batches.get(job.bid).owner, batches.get(job.bid).playback)
}
const set = (job, patch) => {
  Object.assign(job, patch)
  if ('status' in patch) {
    saveJob.run(job.jid, JSON.stringify(job))
    const batch = batches.get(job.bid)
    batch.completedAt = batchState(batch).ready ? Date.now() : null
    saveBatch.run(batch.bid, JSON.stringify(batch))
  }
  publish(job)
}
export const snapshot = (owner) => [...jobs.values()].filter(job => batches.get(job.bid).owner === owner && !batches.get(job.bid).playback).map((job) => ({ type: 'job', ...publicJob(job) }))
export const batchSnapshot = (owner) => [...batches.values()].filter(batch => batch.owner === owner && !batch.playback).map((batch) => ({ type: 'batch', ...batchState(batch) }))
export const getBatch = (bid, owner) => {
  const batch = batches.get(bid)
  if (!batch || batch.owner !== owner) return null
  return { ...batchState(batch), files: batch.jids.map((id) => jobs.get(id)).filter((j) => j.status === 'done').map((j) => ({ file: j.file, title: j.title })) }
}
export function holdFiles(files) {
  for (const { file } of files) activeFiles.set(file, (activeFiles.get(file) || 0) + 1)
  let released = false
  return () => { if (released) return; released = true; for (const { file } of files) { const count = activeFiles.get(file) - 1; if (count) activeFiles.set(file, count); else activeFiles.delete(file) } }
}
export function enqueue(items, album, owner, playback = false) {
  if ([...jobs.values()].filter((j) => j.status === 'queued' || j.status === 'downloading').length + items.length > MAX_PENDING) return null
  const bid = randomUUID()
  const batch = { bid, owner, playback, title: album || (items.length === 1 ? items[0].title : 'Selección de canciones'), jids: [], completedAt: null }
  const added = items.map((it) => ({ jid: ++n, bid, id: it.id, title: it.title, album: album || null, status: 'queued', percent: 0, error: null }))
  batch.jids = added.map((j) => j.jid)
  db.exec('BEGIN')
  try { saveBatch.run(bid, JSON.stringify(batch)); for (const job of added) saveJob.run(job.jid, JSON.stringify(job)); db.exec('COMMIT') }
  catch (e) { db.exec('ROLLBACK'); throw e }
  batches.set(bid, batch)
  for (const job of added) jobs.set(job.jid, job)
  for (const job of added) publish(job)
  pump()
  return batchState(batch)
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
function pump() {
  while (running < CONCURRENCY) {
    const job = [...jobs.values()].find((j) => j.status === 'queued')
    if (!job) return
    running++
    set(job, { status: 'downloading' })
    cachedDownload(job, (percent) => { percent = Math.floor(percent); if (percent !== job.percent) set(job, { percent }) })
      .then((file) => set(job, { status: 'done', percent: 100, file }))
      .catch((e) => set(job, { status: 'error', error: e.message }))
      .finally(() => { running--; pump() })
  }
}
export function retry(jid, owner) {
  const job = jobs.get(jid)
  if (job?.status !== 'error' || batches.get(job.bid).owner !== owner || [...jobs.values()].filter((j) => j.status === 'queued' || j.status === 'downloading').length >= MAX_PENDING) return false
  set(job, { status: 'queued', percent: 0, error: null })
  pump()
  return true
}
async function cleanup() {
  const now = Date.now()
  for (const [bid, batch] of batches) {
    if (!batch.completedAt || now - batch.completedAt < RETENTION || batch.jids.some((id) => activeFiles.has(jobs.get(id)?.file))) continue
    db.exec('BEGIN')
    try { for (const id of batch.jids) db.prepare('DELETE FROM jobs WHERE id = ?').run(id); db.prepare('DELETE FROM batches WHERE id = ?').run(bid); db.exec('COMMIT') }
    catch (e) { db.exec('ROLLBACK'); throw e }
    for (const id of batch.jids) jobs.delete(id)
    batches.delete(bid)
    events.emit('job', { type: 'batch_removed', bid }, batch.owner, batch.playback)
  }
  const referenced = new Set([...jobs.values()].map((j) => j.file).filter(Boolean))
  for (const name of await readdir(cacheDir)) {
    const file = path.join(cacheDir, name)
    if (referenced.has(file) || activeFiles.has(file) || downloads.has(name.slice(0, -4))) continue
    try { if (now - (await stat(file)).mtimeMs >= RETENTION && !activeFiles.has(file) && !downloads.has(name.slice(0, -4)) && ![...jobs.values()].some((j) => j.file === file)) await rm(file, { force: true }) } catch (e) { if (e.code !== 'ENOENT') throw e }
  }
}
cleanup().catch((e) => console.error('Error limpiando descargas:', e.message))
setInterval(() => cleanup().catch((e) => console.error('Error limpiando descargas:', e.message)), 60 * 60_000).unref()
queueMicrotask(pump)

export function preparePlayback(id, owner) {
  const batch = [...batches.values()].find(b => b.owner === owner && b.playback && jobs.get(b.jids[0]).id === id)
  if (!batch) return enqueue([{ id, title: id }], null, owner, true)
  if (jobs.get(batch.jids[0]).status === 'error' && !retry(batch.jids[0], owner)) return null
  return batchState(batch)
}
