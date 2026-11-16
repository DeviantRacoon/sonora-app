# Módulos y arquitectura

## Servidor

- `server/index.js`: configura Express, valida peticiones, expone la API y el flujo SSE, entrega archivos y sirve la interfaz compilada.
- `server/services/ytdlp.js`: ejecuta yt-dlp para buscar canciones y playlists y convertir audio a MP3. Controla la concurrencia, el tiempo y la salida de los procesos.
- `server/services/queue.js`: administra los lotes, la cola, los reintentos, el progreso, SQLite, la reutilización de MP3 y la limpieza del almacenamiento.
- `server/services/cache.js`: conserva temporalmente resultados de consultas y comparte peticiones idénticas en curso.
- `server/test/`: pruebas de la API, las consultas, la caché y la recuperación de descargas.

## Interfaz

- `web/src/App.jsx`: coordina la búsqueda, las playlists, la selección, el reproductor y los mensajes de la aplicación.
- `web/src/api.js`: llama a la API y mantiene el estado de descargas mediante SSE.
- `web/src/cache.js`: almacena temporalmente búsquedas y playlists en el navegador.
- `web/src/components/`: contiene la cola de descargas, las filas de canciones y el logotipo animado.
- `web/test/`: pruebas de la caché de la interfaz.

## Flujo principal

La interfaz consulta la API de Express. El servidor busca mediante yt-dlp o añade canciones a la cola persistente. Al terminar cada trabajo, envía actualizaciones por SSE; cuando el lote está listo, entrega un MP3 o un ZIP. Los MP3 se guardan en `MUSIC_DIR` para permitir su reutilización.
