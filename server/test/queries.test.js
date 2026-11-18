import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('devuelve resultados parciales y limita las playlists', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sonora-query-')), bin = path.join(dir, 'yt-dlp')
  await writeFile(bin, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.some(a => a.includes('slow'))) { setTimeout(() => console.log(JSON.stringify({ entries: [] })), 100); return }
if (args.some(a => a.includes('/results?'))) { console.error('error de playlists'); process.exit(1) }
if (args.includes('--playlist-end')) { console.log(JSON.stringify({ title: 'Lista', entries: Array.from({ length: 501 }, (_, i) => ({ id: String(i).padStart(11, '0'), title: 'Pista' })) })); process.exit() }
console.log(JSON.stringify({ entries: [{ id: 'aaaaaaaaaaa', title: 'Pista' }] }));
`)
  await chmod(bin, 0o755)
  process.env.YTDLP_PATH = bin
  try {
    const { search, playlist } = await import('../services/ytdlp.js')
    const found = await search('música')
    assert.equal(found.partial, true); assert.equal(found.videos.length, 1)
    const list = await playlist('abcdefghijkl')
    assert.equal(list.truncated, true); assert.equal(list.tracks.length, 500)
    const waiting = Array.from({ length: 36 }, (_, i) => playlist(`slow${i}`))
    await assert.rejects(playlist('slow-overflow'), error => error.status === 503 && error.retryAfter === 5)
    await Promise.all(waiting)
    assert.equal((await playlist('slow-after')).tracks.length, 0)
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const active = Promise.allSettled(Array.from({ length: 4 }, (_, i) => playlist(`slow-active-${i}`)))
    const timeout = assert.rejects(playlist('slow-timeout'), error => error.status === 503)
    t.mock.timers.tick(15_000)
    await timeout
    t.mock.timers.reset()
    await active
    assert.equal((await playlist('slow-recovered')).tracks.length, 0)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
