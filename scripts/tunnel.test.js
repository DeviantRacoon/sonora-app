import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'

const exec = promisify(execFile)
async function fixture(t, body) {
  const root = await mkdtemp(join(tmpdir(), 'sonora-tunnel-'))
  await mkdir(join(root, 'scripts'))
  await copyFile(new URL('./tunnel.js', import.meta.url), join(root, 'scripts/tunnel.mjs'))
  await writeFile(join(root, 'bun'), `#!/usr/bin/env node\n${body}`, { mode: 0o700 })
  const run = (...args) => exec(process.execPath, [join(root, 'scripts/tunnel.mjs'), ...args], { env: { ...process.env, SONORA_SKIP_PREFLIGHT: '1', PATH: `${root}:${process.env.PATH}` }, timeout: 6000 })
  t.after(async () => { await run('--stop'); await rm(root, { recursive: true, force: true }) })
  return { root, run }
}

test('devuelve la terminal, conserva el proceso y URL, y permite detenerlo', async t => {
  const { root, run } = await fixture(t, `console.log('https://sonora-test.trycloudflare.com'); console.log('Registered tunnel connection'); setInterval(() => console.log('watch tick'), 100)`)
  const first = await run()
  assert.match(first.stdout, /en segundo plano/)
  assert.match(first.stdout, /https:\/\/sonora-test.trycloudflare.com/)
  const pid = await readFile(join(root, '.tunnel/tunnel.pid'), 'utf8')
  const again = await run()
  assert.match(again.stdout, /ya está en segundo plano/)
  assert.equal(await readFile(join(root, '.tunnel/tunnel.pid'), 'utf8'), pid)
  await setTimeout(150)
  assert.match(await readFile(join(root, '.tunnel/tunnel.log'), 'utf8'), /watch tick/)
  assert.match((await run('--stop')).stdout, /túnel detenido/)
  await assert.rejects(readFile(join(root, '.tunnel/tunnel.pid')), { code: 'ENOENT' })
  assert.match((await run('--stop')).stdout, /túnel detenido/)
})

test('informa fallos de arranque y elimina el PID obsoleto', async t => {
  const { root, run } = await fixture(t, `console.error('build failed'); process.exit(1)`)
  await mkdir(join(root, '.tunnel'))
  await writeFile(join(root, '.tunnel/tunnel.pid'), 'invalid')
  await assert.rejects(run(), error => error.code === 1 && /No se pudo iniciar el túnel/.test(error.stderr))
  assert.match(await readFile(join(root, '.tunnel/tunnel.log'), 'utf8'), /build failed/)
  await assert.rejects(readFile(join(root, '.tunnel/tunnel.pid')), { code: 'ENOENT' })
})

test('sugiere la causa probable cuando el arranque falla', async t => {
  const { run } = await fixture(t, `console.error('tls: failed to verify certificate: x509: certificate signed by unknown authority'); process.exit(1)`)
  await assert.rejects(run(), error => /Posibles causas/.test(error.stderr) && /inspecciona TLS/.test(error.stderr))
})
