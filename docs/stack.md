# Stack y configuración

## Tecnologías

- **Interfaz:** React 18, Vite 6, CSS, plugin de Tailwind CSS e iconos Iconify.
- **Reproducción:** elemento HTML `audio`, Media Session y reproductor de YouTube opcional para video.
- **PWA:** manifiesto e iconos estáticos; Vite genera un service worker con la lista de recursos compilados, sin una dependencia adicional.
- **Servidor:** Node.js 22.13 o posterior, Express 4, SQLite mediante `node:sqlite` y PostgreSQL mediante `pg` para perfiles y recomendaciones.
- **Procesamiento:** yt-dlp y FFmpeg para MP3; `yazl` para ZIP; MusicBrainz y ListenBrainz para descubrimiento musical.
- **Herramientas:** Bun para los workspaces, `concurrently` para procesos locales, `node:test` para pruebas y Docker Compose para PostgreSQL y backend locales.

El workspace contiene `web/` y `server/`. En desarrollo Vite redirige `/api` a `127.0.0.1:3001`. En producción el frontend puede publicarse por separado o servirse desde Express en `web/dist`. El Dockerfile del backend copia `server/`; no incluye por sí mismo el frontend compilado.

## Variables de entorno

El backend y Vite cargan `.env` de la raíz; el entorno existente tiene prioridad. Usa [.env.example](../.env.example) como referencia.

| Variable | Valor predeterminado | Uso |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Dirección de escucha; `0.0.0.0` en contenedores. |
| `PORT` | `3001` | Puerto del backend. |
| `YTDLP_PATH` | `yt-dlp` | Ejecutable de yt-dlp. |
| `YTDLP_JS_RUNTIME` | Sin activar | Un valor no vacío habilita Node como runtime JavaScript de yt-dlp. La imagen Docker lo activa. |
| `MUSIC_DIR` | `music/` en la raíz | Cola SQLite, MP3 reutilizables y temporales. La imagen usa `/data/music`. |
| `DATABASE_URL` | Sin configurar | Conexión PostgreSQL para personalización. Si falta, las rutas de perfil y recomendaciones devuelven 503. |
| `POSTGRES_PASSWORD` | Obligatoria para Compose | Contraseña del PostgreSQL local. Debe coincidir con la de `DATABASE_URL` para desarrollo fuera del contenedor. |
| `FRONTEND_ORIGINS` | Lista vacía | Orígenes exactos permitidos por CORS, separados por comas, sin espacios ni barra final. No hace falta para peticiones del mismo origen. |
| `MUSIC_USER_AGENT` | `Sonora/1.0 (local development)` | Identificación ante proveedores musicales; configura un contacto real. |
| `VITE_API_BASE_URL` | Cadena vacía | Origen público de la API, sin `/api`; queda incorporado al frontend al compilar. Vacío para proxy local y túnel de un solo origen. |
| `TEST_DATABASE_URL` | Sin configurar | Base vacía y exclusiva para las pruebas de integración de perfiles. Sin ella, esa prueba se omite. |

## Persistencia y estado del navegador

Mantén una única instancia del backend y conserva `MUSIC_DIR`: `.sonora/queue.sqlite` guarda lotes y trabajos, `.sonora/cache/` los MP3 y `.sonora/tmp/` los temporales. PostgreSQL conserva perfiles, eventos, preferencias y recomendaciones. Compose utiliza los volúmenes `music` y `profiles`.

El navegador guarda por separado `sonora-profile` (credencial de personalización) y `sonora-device` (identificador privado de descargas), además del tema, búsquedas recientes y activación de personalización. Cambiar de origen crea un almacenamiento distinto: es relevante al reiniciar un túnel temporal.

Consulta [desarrollo, túneles y despliegues](despliegue.md) para los comandos de ejecución y actualización.
