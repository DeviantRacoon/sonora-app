# Sonora

Aplicación web para buscar música y playlists, escucharlas con controles del sistema, recibir recomendaciones personales y descargar canciones en MP3 o lotes ZIP. Es una PWA instalable y cada navegador ve únicamente sus propias descargas.

## Características

- **Búsqueda** de canciones y playlists en paralelo, con caché temporal.
- **Reproductor** de audio nativo con Media Session (pantalla de bloqueo, auriculares) y video opcional.
- **Descargas** individuales en MP3 (con metadatos y miniatura) o lotes ZIP, con cola persistente, progreso y reintentos.
- **Recomendaciones** "Hecho para ti" con likes y exclusiones (MusicBrainz + ListenBrainz). Opcionales: requieren PostgreSQL.
- **PWA**: instalable en móvil y desktop; la interfaz abre sin conexión.
- **Privacidad por navegador**: historial y archivos separados por un identificador aleatorio local.

Detalle completo en [funcionalidades](docs/funcionalidades.md).

## Arquitectura

```
Navegador (React + Vite, PWA)
        │  /api
        ▼
Express (Node) ──► yt-dlp + FFmpeg ──► MP3 / ZIP  (cola en PostgreSQL + archivos en MUSIC_DIR)
        │
        └────────► PostgreSQL (perfiles y recomendaciones, opcional)
```

Monorepo con workspaces `web/` (interfaz) y `server/` (API). Más en [módulos y arquitectura](docs/modulos.md).

## Requisitos

