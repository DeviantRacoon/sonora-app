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
  const events = Array.from({ length: 500 }, (_, i) => ({ eventId: crypto.randomUUID(), kind: 'download', weight: 3 / 500, track: { ...track, id: String(i).padStart(11, '0') } }))
  assert.equal((await call('/profile/events/batch', 'POST', undefined, { events })).status, 401)
  assert.equal((await call('/profile/events/batch', 'POST', a, { events: [...events, events[0]] })).status, 400)
  assert.equal((await call('/profile/events/batch', 'POST', a, { events: [events[0], { ...events[1], weight: 4 }] })).status, 400)
  assert.equal(Number((await pool.query('SELECT count(*) FROM taste_events')).rows[0].count), 1)
  assert.equal((await call('/profile/events/batch', 'POST', a, { events })).status, 200)
  assert.equal((await call('/profile/events/batch', 'POST', a, { events })).status, 200)
  assert.equal(Number((await pool.query('SELECT count(*) FROM taste_events')).rows[0].count), 501)
  assert.ok(Math.abs(Number((await pool.query("SELECT sum(weight) FROM taste_events WHERE kind='download'")).rows[0].sum) - 3) < 0.0001)
  await call('/profile','PATCH',a,{enabled:false})
  assert.equal((await call('/profile/events/batch', 'POST', a, { events: [{ ...events[0], track }] })).status, 200)
  assert.equal(Number((await pool.query('SELECT count(*) FROM taste_events')).rows[0].count), 501)
  assert.equal((await call('/recommendations','GET',a)).body.state,'disabled')
  await call('/profile','DELETE',a)
  assert.equal((await call('/recommendations','GET',a)).status,401)
  assert.equal(Number((await pool.query('SELECT count(*) FROM taste_events')).rows[0].count),0)
  await call('/profile','DELETE',b)
  await pool.end()
})
