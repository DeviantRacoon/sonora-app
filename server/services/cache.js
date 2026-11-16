const TTL = 10 * 60_000, LIMIT = 200
const cache = new Map()
export function cached(key, load) {
  const now = Date.now(), current = cache.get(key)
  if (current && (current.pending || current.expires > now)) {
    cache.delete(key); cache.set(key, current)
    return current.promise
  }
  cache.delete(key)
  const entry = { pending: true, expires: 0 }
  entry.promise = Promise.resolve().then(load).then((value) => {
    entry.pending = false
    entry.expires = Date.now() + TTL
    trim(cache)
    if (value.partial && cache.get(key) === entry) cache.delete(key)
    return value
  }, (error) => { if (cache.get(key) === entry) cache.delete(key); throw error })
  cache.set(key, entry)
  trim(cache)
  return entry.promise
}

function trim(cache) {
  for (const [key, entry] of cache) {
    if (cache.size <= LIMIT) break
    if (!entry.pending) cache.delete(key)
  }
}
