import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'

const root = resolve(import.meta.dirname, '..')
const directory = resolve(root, '.tunnel')
const log = resolve(directory, 'tunnel.log')
const pidFile = resolve(directory, 'tunnel.pid')
mkdirSync(directory, { recursive: true })

const alive = pid => {
  if (!Number.isInteger(pid) || pid <= 1) return false
  try { process.kill(pid, 0); return true } catch (error) {
    if (error.code !== 'ESRCH') throw error
    return false
  }
}
const output = () => existsSync(log) ? readFileSync(log, 'utf8') : ''
const summary = (state, pid) => {
  const url = output().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0]
  console.log(`\nSonora · ${state}\n  URL: ${url || 'pendiente; consulta el log'}\n  PID: ${pid}\n  Log: ${log}\n  Detener: bun run tunnel:stop\n`)
}

try {
  const previous = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8').trim()) : 0
  if (process.argv.includes('--stop')) {
    if (alive(previous)) process.kill(-previous, 'SIGTERM')
    rmSync(pidFile, { force: true })
    console.log('Sonora · túnel detenido. PostgreSQL continúa en Docker.')
  } else if (alive(previous)) {
    summary('ya está en segundo plano', previous)
  } else {
    const fd = openSync(log, 'w', 0o600)
    let child
    try {
      child = spawn('bun', ['run', 'tunnel:run'], { cwd: root, detached: true, stdio: ['ignore', fd, fd], env: { ...process.env, NO_COLOR: '1' } })
      await once(child, 'spawn')
    } finally { closeSync(fd) }
    writeFileSync(pidFile, String(child.pid), { mode: 0o600 })
    child.unref()
    for (let attempt = 0; attempt < 60; attempt++) {
      await setTimeout(500)
      if (!alive(child.pid)) {
        rmSync(pidFile, { force: true })
        throw new Error(`No se pudo iniciar el túnel. Consulta ${log}`)
      }
      if (output().includes('Registered tunnel connection')) break
    }
    summary('en segundo plano', child.pid)
  }
} catch (error) {
  console.error(`Sonora · ${error.message}`)
  process.exitCode = 1
}
