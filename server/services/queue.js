import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { download, MUSIC_DIR } from './ytdlp.js'

const CONCURRENCY = 2
export const events = new EventEmitter()
const jobs = new Map(), batches = new Map()
let n = 0, running = 0

const publicJob = ({ file, directory, ...job }) => job
const batchState = (batch) => {
  const items = batch.jids.map((id) => jobs.get(id))
  const complete = items.filter((j) => j.status === 'done').length
  const failed = items.filter((j) => j.status === 'error').length
  return { bid: batch.bid, title: batch.title, total: items.length, complete, failed,
    percent: Math.round(items.reduce((sum, j) => sum + (j.status === 'error' ? 100 : j.percent), 0) / items.length),
    ready: complete + failed === items.length, available: complete > 0 }
}
const publish = (job) => {
  events.emit('job', { type: 'job', ...publicJob(job) })
  events.emit('job', { type: 'batch', ...batchState(batches.get(job.bid)) })
}
const set = (job, patch) => { Object.assign(job, patch); publish(job) }
export const snapshot = () => [...jobs.values()].map((job) => ({ type: 'job', ...publicJob(job) }))
export const batchSnapshot = () => [...batches.values()].map((batch) => ({ type: 'batch', ...batchState(batch) }))
export const getBatch = (bid) => {
  const batch = batches.get(bid)
  if (!batch) return null
  return { ...batchState(batch), files: batch.jids.map((id) => jobs.get(id)).filter((j) => j.status === 'done').map((j) => ({ file: j.file, title: j.title })) }
}

export function enqueue(items, album) {
  const bid = randomUUID()
  const batch = { bid, title: album || (items.length === 1 ? items[0].title : 'Selección de canciones'), jids: [] }
  batches.set(bid, batch)
  for (const it of items) {
    const jid = ++n
    const job = { jid, bid, id: it.id, title: it.title, album: album || null, status: 'queued', percent: 0, error: null, directory: path.join(MUSIC_DIR, '.sonora', bid, String(jid)) }
    jobs.set(jid, job)
    batch.jids.push(jid)
  }
  for (const jid of batch.jids) publish(jobs.get(jid))
  pump()
  return batchState(batch)
}

function pump() {
  while (running < CONCURRENCY) {
    const job = [...jobs.values()].find((j) => j.status === 'queued')
    if (!job) return
    running++
    set(job, { status: 'downloading' })
    download(job, (percent) => set(job, { percent }))
      .then((file) => set(job, { status: 'done', percent: 100, file }))
      .catch((e) => set(job, { status: 'error', error: e.message }))
      .finally(() => { running--; pump() })
  }
}

export function retry(jid) {
  const job = jobs.get(jid)
  if (job?.status !== 'error') return false
  set(job, { status: 'queued', percent: 0, error: null })
  pump()
  return true
}
