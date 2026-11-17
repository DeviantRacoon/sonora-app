import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchApi } from '../src/api.js'

test('muestra un error claro si la API devuelve HTML', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<!DOCTYPE html>', { headers: { 'content-type': 'text/html' } }))
  await assert.rejects(searchApi('test'), /No se pudo conectar con la API/)
})

test('conserva el identificador del navegador en peticiones y enlaces de archivos', async t => {
  const { downloadApi, retryApi, batchFileUrl, audioUrl, deviceId, fmt } = await import('../src/api.js')
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return Response.json({ ok: true })
  })
  await downloadApi([{ id: 'aaaaaaaaaaa' }])
  await retryApi(1)
  assert.ok(calls.every(call => call.options.headers['X-Sonora-Device'] === deviceId()))
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json')
  assert.equal(new URL(batchFileUrl('batch'), 'http://localhost').searchParams.get('device'), deviceId())
  assert.equal(new URL(audioUrl('aaaaaaaaaaa'), 'http://localhost').searchParams.get('device'), deviceId())
  assert.equal(fmt(63.75), '1:03')
})

test('crea y recupera un UUID privado incluso sin randomUUID en HTTP local', async t => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const originalUUID = Object.getOwnPropertyDescriptor(crypto, 'randomUUID')
  const saved = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) } })
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined })
  t.after(() => {
    originalStorage ? Object.defineProperty(globalThis, 'localStorage', originalStorage) : delete globalThis.localStorage
    originalUUID ? Object.defineProperty(crypto, 'randomUUID', originalUUID) : delete crypto.randomUUID
  })
  const first = await import('../src/api.js?first-device')
  const id = first.deviceId()
  assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
  assert.equal(saved.get('sonora-device'), id)
  const reloaded = await import('../src/api.js?reloaded-device')
  assert.equal(reloaded.deviceId(), id)
})
