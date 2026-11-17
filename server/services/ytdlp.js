// Único punto de contacto con yt-dlp. Todo se ejecuta con spawn (sin shell).
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { mkdir, realpath, stat } from 'node:fs/promises'

const binDir = path.resolve(import.meta.dirname, '../../bin')
const localBin = [
  path.join(binDir, 'yt-dlp.exe'),
  path.join(binDir, 'yt-dlp'),
].find(existsSync)
const BIN = process.env.YTDLP_PATH || localBin || 'yt-dlp'

const localFfmpeg = [
  path.join(binDir, 'ffmpeg.exe'),
  path.join(binDir, 'ffmpeg'),
].find(existsSync)
const ffmpegArgs = localFfmpeg ? ['--ffmpeg-location', binDir] : []
const jsRuntime = process.env.YTDLP_JS_RUNTIME ? ['--js-runtimes', `node:${process.execPath}`] : []
export const MUSIC_DIR = process.env.MUSIC_DIR || fileURLToPath(new URL('../../music', import.meta.url))
export const isVideoId = (s) => typeof s === 'string' && /^[\w-]{11}$/.test(s)
export const isPlaylistId = (s) => typeof s === 'string' && /^[\w-]{12,64}$/.test(s)
export const safeName = (s) => String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '').trim().slice(0, 100) || 'Album'

const children = new Set()
process.on('exit', () => { for (const child of children) child.kill('SIGKILL') })
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0))

const pending = []
let running = 0
async function querySlot(fn) {
  if (running >= 4) await new Promise((resolve) => pending.push(resolve))
  else running++
  try { return await fn() } finally {
    if (pending.length) pending.shift()()
    else running--
  }
}

function processResult(p, timeout, onStdout, maxOutput = Infinity) {
  return new Promise((resolve, reject) => {
    children.add(p)
    let err = '', size = 0, failure
    const stop = (message) => { if (!failure) { failure = new Error(message); p.kill('SIGKILL') } }
    const timer = setTimeout(() => stop('Tiempo de espera agotado'), timeout)
    p.stdout.on('data', (d) => {
      size += d.length
      if (size > maxOutput) return stop('Respuesta de yt-dlp demasiado grande')
      onStdout(d)
    })
    p.stderr.on('data', (d) => {
      size += d.length
      if (size > maxOutput) return stop('Respuesta de yt-dlp demasiado grande')
      err = (err + d).slice(-8192)
    })
    p.on('error', (e) => { failure ||= new Error(e.code === 'ENOENT' ? `yt-dlp no encontrado (${BIN})` : e.message) })
    p.on('close', (c) => {
      clearTimeout(timer)
      children.delete(p)
      if (failure) reject(failure)
      else if (c !== 0) reject(new Error(err.trim().split('\n').pop() || `yt-dlp salió con ${c}`))
      else resolve()
    })
  })
}

function json(args) {
  return querySlot(async () => {
    const p = spawn(BIN, [...args, ...jsRuntime, '-J', '--flat-playlist', '--no-warnings'])
    let out = ''
    await processResult(p, 60_000, (d) => { out += d }, 10 * 1024 * 1024)
    try { return JSON.parse(out) } catch { throw new Error('Respuesta inválida de yt-dlp') }
  })
}
const thumb = (e) => e.thumbnails?.at(-1)?.url || (isVideoId(e.id) ? `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg` : null)
const track = (e, i) => ({ id: e.id, title: e.title, channel: e.channel || e.uploader || '', duration: e.duration || null, thumb: thumb(e), index: i + 1 })

export async function search(q) {
  const enc = encodeURIComponent(q)
  let partial = false
  const [v, p] = await Promise.all([
    json([`ytsearch20:${q}`]),
    json([`https://www.youtube.com/results?search_query=${enc}&sp=EgIQAw%253D%253D`]).catch((e) => { partial = true; console.error('Error buscando playlists:', e.message); return { entries: [] } }),
  ])
  return { videos: (v.entries || []).filter((e) => isVideoId(e.id)).map(track), playlists: (p.entries || []).filter((e) => e.id && !isVideoId(e.id) && isPlaylistId(e.id)).map((e) => ({ id: e.id, title: e.title, channel: e.channel || e.uploader || '', count: e.playlist_count ?? null, thumb: thumb(e) })), partial }
}

export async function playlist(id) {
  const d = await json(['--playlist-end', '201', `https://www.youtube.com/playlist?list=${id}`])
  const entries = d.entries || []
  return { id, title: d.title, tracks: entries.slice(0, 200).filter((e) => isVideoId(e.id)).map(track), truncated: entries.length > 200 || d.playlist_count > 200 }
}

export async function download({ id, directory }, onProgress) {
  await mkdir(directory, { recursive: true })
  const p = spawn(BIN, [...jsRuntime, ...ffmpegArgs, '-x', '--audio-format', 'mp3', '--audio-quality', '320K', '--embed-thumbnail', '--embed-metadata', '--no-playlist', '--newline', '--progress', '--progress-template', 'PCT:%(progress._percent_str)s', '--print', 'after_move:FILE:%(filepath)s', '-o', path.join(directory, '%(title)s.%(ext)s'), `https://www.youtube.com/watch?v=${id}`])
  let out = '', file = ''
  await processResult(p, 30 * 60_000, (d) => {
    out += d
    const lines = out.split(/\r?\n/)
    out = lines.pop().slice(-8192)
    for (const line of lines) {
      const m = /^PCT:\s*([\d.]+)%/.exec(line)
      if (m) onProgress(Math.min(100, Math.max(0, Number(m[1]))))
      if (line.startsWith('FILE:')) file = line.slice(5)
    }
  })
  if (out.startsWith('FILE:')) file = out.slice(5)
  const root = await realpath(directory)
  const resolved = file && await realpath(file)
  if (!resolved || path.dirname(resolved) !== root || path.extname(resolved).toLowerCase() !== '.mp3' || !(await stat(resolved)).isFile()) throw new Error('No se encontró el MP3 generado')
  return resolved
}
