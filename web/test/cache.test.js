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
