import { test } from 'node:test'
import assert from 'node:assert/strict'
import { transitionView } from '../src/motion.js'

test('usa transiciones nativas y conserva la navegación con movimiento reducido o sin soporte', t => {
  const originalDocument = globalThis.document, originalMatchMedia = globalThis.matchMedia
  t.after(() => { globalThis.document = originalDocument; globalThis.matchMedia = originalMatchMedia })
  let updates = 0, transitions = 0
  globalThis.document = { startViewTransition(update) { transitions++; update() } }
  globalThis.matchMedia = () => ({ matches: false })
  transitionView(() => updates++)
  assert.equal(transitions, 1); assert.equal(updates, 1)
  globalThis.matchMedia = () => ({ matches: true })
  transitionView(() => updates++)
  assert.equal(transitions, 1); assert.equal(updates, 2)
  globalThis.document = {}
  transitionView(() => updates++)
  assert.equal(updates, 3)
})
