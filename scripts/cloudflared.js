import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const binary = [
  resolve(root, 'bin/cloudflared.exe'),
  resolve(root, 'bin/cloudflared'),
].find(existsSync) || (process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared')

const child = spawn(binary, process.argv.slice(2), { stdio: 'inherit' })
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
