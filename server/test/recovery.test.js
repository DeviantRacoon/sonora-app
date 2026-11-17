import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, chmod, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
test('recupera trabajos interrumpidos y reutiliza el MP3 después de reiniciar', { timeout: 20000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sonora-recovery-'))
  const bin = path.join(dir, 'yt-dlp'), log = path.join(dir, 'calls')
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), id = args.at(-1).slice(-11), out = args[args.indexOf('-o') + 1].replace('%(title)s.%(ext)s', id + '.mp3');
fs.appendFileSync(${JSON.stringify(log)}, id + '\\n');
setTimeout(() => { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, 'audio-' + id); console.log('FILE:' + out) }, 500);
`)
  await chmod(bin, 0o755)
  const socket = createServer(); await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port; await new Promise((resolve) => socket.close(resolve))
  const base = `http://127.0.0.1:${port}`
  const device = '11111111-1111-4111-8111-111111111111'
  const fetch = (url, opts = {}) => globalThis.fetch(url, { ...opts, headers: { 'X-Sonora-Device': device, ...opts.headers } })
  let server
  const start = async () => {
    server = spawn(process.execPath, ['index.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), MUSIC_DIR: path.join(dir, 'music'), YTDLP_PATH: bin }, stdio: 'ignore' })
    for (let i = 0; i < 100; i++) { try { await fetch(`${base}/api/downloads/batches/missing/file`); return } catch { await delay(30) } }
    throw new Error('Servidor no inició')
  }
  const stop = async () => { if (server && server.exitCode === null) { const exited = new Promise((resolve) => server.once('exit', resolve)); server.kill(); await exited } }
  const add = async () => (await fetch(`${base}/api/downloads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ id: 'aaaaaaaaaaa', title: 'Canción' }] }) })).json()
  const waitForFile = async (bid) => {
    for (let i = 0; i < 150; i++) { const response = await fetch(`${base}/api/downloads/batches/${bid}/file`); if (response.ok) return response.text(); await delay(30) }
    throw new Error('Descarga no terminó')
  }
  try {
    await start()
    const batch = await add()
    for (let i = 0; i < 100; i++) { try { await readFile(log); break } catch { await delay(20) } }
    await stop(); await start()
    assert.equal(await waitForFile(batch.bid), 'audio-aaaaaaaaaaa')
    const second = await add()
    assert.equal(await waitForFile(second.bid), 'audio-aaaaaaaaaaa')
    assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 2)
    await stop(); await start()
    assert.equal(await waitForFile(batch.bid), 'audio-aaaaaaaaaaa')
    const post = (count) => fetch(`${base}/api/downloads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: Array.from({ length: count }, () => ({ id: 'bbbbbbbbbbb' })) }) })
    assert.equal((await post(200)).status, 200)
    assert.equal((await post(200)).status, 200)
    assert.equal((await post(100)).status, 200)
    assert.equal((await post(1)).status, 429)
  } finally { await stop(); await rm(dir, { recursive: true, force: true }) }
})