| Herramienta | Para qué |
| --- | --- |
| Node.js 22.13+ y [Bun](https://bun.sh) | Ejecutar y compilar |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) y [FFmpeg](https://ffmpeg.org) | Buscar y convertir audio |
| Docker + Compose | PostgreSQL local (opcional) |
| [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) en `bin/cloudflared` | Solo para `bun run tunnel` |

Sin PostgreSQL, búsqueda, reproducción y descargas funcionan; la personalización responde 503.

## Inicio rápido (desarrollo local)

```sh
bun install
cp -n .env.example .env     # solo la primera vez (-n no sobrescribe); cambia la contraseña (en POSTGRES_PASSWORD y DATABASE_URL) y MUSIC_USER_AGENT
docker compose up -d --wait db
bun run dev
```

Abre <http://localhost:5173>. `dev` levanta la API (puerto 3001, con recarga) y Vite (5173); Vite redirige `/api` al backend, así que deja `VITE_API_BASE_URL` vacío. Detén PostgreSQL con `docker compose stop db`.

## Compartir con Cloudflare Tunnel

Expone tu máquina por una URL HTTPS pública (útil para probar en el celular o mostrar la app) con frontend y API en un mismo origen y recompilación al guardar.

```sh
# requisitos: .env configurado, Docker activo, bin/cloudflared, puerto 3001 libre
bun run tunnel         # arranca todo en segundo plano e imprime URL, PID y log
tail -f .tunnel/tunnel.log
bun run tunnel:stop    # detiene frontend, API y túnel (PostgreSQL sigue en Docker)
```

- La URL `https://…trycloudflare.com` es temporal: cambia si reinicias el túnel (y con ella el perfil, historial y PWA instalada).
- No hay HMR: tras guardar cambios, espera el build y recarga el navegador. No reinicies el túnel.
- Repetir `bun run tunnel` muestra el estado sin duplicar procesos.

Instalación de `cloudflared`, dominio fijo, verificación y resolución de problemas: [guía del túnel](docs/tunnel.md).

## Todo en Docker (imagen + túnel)

La imagen incluye la API, el frontend compilado (mismo origen), `yt-dlp` y `ffmpeg`, y PostgreSQL corre en su propio contenedor. Con solo Docker instalado:

```sh
git clone <repo> && cd music-downloader
docker compose up -d --build                      # API + frontend en http://localhost:3001, con PostgreSQL
docker compose --profile tunnel up -d             # opcional: añade cloudflared
docker compose logs tunnel | grep -o 'https://[a-z-]*\.trycloudflare\.com' | grep -v '//api\.'   # URL pública
docker compose --profile tunnel stop tunnel       # cerrar el túnel (la URL cambia al reiniciarlo)
```

- No necesita `.env`: la contraseña de PostgreSQL por defecto es `sonora-local` (el puerto solo escucha en `127.0.0.1`). Para otra, define `POSTGRES_PASSWORD` (y `MUSIC_USER_AGENT` con un contacto real) en `.env`.
- No lo combines con `bun run dev` ni `bun run tunnel`: todos usan el puerto 3001.
- Redes que inspeccionan TLS (error `x509: certificate signed by unknown authority`): crea `.certs/ca-bundle.pem` con las CAs del host y levanta con `-f compose.yaml -f compose.certs.yaml`.
  - Fedora: copia `/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem`. Debian/Ubuntu: `/etc/ssl/certs/ca-certificates.crt`.
  - Windows (PowerShell): `mkdir .certs; curl.exe -o .certs\ca-bundle.pem https://curl.se/ca/cacert.pem`; añade al final la CA corporativa en Base64 si aplica.
- Tras cambiar código, repite `docker compose up -d --build` (no hay recarga en caliente).

## Despliegue

Producción usa **Netlify** (frontend estático) y **Railway** (API con Dockerfile + PostgreSQL + volumen `/data/music`).

| Dónde | Qué configurar |
| --- | --- |
| Netlify | `VITE_API_BASE_URL=https://tu-api.example` (sin `/api`); build `bun run prod:frontend`, publica `web/dist` |
| Railway | `DATABASE_URL`, `FRONTEND_ORIGINS` (origen exacto de Netlify), `MUSIC_USER_AGENT`, `HOST=0.0.0.0`, volumen `/data/music`, healthcheck `/api/health`, **una sola instancia** |

Pasos completos y verificación: [guía de despliegue](docs/despliegue.md).

## Comandos

| Comando (desde la raíz) | Uso |
| --- | --- |
| `bun run dev` | Frontend y backend en desarrollo |
| `bun run tunnel` / `tunnel:stop` | Iniciar / detener el túnel de Cloudflare (verifica antes red y firewall) |
| `bun run tunnel:check` | Solo diagnosticar red, DNS, firewall y puerto 3001 |
| `bun run prod:frontend` (`build`, `build:netlify`) | Compilar el frontend en `web/dist` |
| `bun run prod:backend` (`start`) | Iniciar solo la API con `NODE_ENV=production` |
| `docker compose up --build` | Backend + PostgreSQL en contenedores (no combinar con `dev`: ambos usan el 3001) |

## Configuración

Variables en `.env` (raíz); el entorno del proceso tiene prioridad. Las principales:

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` / `POSTGRES_PASSWORD` | PostgreSQL para personalización |
| `FRONTEND_ORIGINS` | Orígenes CORS permitidos (no necesario en mismo origen) |
| `MUSIC_USER_AGENT` | Identificación ante MusicBrainz/ListenBrainz; usa un contacto real |
| `VITE_API_BASE_URL` | Origen público de la API; vacío en local y túnel |
| `HOST`, `PORT`, `MUSIC_DIR`, `YTDLP_PATH`, `YTDLP_JS_RUNTIME` | Servidor y herramientas |

Tabla completa y persistencia en [stack y configuración](docs/stack.md).

## Pruebas

```sh
node --test server/test/*.test.js web/test/*.test.js
```

La prueba de perfiles necesita una base **vacía y exclusiva** (si no, se omite):

```sh
TEST_DATABASE_URL=postgres://usuario:clave@localhost:5432/sonora_test node --test server/test/profiles.test.js
```

## Documentación

| Documento | Contenido |
| --- | --- |
| [Desarrollo y despliegues](docs/despliegue.md) | Local, Netlify, Railway, verificación |
| [Cloudflare Tunnel](docs/tunnel.md) | Instalación, uso, actualización, dominio fijo, problemas |
| [Stack y configuración](docs/stack.md) | Tecnologías, variables, persistencia |
| [Módulos y arquitectura](docs/modulos.md) | Archivos y flujos principales |
| [Funcionalidades](docs/funcionalidades.md) | Qué hace la app y cómo se comporta |
| [Reglas y límites](docs/reglas.md) | Cuotas, retención, privacidad |
| [API y eventos](docs/api.md) | Endpoints y SSE |

## Notas importantes

- El identificador `sonora-device` es privado: no compartas enlaces de archivos o audio que lo incluyan (`?device=...`).
- Mantén **una sola instancia** del backend; los eventos y la cola en memoria están diseñados para un proceso; sin `DATABASE_URL` la cola no sobrevive a reinicios.
- No expongas PostgreSQL públicamente y respalda con `pg_dump` y el volumen de música antes de cambiar infraestructura.
