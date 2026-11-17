// Cargar antes de importar la aplicación; el entorno del despliegue tiene prioridad.
try { process.loadEnvFile('../.env') } catch (error) {
  if (error.code !== 'ENOENT') throw error
}
