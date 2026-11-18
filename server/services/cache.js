import { Pool } from 'pg'

const TTL = 10 * 60_000, LIMIT = 200, MEMORY_BYTES = 16 * 1024 * 1024, ENTRY_BYTES = 1024 * 1024
const cache = new Map(), pending = new Map()
let bytes = 0, ready, writes = Promise.resolve()
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 1000, query_timeout: 2000, allowExitOnIdle: true }) : null
pool?.on('error', error => console.error('Caché PostgreSQL:', error.message))
const prune = () => pool.query(`DELETE FROM response_cache WHERE key IN (
  SELECT key FROM (SELECT key, expires_at, row_number() OVER ordered AS position,
    sum(size_bytes) OVER ordered AS total_bytes FROM response_cache
    WINDOW ordered AS (ORDER BY expires_at DESC, key)) entries
  WHERE expires_at <= now() OR position > 2000 OR total_bytes > 67108864)`)
async function database(fn) {
  if (!pool) return
  try {
    ready ||= pool.query('CREATE TABLE IF NOT EXISTS response_cache (key TEXT PRIMARY KEY, data JSONB NOT NULL, expires_at TIMESTAMPTZ NOT NULL, size_bytes INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS response_cache_expires ON response_cache(expires_at)').catch(error => { ready = null; throw error })
    await ready
    return await fn()
  } catch (error) { console.error('Caché PostgreSQL:', error.message) }
}
function remove(key) {
  const entry = cache.get(key)
  if (entry) bytes -= entry.size
  cache.delete(key)
}
function remember(key, value, expires, size) {
  remove(key)
  cache.set(key, { promise: Promise.resolve(value), expires, size })
  bytes += size
  for (const oldest of cache.keys()) {
    if (cache.size <= LIMIT && bytes <= MEMORY_BYTES) break
    remove(oldest)
  }
}
export function cached(key, load) {
  const current = cache.get(key)
  if (current?.expires > Date.now()) {
    cache.delete(key); cache.set(key, current)
    return current.promise
  }
  remove(key)
  if (pending.has(key)) return pending.get(key)
  if (pending.size >= 32) return Promise.reject(Object.assign(new Error('Demasiadas consultas pendientes; inténtalo más tarde'), { status: 503, retryAfter: 5 }))
  const promise = Promise.resolve().then(async () => {
    const saved = await database(async () => (await pool.query('SELECT data, expires_at, size_bytes FROM response_cache WHERE key = $1 AND expires_at > now()', [key])).rows[0])
    if (saved && saved.size_bytes <= ENTRY_BYTES) {
      remember(key, saved.data, new Date(saved.expires_at).getTime(), saved.size_bytes)
      return saved.data
    }
    const value = await load()
    if (value?.partial) return value
    const json = JSON.stringify(value), size = json === undefined ? Infinity : Buffer.byteLength(json)
    if (size > ENTRY_BYTES) return value
    const expires = Date.now() + TTL
    remember(key, value, expires, size)
    if (pool) {
      writes = writes.then(() => database(async () => {
        await pool.query('INSERT INTO response_cache VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO UPDATE SET data = $2, expires_at = $3, size_bytes = $4', [key, json, new Date(expires), size])
        await prune()
      }))
      await writes
    }
    return value
  }).finally(() => pending.delete(key))
  pending.set(key, promise)
  return promise
}
export async function closeCache() {
  await Promise.allSettled([...pending.values()])
  await writes
  await pool?.end()
}
