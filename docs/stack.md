# Stack y configuración

## Tecnologías

- **Interfaz:** React 18, Vite, CSS e iconos Iconify. Vite usa el plugin de Tailwind CSS.
- **Servidor:** Node.js, Express 4 y SQLite mediante `node:sqlite`.
- **Procesamiento:** `yt-dlp` y FFmpeg para extraer audio MP3; `yazl` para crear ZIP.
- **Herramientas:** Bun para los scripts del workspace y `node:test` para pruebas.

El workspace contiene `web/` y `server/`. En desarrollo Vite redirige `/api` a `127.0.0.1:3001`. En producción, Express sirve `web/dist` después de compilar la interfaz.

## Variables de entorno

| Variable | Valor predeterminado | Uso |
| --- | --- | --- |
| `PORT` | `3001` | Puerto del servidor, que escucha en `127.0.0.1`. |
| `YTDLP_PATH` | `yt-dlp` | Ejecutable de yt-dlp. |
| `MUSIC_DIR` | `music/` en la raíz | Almacenamiento de cola, MP3 y archivos temporales. |

El despliegue admite una sola instancia. Conserva `MUSIC_DIR` entre reinicios: `.sonora/queue.sqlite` guarda el estado y `.sonora/cache/` los MP3 reutilizables. No se incluyen Redis ni Docker Compose.
