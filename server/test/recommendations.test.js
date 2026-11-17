import { test } from 'node:test'
import assert from 'node:assert/strict'
import { artistHint, chooseTracks } from '../services/recommendations.js'

test('no confunde un canal genérico con el artista', () => {
  assert.equal(artistHint({ title:'Una canción', channel:'Music uploads' }), null)
  assert.equal(artistHint({ title:'Queen - Somebody to Love', channel:'Music' }), 'Queen')
  assert.equal(artistHint({ title:'Una canción', channel:'Queen - Topic' }), 'Queen')
})
test('deduplica videos, respeta exclusiones y limita artistas', () => {
  const tracks = Array.from({length:20}, (_,i) => ({id:String(i),artist:i < 5 ? 'A' : String(i)}))
  const result = chooseTracks([tracks[0], ...tracks], ['1'])
  assert.equal(result.length,12)
  assert.equal(new Set(result.map(t=>t.id)).size,12)
  assert.equal(result.some(t=>t.id==='1'),false)
  assert.equal(result.filter(t=>t.artist==='A').length,2)
})
