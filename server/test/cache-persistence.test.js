import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'

const exec = promisify(execFile)
const moduleUrl = new URL('../services/cache.js', import.meta.url).href
const run = (database, script) => exec(process.execPath, ['--input-type=module', '-e', `import { cached, closeCache } from ${JSON.stringify(moduleUrl)}; ${script}; await closeCache()`], {
  env: { ...process.env, DATABASE_URL: database }, timeout: 20_000,
})

test('la caché conserva respuestas entre procesos, expira y acota PostgreSQL', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
  const schema = `cache_${randomUUID().replaceAll('-', '')}`
  await pool.query(`CREATE SCHEMA ${schema}`)
  t.after(async () => { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end() })
  const database = new URL(process.env.TEST_DATABASE_URL)
  database.searchParams.set('options', `-c search_path=${schema}`)
  const connection = database.href
  await run(connection, `await cached('persistent', () => ({ tracks: [1, 2] }))`)
  const hit = await run(connection, `console.log(JSON.stringify(await cached('persistent', () => { throw Error('proveedor repetido') })))`)
  assert.deepEqual(JSON.parse(hit.stdout), { tracks: [1, 2] })
  await pool.query(`UPDATE ${schema}.response_cache SET expires_at = now() - interval '1 second'`)
  const expired = await run(connection, `console.log(JSON.stringify(await cached('persistent', () => ({ fresh: true }))))`)
  assert.deepEqual(JSON.parse(expired.stdout), { fresh: true })
  await run(connection, `await cached('partial', () => ({ partial: true })); await cached('oversize', () => ({ text: 'x'.repeat(1024 * 1024) }))`)
  assert.equal((await pool.query(`SELECT count(*)::int AS count FROM ${schema}.response_cache WHERE key IN ('partial', 'oversize')`)).rows[0].count, 0)
  await pool.query(`INSERT INTO ${schema}.response_cache SELECT 'seed-' || n, '{}'::jsonb, now() + interval '5 minutes', 2 FROM generate_series(1, 2001) n`)
  await run(connection, `await cached('trim', () => ({ ok: true }))`)
  assert.equal((await pool.query(`SELECT count(*)::int AS count FROM ${schema}.response_cache`)).rows[0].count, 2000)
  await pool.query(`UPDATE ${schema}.response_cache SET size_bytes = 1048576`)
  await run(connection, `await cached('trim-bytes', () => ({ ok: true }))`)
  assert.ok(Number((await pool.query(`SELECT sum(size_bytes) AS bytes FROM ${schema}.response_cache`)).rows[0].bytes) <= 64 * 1024 * 1024)
})

test('un fallo PostgreSQL conserva el resultado en memoria', async () => {
  const { stdout } = await run('postgres://invalid:invalid@127.0.0.1:1/invalid', `
    let calls = 0;
    await cached('offline', () => ({ calls: ++calls }));
    console.log(JSON.stringify(await cached('offline', () => ({ calls: ++calls }))));
  `)
  assert.deepEqual(JSON.parse(stdout), { calls: 1 })
})
