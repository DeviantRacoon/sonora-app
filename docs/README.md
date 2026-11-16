# Sonora: documentación del proyecto

## Stack y ejecución

Sonora usa React 18 y Vite en `web/`, y Express 4 en `server/`. El servidor ejecuta `yt-dlp` y FFmpeg para extraer audio MP3 y utiliza SQLite (`node:sqlite`) para guardar la cola. Se requiere Node.js 22.13 o posterior, Bun, yt-dlp y FFmpeg en el entorno. La entrega de lotes ZIP usa `yazl`.

- `bun install`: instalar dependencias.
- `bun run dev`: iniciar Vite y el servidor en desarrollo.
- `bun run start`: compilar la interfaz e iniciar el servidor.
- `node --test server/test/*.test.js web/test/*.test.js`: ejecutar pruebas.
- `PORT` cambia el puerto del servidor (predeterminado: 3001); escucha en `127.0.0.1`.
- `YTDLP_PATH` cambia la ruta del ejecutable yt-dlp.
- `MUSIC_DIR` cambia el directorio de datos (predeterminado: `music/` en la raíz).

El despliegue admite una instancia del servidor. Es necesario conservar `MUSIC_DIR` entre reinicios: `.sonora/queue.sqlite` guarda el estado y `.sonora/cache/` los MP3. No se incluyen Redis ni Docker Compose.

## Búsqueda y playlists

La búsqueda acepta hasta 200 caracteres y consulta canciones y playlists en paralelo. Si falla solo la búsqueda de playlists, responde con canciones y `partial: true`; la interfaz muestra el aviso. La búsqueda de una playlist devuelve hasta sus primeras 200 entradas y `truncated: true` cuando hay más. Los resultados se presentan con título, canal, duración y miniatura cuando están disponibles.

Las consultas usan como máximo cuatro procesos yt-dlp simultáneos, 60 segundos por proceso y 10 MB de salida combinada. La caché del servidor y la del navegador conservan hasta 200 resultados durante 10 minutos y comparten consultas idénticas en curso. Los fallos y resultados parciales no se conservan en caché.

## Descargas y conservación

Cada petición admite de 1 a 200 canciones con IDs válidos de YouTube. La cola global admite hasta 500 trabajos pendientes o activos y ejecuta hasta dos descargas en paralelo. Si está llena, la petición completa recibe HTTP 429. Cada proceso tiene un límite de 30 minutos; los trabajos fallidos pueden reintentarse.

El audio se convierte a MP3 con metadatos y miniatura. Los trabajos para un mismo video comparten una descarga en curso y reutilizan el MP3 almacenado. Cada lote conserva los títulos solicitados para entregar un MP3 o un ZIP sin recompresión. Los lotes parcialmente fallidos permiten descargar las canciones completadas y reintentar las fallidas.

Los lotes terminados se conservan siete días desde su finalización; los MP3 reutilizables, siete días desde su última reutilización y mientras un lote vigente los necesite. La limpieza se ejecuta al arrancar y cada hora, y respeta archivos en uso. Al reiniciar se reanudan los trabajos interrumpidos; si falta un MP3 guardado, se marca el trabajo como fallido. Los archivos temporales se eliminan al iniciar.

## API y eventos

- `GET /api/search?q=...`: busca canciones y playlists.
- `GET /api/playlist?id=...`: obtiene las canciones de una playlist.
- `POST /api/downloads`: crea un lote con `{ items: [{ id, title }], album }`.
- `POST /api/downloads/:jid/retry`: reintenta un trabajo fallido; devuelve `{ ok }`.
- `GET /api/downloads/batches/:bid/file`: entrega el MP3 o ZIP cuando el lote está listo.
- `GET /api/downloads/stream`: conecta por SSE y recibe primero la instantánea de lotes y trabajos, seguida de cambios y avisos de eliminación de lotes. El progreso se publica cuando cambia el porcentaje entero.

## Interfaz

La interfaz permite buscar, explorar playlists, seleccionar canciones, consultar la cola, reintentar fallos y descargar lotes. Incluye vista previa mediante el reproductor de YouTube, búsquedas recientes y selección de tema almacenadas en el navegador.
