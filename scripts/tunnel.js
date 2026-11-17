import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { accessSync, constants } from 'node:fs'
import { lookup } from 'node:dns/promises'
import { connect, createServer } from 'node:net'
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

// Diagnóstico de red: cada comprobación devuelve null (ok) o un mensaje con la causa probable.
const edge = { api: 'api.trycloudflare.com', tunnel: 'region1.v2.argotunnel.com' }
const tcp = (host, port) => new Promise(done => {
  const socket = connect({ host, port, timeout: 4000 })
  socket.once('connect', () => { socket.destroy(); done(null) })
  socket.once('timeout', () => { socket.destroy(); done('tiempo agotado (típico de un firewall que descarta el tráfico)') })
  socket.once('error', error => done(error.code === 'ECONNREFUSED' ? 'conexión rechazada (firewall o red que rechaza el puerto)' : error.message))
})
const checks = [
  ['bin/cloudflared ejecutable', async () => { try { accessSync(resolve(root, 'bin/cloudflared'), constants.X_OK); return null } catch { return 'no existe o no es ejecutable; consulta docs/tunnel.md (Instalar cloudflared)' } }],
  ['puerto local 3001 libre', () => new Promise(done => {
    const server = createServer().once('error', error => done(error.code === 'EADDRINUSE' ? 'ocupado: detén `bun run dev`, el backend o `docker compose up backend`' : error.message))
    server.listen(3001, '127.0.0.1', () => server.close(() => done(null)))
  })],
  [`DNS ${edge.api}`, async () => { try { await lookup(edge.api); return null } catch (error) { return `no resuelve (${error.code}); revisa DNS, VPN o filtrado DNS` } }],
  [`HTTPS saliente ${edge.api}:443`, () => tcp(edge.api, 443)],
  [`Cloudflare edge ${edge.tunnel}:7844`, async () => { const error = await tcp(edge.tunnel, 7844); return error && `${error}. cloudflared necesita salida TCP/UDP 7844; ábrela en el firewall, proxy o VPN` }],
]
const preflight = async () => {
  if (process.env.SONORA_SKIP_PREFLIGHT) return
  const results = await Promise.all(checks.map(async ([name, check]) => [name, await check()]))
  console.log('\nVerificaciones previas')
  for (const [name, problem] of results) console.log(`  ${problem ? '✗' : '✓'} ${name}${problem ? ` — ${problem}` : ''}`)
  if (results.some(([, problem]) => problem)) console.log('  Se intentará iniciar de todos modos; si falla, revisa los puntos marcados con ✗.')
}
// Pistas por patrón conocido en el log cuando el arranque falla o se agota la espera.
const hints = [
  [/x509|certificate/i, 'Certificado TLS rechazado: una red/proxy inspecciona TLS. Instala su CA en el sistema (en contenedor, monta .certs/ca-bundle.pem).'],
  [/no such host|lookup .*: |dial tcp: lookup/i, 'Fallo de DNS: revisa tu conexión, VPN o filtrado DNS.'],
  [/i\/o timeout|context deadline|connection timed out|Unable to establish connection/i, 'Tiempo agotado hacia Cloudflare: probable firewall/proxy bloqueando la salida (puerto 7844 o 443).'],
  [/EADDRINUSE|address already in use/i, 'El puerto 3001 ya está en uso: detén el otro backend.'],
  [/ECONNREFUSED.*5432|password authentication failed|database .* does not exist/i, 'PostgreSQL no responde o la contraseña no coincide: `docker compose up -d --wait db` y revisa DATABASE_URL.'],
  [/502|Bad Gateway|connection refused.*3001/i, 'El túnel no alcanza la API local en 127.0.0.1:3001.'],
]
const diagnose = () => {
  const text = output()
  const found = hints.filter(([pattern]) => pattern.test(text)).map(([, hint]) => hint)
  if (found.length) console.error(`Posibles causas:\n${found.map(hint => `  - ${hint}`).join('\n')}`)
}

try {
  if (process.argv.includes('--check')) { await preflight(); process.exit(0) }
  const previous = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8').trim()) : 0
  if (process.argv.includes('--stop')) {
    if (alive(previous)) process.kill(-previous, 'SIGTERM')
    rmSync(pidFile, { force: true })
    console.log('Sonora · túnel detenido. PostgreSQL continúa en Docker.')
  } else if (alive(previous)) {
    summary('ya está en segundo plano', previous)
  } else {
    await preflight()
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
        diagnose()
        throw new Error(`No se pudo iniciar el túnel. Consulta ${log}`)
      }
      if (output().includes('Registered tunnel connection')) break
    }
    if (!output().includes('Registered tunnel connection')) { console.error('El túnel no se conectó en 30 s.'); diagnose() }
    summary('en segundo plano', child.pid)
  }
} catch (error) {
  console.error(`Sonora · ${error.message}`)
  process.exitCode = 1
}
