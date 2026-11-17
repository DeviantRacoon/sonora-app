import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { once } from 'node:events'
import { Pool } from 'pg'
import { profileRoutes } from '../services/profiles.js'

test('perfiles aislados, preferencias, eventos y borrado persistente', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  const app = express(); app.use(express.json()); app.use('/api',await profileRoutes())
  const server = app.listen(0,'127.0.0.1'); await once(server,'listening')
  t.after(() => server.close())
  const call = async (path, method='GET', token, body) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {method, headers: {'Content-Type':'application/json',...(token ? {Authorization:`Bearer ${token}`} : {})},...(body ? {body:JSON.stringify(body)} : {})})
    return {status:r.status, body: await r.json()}
  }
  const a = (await call('/profile','POST')).body.token, b = (await call('/profile','POST')).body.token
  const track = {id:'abcdefghijk',title:'Artist - Song',channel:'Artist - Topic'}
  assert.equal((await call('/recommendations')).status,401)
  assert.equal((await call('/profile/preferences/abcdefghijk','PUT',a,{track,kind:'like'})).status,200)
  assert.equal((await call('/recommendations','GET',a)).body.preferences.abcdefghijk,'like')
  assert.deepEqual((await call('/recommendations','GET',b)).body.preferences,{})
  const event = {track,kind:'play',eventId:crypto.randomUUID()}
  await call('/profile/events','POST',a,event); await call('/profile/events','POST',a,event)
  const pool = new Pool({connectionString:process.env.TEST_DATABASE_URL})
  assert.equal(Number((await pool.query('SELECT count(*) FROM taste_events')).rows[0].count),1)
  await call('/profile','PATCH',a,{enabled:false})
  assert.equal((await call('/recommendations','GET',a)).body.state,'disabled')
  await call('/profile','DELETE',a)
  assert.equal((await call('/recommendations','GET',a)).status,401)
  assert.equal(Number((await pool.query('SELECT count(*) FROM taste_events')).rows[0].count),0)
  await call('/profile','DELETE',b)
  await pool.end()
})
