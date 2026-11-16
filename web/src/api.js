import { useEffect, useState } from 'react'

async function req(url, opts) {
  const r = await fetch(url, opts)
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
export const batchFileUrl = (bid) => `/api/downloads/batches/${encodeURIComponent(bid)}/file`
export const retryApi = (jid) => req(`/api/downloads/${jid}/retry`, { method: 'POST' })

export const fmt = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '')

// El servidor envía una instantánea completa al conectar o reconectar.
export function useJobs() {
  const [state, setState] = useState({ jobs: {}, batches: {} })
  useEffect(() => {
    const es = new EventSource('/api/downloads/stream')
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
