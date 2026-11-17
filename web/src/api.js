import { useEffect, useState } from 'react'

export const apiUrl = (path) => `${(import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '')}${path}`

function newDeviceId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
let device
export function deviceId() {
  if (device) return device
  try {
    device = localStorage.getItem('sonora-device')
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(device || '')) {
      device = newDeviceId()
      localStorage.setItem('sonora-device', device)
    }
  } catch { device = newDeviceId() }
  return device
}
export const deviceUrl = path => apiUrl(`${path}${path.includes('?') ? '&' : '?'}device=${encodeURIComponent(deviceId())}`)
export const audioUrl = id => deviceUrl(`/api/audio/${encodeURIComponent(id)}`)

async function req(url, opts) {
  const r = await fetch(apiUrl(url), { ...opts, headers: { ...opts?.headers, 'X-Sonora-Device': deviceId() } })
  if (!r.headers.get('content-type')?.includes('application/json'))
    throw new Error('No se pudo conectar con la API. Comprueba la configuración del servidor.')
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Error')
  return d
}
export const searchApi = (q) => req(`/api/search?q=${encodeURIComponent(q)}`)
export const playlistApi = (id) => req(`/api/playlist?id=${encodeURIComponent(id)}`)
export const downloadApi = (items, album) =>
  req('/api/downloads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, album }) })
export const batchFileUrl = (bid) => deviceUrl(`/api/downloads/batches/${encodeURIComponent(bid)}/file`)
export const retryApi = (jid) => req(`/api/downloads/${jid}/retry`, { method: 'POST' })

export const fmt = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '')

// El servidor envía una instantánea completa al conectar o reconectar.
export function useJobs() {
  const [state, setState] = useState({ jobs: {}, batches: {} })
  useEffect(() => {
    if (location.hostname.endsWith('.trycloudflare.com')) {
      let active = true
      const poll = async () => {
        try {
          const data = await req('/api/downloads', { cache: 'no-store' })
          if (active) setState({ jobs: Object.fromEntries(data.jobs.map((job) => [job.jid, job])), batches: Object.fromEntries(data.batches.map((batch) => [batch.bid, batch])) })
        } catch { /* Retry on the next interval. */ }
      }
      poll()
      const timer = setInterval(poll, 2000)
      return () => { active = false; clearInterval(timer) }
    }
    const es = new EventSource(deviceUrl('/api/downloads/stream'))
    es.onopen = () => setState({ jobs: {}, batches: {} })
    es.onmessage = (e) => {
      const item = JSON.parse(e.data)
      if (item.type === 'job') setState((p) => ({ ...p, jobs: { ...p.jobs, [item.jid]: item } }))
      if (item.type === 'batch') setState((p) => ({ ...p, batches: { ...p.batches, [item.bid]: item } }))
      if (item.type === 'batch_removed') setState((p) => ({ jobs: Object.fromEntries(Object.entries(p.jobs).filter(([, job]) => job.bid !== item.bid)), batches: Object.fromEntries(Object.entries(p.batches).filter(([bid]) => bid !== item.bid)) }))
    }
    return () => es.close()
  }, [])
  return { jobs: Object.values(state.jobs).sort((a, b) => b.jid - a.jid), batches: Object.values(state.batches).reverse() }
}
