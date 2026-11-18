import { cached } from './cache.js'
import { search } from './ytdlp.js'

let nextCall = Promise.resolve()
async function metadata(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await (nextCall = nextCall.catch(() => {}).then(async () => {
        await new Promise(resolve => setTimeout(resolve, 1200))
        return fetch(url, { headers: { 'User-Agent': process.env.MUSIC_USER_AGENT || 'Sonora/1.0 (local development)' }, signal: AbortSignal.timeout(10000) })
      }))
      if (response.status === 503 && attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        continue
      }
      if (!response.ok) throw new Error(`Proveedor musical: ${response.status}`)
      return await response.json()
    } catch (e) {
      if (attempt === retries) throw e
    }
  }
}
export function artistHint(track) {
  const title = track.title || ''
  if (title.includes(' - ')) return title.split(' - ')[0].trim()
  if (/ - Topic$/.test(track.channel || '')) return track.channel.replace(/ - Topic$/, '')
  return null
}
export function chooseTracks(candidates, excluded) {
  const seen = new Set(excluded), artists = new Map(), result = []
  for (const track of candidates) {
    const artist = track.artist || track.channel
    if (seen.has(track.id) || (artists.get(artist) || 0) >= 2) continue
    seen.add(track.id); artists.set(artist, (artists.get(artist) || 0) + 1); result.push(track)
    if (result.length === 12) break
  }
  return result
}
export async function buildRecommendations(seeds, excluded) {
  const names = [...new Set(seeds.map(artistHint).filter(Boolean))].slice(0, 3)
  const familiar = [], discovery = []
  for (const name of names) {
    const artists = await cached(`artist:${name}`, () => metadata(`https://musicbrainz.org/ws/2/artist/?fmt=json&limit=5&query=${encodeURIComponent('artist:"' + name.replace(/["\\]/g, '') + '"')}`))
    const matches = artists.artists?.filter(a => a.name.toLowerCase() === name.toLowerCase()) || []
    if (matches.length !== 1) continue
    const radio = await cached(`radio:${matches[0].id}`, () => metadata(`https://api.listenbrainz.org/1/lb-radio/artist/${matches[0].id}?mode=easy&max_similar_artists=4&max_recordings_per_artist=2&pop_begin=0&pop_end=100`))
    const related = [...new Set(Object.values(radio).flat().map(r => r.similar_artist_name).filter(Boolean))].filter(n => n.toLowerCase() !== name.toLowerCase()).slice(0, 3)
    for (const artist of [name, ...related]) {
      const data = await cached(`recommend-search:${artist}`, () => search(`${artist} official audio`))
      const tracks = data.videos.filter(t => `${t.title} ${t.channel}`.toLowerCase().includes(artist.toLowerCase())).slice(0, 4).map(t => ({ ...t, artist, reason: `Por tu interés en ${name}` }))
      ;(artist === name ? familiar : discovery).push(...tracks)
    }
  }
  const known = chooseTracks(familiar, excluded).slice(0, 6)
  const fresh = chooseTracks(discovery, excluded).slice(0, 6)
  return chooseTracks(Array.from({ length: 6 }, (_, i) => [known[i], fresh[i]]).flat().filter(Boolean), excluded)
}
