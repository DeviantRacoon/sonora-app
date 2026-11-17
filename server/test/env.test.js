import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

test('el arranque tolera .env ausente y respeta variables del despliegue', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'sonora-env-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const cwd = path.join(root, 'server'); mkdirSync(cwd)
  const loader = new URL('../env.js', import.meta.url).href
  const run = env => execFileSync(process.execPath, ['--import', loader, '-p', 'process.env.SONORA_ENV_TEST_VALUE || "missing"'], { cwd, env, encoding: 'utf8' }).trim()
  const env = { ...process.env }; delete env.SONORA_ENV_TEST_VALUE
  assert.equal(run(env), 'missing')
  writeFileSync(path.join(root, '.env'), 'SONORA_ENV_TEST_VALUE=local\n')
  assert.equal(run(env), 'local')
  assert.equal(run({ ...env, SONORA_ENV_TEST_VALUE: 'production' }), 'production')
})
