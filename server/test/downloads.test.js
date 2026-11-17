import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('entrega lotes, gestiona fallos parciales y reintentos', { timeout: 20000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sonora-test-'))
  const bin = path.join(dir, 'yt-dlp')
  const marker = path.join(dir, 'retry')
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const args = process.argv.slice(2), id = args.at(-1).slice(-11), out = args[args.indexOf('-o') + 1].replace('%(title)s.%(ext)s', id + '.mp3');
if (id === 'bbbbbbbbbbb' && !fs.existsSync(${JSON.stringify(marker)})) { console.error('error simulado'); process.exit(1) }
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, 'audio-' + id); console.log('PCT: 50%'); console.log('FILE:' + out);
`)
  await chmod(bin, 0o755)
  const socket = createServer()
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  const server = spawn(process.execPath, ['index.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), MUSIC_DIR: path.join(dir, 'music'), YTDLP_PATH: bin }, stdio: 'ignore' })
  const base = `http://127.0.0.1:${port}`
  const device = '11111111-1111-4111-8111-111111111111'
  const fetch = (url, opts = {}) => globalThis.fetch(url, { ...opts, headers: { 'X-Sonora-Device': device, ...opts.headers } })
  try {
    for (let i = 0; i < 100; i++) { try { await fetch(`${base}/api/downloads/batches/missing/file`); break } catch { await delay(50) } }
    assert.equal((await globalThis.fetch(`${base}/api/downloads`)).status, 401)
    const other = { 'X-Sonora-Device': '22222222-2222-4222-8222-222222222222' }
    const stream = await fetch(`${base}/api/downloads/stream`)
    const reader = stream.body.getReader()
    const decoder = new TextDecoder()
    let buffer = '', events = []
    const until = async (predicate) => {
      for (;;) {
        const found = events.find(predicate)
        if (found) return found
        const { value, done } = await reader.read()
        if (done) throw new Error('Stream cerrado')
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n'); buffer = parts.pop()
        for (const part of parts) if (part.startsWith('data: ')) events.push(JSON.parse(part.slice(6)))
      }
    }
    const add = async (items) => (await fetch(`${base}/api/downloads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })).json()
    const item = (id) => ({ id, title: `Canción ${id}` })
    const single = await add([item('aaaaaaaaaaa')])
    await until((e) => e.bid === single.bid && e.type === 'batch' && e.ready)
    const snapshot = await (await fetch(`${base}/api/downloads`)).json()
    assert.ok(snapshot.batches.some((batch) => batch.bid === single.bid && batch.ready))
    assert.ok(snapshot.jobs.some((job) => job.bid === single.bid && job.status === 'done'))
    let response = await fetch(`${base}/api/downloads/batches/${single.bid}/file`)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-disposition'), /\.mp3/)
    assert.equal(await response.text(), 'audio-aaaaaaaaaaa')
    const foreign = await (await fetch(`${base}/api/downloads`, { method: 'POST', headers: { ...other, 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [item('ccccccccccc')] }) })).json()
    const otherSnapshot = await (await fetch(`${base}/api/downloads`, { headers: other })).json()
    assert.ok(otherSnapshot.batches.every(batch => batch.bid !== single.bid))
    assert.equal((await fetch(`${base}/api/downloads/batches/${single.bid}/file`, { headers: other })).status, 404)
    const group = await add([item('aaaaaaaaaaa'), item('bbbbbbbbbbb')])
    const partial = await until((e) => e.bid === group.bid && e.type === 'batch' && e.ready)
    assert.equal(partial.failed, 1); assert.equal(partial.complete, 1)
    response = await fetch(`${base}/api/downloads/batches/${group.bid}/file`)
    assert.equal(response.status, 200); assert.match(response.headers.get('content-disposition'), /\.zip/)
    const zip = Buffer.from(await response.arrayBuffer())
    assert.equal(zip.readUInt32LE(0), 0x04034b50); assert.ok(zip.includes(Buffer.from('audio-aaaaaaaaaaa')))
    const failed = await until((e) => e.bid === group.bid && e.type === 'job' && e.status === 'error')
    assert.deepEqual(await (await fetch(`${base}/api/downloads/${failed.jid}/retry`, { method: 'POST', headers: other })).json(), { ok: false })
    assert.ok(events.every(event => event.bid !== foreign.bid))
    assert.equal((await fetch(`${base}/api/audio/bbbbbbbbbbb`)).status, 502)
    await writeFile(marker, '')
    await fetch(`${base}/api/downloads/${failed.jid}/retry`, { method: 'POST' })
    events = events.filter((e) => !(e.type === 'batch' && e.bid === group.bid && e.ready))
    await until((e) => e.type === 'batch' && e.bid === group.bid && e.ready && e.complete === 2)
    response = await fetch(`${base}/api/downloads/batches/${group.bid}/file`)
    const zipAfterRetry = Buffer.from(await response.arrayBuffer())
    assert.ok(zipAfterRetry.includes(Buffer.from('audio-aaaaaaaaaaa')) && zipAfterRetry.includes(Buffer.from('audio-bbbbbbbbbbb')))
    assert.equal((await fetch(`${base}/api/downloads/batches/..%2F..%2Fetc/file`)).status, 404)
    response = await fetch(`${base}/api/audio/aaaaaaaaaaa`, { headers: { Range: 'bytes=0-4' } })
    assert.equal(response.status, 206)
    assert.equal(response.headers.get('content-type'), 'audio/mpeg')
    assert.equal(await response.text(), 'audio')
    response = await fetch(`${base}/api/audio/ddddddddddd`)
    assert.equal(await response.text(), 'audio-ddddddddddd')
    response = await fetch(`${base}/api/audio/aaaaaaaaaaa`)
    assert.equal(await response.text(), 'audio-aaaaaaaaaaa')
    const afterPlayback = await (await fetch(`${base}/api/downloads`)).json()
    assert.equal(afterPlayback.batches.length, 2)
    assert.ok(afterPlayback.batches.every(batch => batch.bid !== foreign.bid))
    const reconnected = await fetch(`${base}/api/downloads/stream`)
    const reconnectReader = reconnected.body.getReader()
    const initial = new TextDecoder().decode((await reconnectReader.read()).value)
    assert.ok(!initial.includes(foreign.bid))
    await reconnectReader.cancel()
    assert.equal((await fetch(`${base}/api/audio/invalid`)).status, 400)
    await reader.cancel()
  } finally {
    server.kill()
    await new Promise((resolve) => server.on('exit', resolve))
    await rm(dir, { recursive: true, force: true })
  }
})
