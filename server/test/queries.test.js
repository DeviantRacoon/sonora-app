import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('devuelve resultados parciales y limita las playlists', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sonora-query-')), bin = path.join(dir, 'yt-dlp')
  await writeFile(bin, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.some(a => a.includes('/results?'))) { console.error('error de playlists'); process.exit(1) }
if (args.includes('--playlist-end')) { console.log(JSON.stringify({ title: 'Lista', entries: Array.from({ length: 201 }, (_, i) => ({ id: String(i).padStart(11, '0'), title: 'Pista' })) })); process.exit() }
console.log(JSON.stringify({ entries: [{ id: 'aaaaaaaaaaa', title: 'Pista' }] }));
`)
  await chmod(bin, 0o755)
  process.env.YTDLP_PATH = bin
  try {
    const { search, playlist } = await import('../services/ytdlp.js')
    const found = await search('música')
    assert.equal(found.partial, true); assert.equal(found.videos.length, 1)
    const list = await playlist('abcdefghijkl')
    assert.equal(list.truncated, true); assert.equal(list.tracks.length, 200)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
