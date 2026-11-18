import { apiUrl } from './api.js'
let creating
function storage(key, value) {
  try { if (value === undefined) return localStorage.getItem(key); value === null ? localStorage.removeItem(key) : localStorage.setItem(key,value) } catch { return null }
}
export const personalizationEnabled = () => storage('sonora-personalization') !== 'off'
export async function profileRequest(path, method = 'GET', body) {
  let token = storage('sonora-profile')
  if (!token) {
    if (!personalizationEnabled()) throw new Error('Personalización desactivada')
    creating ||= fetch(apiUrl('/api/profile'), { method: 'POST' }).then(async r => {
      if (!r.ok) throw new Error('Personalización no disponible')
      const { token } = await r.json(); storage('sonora-profile',token)
      if (storage('sonora-profile') !== token) throw new Error('Almacenamiento no disponible')
      return token
    }).finally(() => { creating = null })
    token = await creating
  }
  const response = await fetch(apiUrl(`/api${path}`), { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type':'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  if (response.status === 401) storage('sonora-profile',null)
  if (!response.ok) throw new Error('Personalización no disponible')
  return response.json()
}
export function recordTaste(track, kind, weight = 1) {
  if (personalizationEnabled()) profileRequest('/profile/events','POST',{ eventId: crypto.randomUUID(), track: { id:track.id,title:track.title,channel:track.channel || '' },kind,weight }).catch(() => {})
}
export function recordDownloads(items) {
  if (!items.length || !personalizationEnabled()) return
  return profileRequest('/profile/events/batch', 'POST', { events: items.map(track => ({
    eventId: crypto.randomUUID(), track: { id: track.id, title: track.title.slice(0, 500), channel: (track.channel || '').slice(0, 300) },
    kind: 'download', weight: Math.min(3, 3 / items.length),
  })) }).catch(() => {})
}
export async function setPersonalization(enabled) {
  if (storage('sonora-profile')) await profileRequest('/profile','PATCH',{ enabled })
  storage('sonora-personalization',enabled ? 'on' : 'off')
}
export async function eraseProfile() {
  if (storage('sonora-profile')) await profileRequest('/profile','DELETE')
  storage('sonora-profile',null); storage('sonora-personalization','off')
}
