import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recordDownloads } from '../src/personalization.js'

test('registra 500 descargas en una petición conservando su peso total', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  let enabled = true
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => key === 'sonora-profile' ? 'token' : enabled ? 'on' : 'off',
  } })
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'localStorage', descriptor) : delete globalThis.localStorage)
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return Response.json({ ok: true })
  })
  await recordDownloads(Array.from({ length: 500 }, () => ({ id: 'aaaaaaaaaaa', title: 'Pista' })))
  assert.equal(calls.length, 1)
  assert.ok(calls[0].url.endsWith('/api/profile/events/batch'))
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token')
  const { events } = JSON.parse(calls[0].options.body)
  assert.equal(events.length, 500)
  assert.equal(new Set(events.map(event => event.eventId)).size, 500)
  assert.ok(events.every(event => event.kind === 'download' && event.weight === 3 / 500 && event.track.channel === ''))
  assert.ok(Math.abs(events.reduce((sum, event) => sum + event.weight, 0) - 3) < 1e-10)
  await recordDownloads([{ id: 'bbbbbbbbbbb', title: 't'.repeat(501), channel: 'c'.repeat(301) }])
  const longTrack = JSON.parse(calls[1].options.body).events[0].track
  assert.equal(longTrack.title, 't'.repeat(500))
  assert.equal(longTrack.channel, 'c'.repeat(300))
  enabled = false
  await recordDownloads([{ id: 'bbbbbbbbbbb', title: 'Otra' }])
  assert.equal(calls.length, 2)
})
