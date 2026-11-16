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
