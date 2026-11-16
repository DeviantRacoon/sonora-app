import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cached } from '../src/cache.js'

test('reuses pending and completed requests for the same key', async () => {
  const cache = new Map()
  let calls = 0
  const load = () => { calls++; return { title: 'Pista' } }
  const first = cached(cache, 'canción', load)
  const second = cached(cache, 'canción', load)
  assert.strictEqual(first, second)
  assert.deepEqual(await first, { title: 'Pista' })
  assert.deepEqual(await cached(cache, 'canción', load), { title: 'Pista' })
  assert.equal(calls, 1)
  await cached(cache, 'otra', load)
  assert.equal(calls, 2)
})

test('failed requests can be retried', async () => {
  const cache = new Map()
  await assert.rejects(cached(cache, 'playlist', () => { throw new Error('offline') }))
  assert.equal(await cached(cache, 'playlist', () => 'ok'), 'ok')
})

test('expires results, bounds the cache and retries partial responses', async () => {
  const cache = new Map()
  let calls = 0
  const load = () => ({ count: ++calls })
  await cached(cache, 'old', load)
  cache.get('old').expires = Date.now() - 1
  assert.equal((await cached(cache, 'old', load)).count, 2)
  await cached(cache, 'partial', () => ({ partial: true }))
  assert.equal(cache.has('partial'), false)
  for (let i = 0; i < 210; i++) await cached(cache, String(i), load)
  assert.equal(cache.size, 200)
})
