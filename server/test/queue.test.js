import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(fn, timeout = 18000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { const value = await fn(); if (value) return value; await delay(20) }
  throw new Error('La cola no alcanzó el estado esperado')
}

test('deduplica procesos, alterna lotes, prioriza audio y limita admisiones y reintentos', { timeout: 45000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sonora-queue-')), bin = path.join(dir, 'yt-dlp'), log = path.join(dir, 'calls')
  const original = { DATABASE_URL: process.env.DATABASE_URL, MUSIC_DIR: process.env.MUSIC_DIR, YTDLP_PATH: process.env.YTDLP_PATH }
  delete process.env.DATABASE_URL
  process.env.MUSIC_DIR = path.join(dir, 'music')
  process.env.YTDLP_PATH = bin
  await writeFile(log, '')
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('fs'), path = require('path');
const dir = ${JSON.stringify(dir)}, args = process.argv.slice(2), id = args.at(-1).slice(-11);
const log = ${JSON.stringify(log)};
fs.appendFileSync(log, JSON.stringify({ type: 'start', id }) + '\\n');
const timer = setInterval(() => {
  if (!fs.existsSync(path.join(dir, id + '.release'))) return;
  clearInterval(timer);
  const calls = fs.readFileSync(log, 'utf8').trim().split('\\n').map(JSON.parse).filter(e => e.type === 'start' && e.id === id).length;
  const failures = id === 'rrrrrrrrrrr' ? 2 : id === 'ttttttttttt' ? 3 : 0;
  fs.appendFileSync(log, JSON.stringify({ type: 'end', id }) + '\\n');
  if (calls <= failures) { console.error('fallo temporal'); process.exit(1) }
  const out = args[args.indexOf('-o') + 1].replace('%(title)s.%(ext)s', id + '.mp3');
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, 'audio-' + id); console.log('PCT: 50%'); console.log('FILE:' + out);
}, 10);
`)
  await chmod(bin, 0o755)
  let queue
  const release = id => writeFile(path.join(dir, id + '.release'), '')
  const history = async () => (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)
  const starts = async () => (await history()).filter(e => e.type === 'start').map(e => e.id)
  const item = id => ({ id, title: id })
  const owner = 'owner'
  try {
    queue = await import('../services/queue.js')
    const add = ids => queue.enqueue(ids.map(item), null, owner)
    const ready = bid => until(() => queue.getBatch(bid, owner)?.ready)
    const blockers = await add(['xxxxxxxxxxx', 'yyyyyyyyyyy'])
    await until(async () => (await starts()).length === 2)
    const a = await add(['aaaaaaaaaaa', 'aaaaaaaaaaa', 'ccccccccccc'])
    const b = await add(['bbbbbbbbbbb', 'ddddddddddd'])
    const audio = await queue.preparePlayback('ppppppppppp', owner)
    await release('xxxxxxxxxxx')
    await until(async () => (await starts()).length === 3)
    assert.equal((await starts())[2], 'ppppppppppp')
    for (const [previous, expected] of [['ppppppppppp', 'aaaaaaaaaaa'], ['aaaaaaaaaaa', 'bbbbbbbbbbb'], ['bbbbbbbbbbb', 'ccccccccccc'], ['ccccccccccc', 'ddddddddddd']]) {
      const count = (await starts()).length
      await release(previous)
      await until(async () => (await starts()).length === count + 1)
      assert.equal((await starts()).at(-1), expected)
    }
    await release('ddddddddddd'); await release('yyyyyyyyyyy')
    await Promise.all([ready(blockers.bid), ready(a.bid), ready(b.bid), ready(audio.bid)])
    assert.equal((await starts()).filter(id => id === 'aaaaaaaaaaa').length, 1)
    assert.deepEqual(queue.getBatch(a.bid, owner).complete, 3)
    let active = 0
    for (const entry of await history()) { active += entry.type === 'start' ? 1 : -1; assert.ok(active <= 2 && active >= 0) }

    await release('rrrrrrrrrrr'); await release('ttttttttttt')
    const succeeds = await add(['rrrrrrrrrrr']), fails = await add(['ttttttttttt'])
    await until(() => queue.snapshot(owner).find(job => job.bid === fails.bid && job.status === 'queued' && job.attempts === 1 && job.nextAttemptAt > Date.now()))
    await release('ooooooooooo')
    const unrelated = await add(['ooooooooooo'])
    await ready(unrelated.bid)
    assert.equal(queue.getBatch(fails.bid, owner).ready, false)
    await Promise.all([ready(succeeds.bid), ready(fails.bid)])
    assert.equal(queue.getBatch(succeeds.bid, owner).complete, 1)
    const terminal = queue.snapshot(owner).find(job => job.bid === fails.bid)
    assert.equal(terminal.status, 'error'); assert.equal(terminal.attempts, 3); assert.equal(terminal.nextAttemptAt, null)
    assert.equal(await queue.retry(terminal.jid, 'other'), false)
    assert.equal(await queue.retry(terminal.jid, owner), true)
    await ready(fails.bid)
    assert.equal(queue.snapshot(owner).find(job => job.jid === terminal.jid).attempts, 1)

    const admitted = await Promise.all([add(Array(500).fill('zzzzzzzzzzz')), add(Array(500).fill('zzzzzzzzzzz')), add(['zzzzzzzzzzz'])])
    assert.equal(admitted[0].total, 500); assert.equal(admitted[1].total, 500); assert.equal(admitted[2], null)
    const playbackIds = Array.from({ length: 17 }, (_, i) => `p${String(i).padStart(10, '0')}`)
    const playback = await Promise.all(playbackIds.map(id => queue.preparePlayback(id, owner)))
    assert.ok(playback.slice(0, 16).every(Boolean)); assert.equal(playback[16], null)
    await Promise.all(['zzzzzzzzzzz', ...playbackIds].map(release))
    await Promise.all([...admitted.slice(0, 2), ...playback.slice(0, 16)].map(batch => ready(batch.bid)))
    assert.equal((await starts()).filter(id => id === 'zzzzzzzzzzz').length, 1)
    assert.equal(queue.getBatch(admitted[0].bid, owner).percent, 100)
  } finally {
    await queue?.shutdownQueue()
    for (const [name, value] of Object.entries(original)) { if (value === undefined) delete process.env[name]; else process.env[name] = value }
    await rm(dir, { recursive: true, force: true })
  }
})
