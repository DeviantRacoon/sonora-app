export function cached(cache, key, load) {
  if (!cache.has(key)) {
    const promise = Promise.resolve().then(load).catch((error) => {
      if (cache.get(key) === promise) cache.delete(key)
      throw error
    })
    cache.set(key, promise)
  }
  return cache.get(key)
}
