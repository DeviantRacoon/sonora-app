import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cached } from '../services/cache.js'

test('comparte consultas y no conserva errores o resultados parciales', async () => {
  let calls = 0
  const load = () => { calls++; return { videos: [] } }
  const a = cached('same', load), b = cached('same', load)
  assert.equal(a, b)
  await Promise.all([a, b]); await cached('same', load)
  assert.equal(calls, 1)
  await assert.rejects(cached('error', () => { throw Error('falló') }))
  assert.deepEqual(await cached('error', load), { videos: [] })
  await cached('partial', () => ({ partial: true }))
  assert.deepEqual(await cached('partial', load), { videos: [] })
})

test('respeta TTL absoluto, límite LRU y bytes', async t => {
  let now = Date.now()
  t.mock.method(Date, 'now', () => now)
  let calls = 0
  const load = () => ({ count: ++calls })
  await cached('ttl', load)
  now += 9 * 60_000
  await cached('ttl', load)
  assert.equal(calls, 1)
  now += 60_001
  await cached('ttl', load)
  assert.equal(calls, 2)
  for (let i = 0; i < 201; i++) await cached(`lru:${i}`, () => ({ i }))
  assert.deepEqual(await cached('lru:0', () => ({ evicted: true })), { evicted: true })
  for (let i = 0; i < 20; i++) await cached(`bytes:${i}`, () => ({ text: 'x'.repeat(900_000) }))
  assert.deepEqual(await cached('bytes:0', () => ({ evicted: true })), { evicted: true })
  await cached('oversize', () => ({ text: 'x'.repeat(1024 * 1024) }))
  assert.deepEqual(await cached('oversize', () => ({ skipped: true })), { skipped: true })
})

test('acota cargas distintas pero comparte las que ya están pendientes', async () => {
  let release
  const barrier = new Promise(resolve => { release = resolve })
  const requests = Array.from({ length: 32 }, (_, i) => cached(`pending:${i}`, () => barrier.then(() => ({ i }))))
  assert.equal(cached('pending:0', () => { throw Error('duplicado') }), requests[0])
  await assert.rejects(cached('overflow', () => ({})), error => error.status === 503 && error.retryAfter === 5)
  release()
  await Promise.all(requests)
  assert.deepEqual(await cached('after-overflow', () => ({ ok: true })), { ok: true })
})
