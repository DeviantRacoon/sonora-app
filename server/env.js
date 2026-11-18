// Cargar antes de importar la aplicación; el entorno del despliegue tiene prioridad.
import { resolve, delimiter } from 'node:path'

const binDir = resolve(import.meta.dirname, '../bin')
process.env.PATH = `${binDir}${delimiter}${process.env.PATH || ''}`

try { process.loadEnvFile('../.env') } catch (error) {
  if (error.code !== 'ENOENT') throw error
}
