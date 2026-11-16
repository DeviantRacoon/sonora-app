import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const bin = fileURLToPath(new URL('./bin/', import.meta.url))
process.env.MUSIC_DIR = path.join(tmpdir(), 'sonora')
process.env.YTDLP_PATH = path.join(bin, 'yt-dlp')
process.env.YTDLP_JS_RUNTIME = '1'
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`

await import('../../server/index.js')
