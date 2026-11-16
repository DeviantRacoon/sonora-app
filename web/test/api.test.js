import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchApi } from '../src/api.js'

test('muestra un error claro si la API devuelve HTML', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<!DOCTYPE html>', { headers: { 'content-type': 'text/html' } }))
  await assert.rejects(searchApi('test'), /No se pudo conectar con la API/)
})
