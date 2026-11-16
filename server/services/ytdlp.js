// Único punto de contacto con yt-dlp. Todo se ejecuta con spawn (sin shell).
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { mkdir, realpath, stat } from 'node:fs/promises'

const BIN = process.env.YTDLP_PATH || 'yt-dlp'
export const MUSIC_DIR = process.env.MUSIC_DIR || fileURLToPath(new URL('../../music', import.meta.url))

export const isVideoId = (s) => /^[\w-]{11}$/.test(s)
export const isPlaylistId = (s) => /^[\w-]{12,64}$/.test(s)
// Evita traversal y caracteres inválidos en nombres de carpeta/archivo
export const safeName = (s) =>
  String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '').trim().slice(0, 100) || 'Album'

function json(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(BIN, [...args, '-J', '--flat-playlist', '--no-warnings'])
    let out = '', err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('error', (e) => reject(new Error(e.code === 'ENOENT' ? `yt-dlp no encontrado (${BIN})` : e.message)))
    p.on('close', (c) => {
      if (c !== 0) return reject(new Error(err.trim().split('\n').pop() || `yt-dlp salió con ${c}`))
      try { resolve(JSON.parse(out)) } catch { reject(new Error('Respuesta inválida de yt-dlp')) }
    })
  })
}

const thumb = (e) => e.thumbnails?.at(-1)?.url || (isVideoId(e.id) ? `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg` : null)
const track = (e, i) => ({
  id: e.id, title: e.title, channel: e.channel || e.uploader || '', duration: e.duration || null, thumb: thumb(e), index: i + 1,
})

export async function search(q) {
  const enc = encodeURIComponent(q)
  // sp=EgIQAw%3D%3D filtra resultados de YouTube a playlists
  const [v, p] = await Promise.all([
    json([`ytsearch20:${q}`]),
    json([`https://www.youtube.com/results?search_query=${enc}&sp=EgIQAw%253D%253D`]).catch(() => ({ entries: [] })),
  ])
  return {
    videos: (v.entries || []).filter((e) => isVideoId(e.id)).map(track),
    playlists: (p.entries || [])
      .filter((e) => e.id && !isVideoId(e.id) && isPlaylistId(e.id))
      .map((e) => ({ id: e.id, title: e.title, channel: e.channel || e.uploader || '', count: e.playlist_count ?? null, thumb: thumb(e) })),
  }
}

export async function playlist(id) {
  const d = await json([`https://www.youtube.com/playlist?list=${id}`])
  return { id, title: d.title, tracks: (d.entries || []).filter((e) => isVideoId(e.id)).map(track) }
}

// Cada trabajo escribe en su propia carpeta para evitar colisiones entre lotes.
export async function download({ id, directory }, onProgress) {
  await mkdir(directory, { recursive: true })
  const p = spawn(BIN, [
    '-x', '--audio-format', 'mp3', '--audio-quality', '320K',
    '--embed-thumbnail', '--embed-metadata', '--no-playlist', '--newline', '--progress',
    '--progress-template', 'PCT:%(progress._percent_str)s',
    '--print', 'after_move:FILE:%(filepath)s',
    '-o', path.join(directory, '%(title)s.%(ext)s'),
    `https://www.youtube.com/watch?v=${id}`,
  ])
  let out = '', err = ''
  p.stdout.on('data', (d) => {
    out += d
    const lines = out.split(/\r?\n/)
    out = lines.pop()
    for (const line of lines) {
      const m = /^PCT:\s*([\d.]+)%/.exec(line)
      if (m) onProgress(Math.min(100, Math.max(0, Number(m[1]))))
      if (line.startsWith('FILE:')) file = line.slice(5)
    }
  })
  let file = ''
  p.stderr.on('data', (d) => { err = (err + d).slice(-8192) })
  await new Promise((resolve, reject) => {
    p.on('error', (e) => reject(new Error(e.code === 'ENOENT' ? `yt-dlp no encontrado (${BIN})` : e.message)))
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(err.trim().split('\n').pop() || `código ${c}`))))
  })
  if (out.startsWith('FILE:')) file = out.slice(5)
  const root = await realpath(directory)
  const resolved = file && await realpath(file)
  if (!resolved || path.dirname(resolved) !== root || path.extname(resolved).toLowerCase() !== '.mp3' || !(await stat(resolved)).isFile()) throw new Error('No se encontró el MP3 generado')
  return resolved
}
