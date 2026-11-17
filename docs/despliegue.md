# Desarrollo y despliegues

Ejecuta los comandos desde la raíz del repositorio. Producción usa frontend estático en Netlify y API + PostgreSQL en Railway. No se necesita compilar JavaScript del backend: Node ejecuta sus módulos directamente.

## Desarrollo: frontend y backend juntos

Requisitos: Node.js 22.13 o posterior, Bun, yt-dlp, FFmpeg y Docker Compose si necesitas PostgreSQL local.

```sh
bun install
cp .env.example .env
```

Edita `.env`: cambia `POSTGRES_PASSWORD` y la misma contraseña dentro de `DATABASE_URL`. Usa una contraseña segura para URL o codifícala en la URL de conexión. Deja `VITE_API_BASE_URL` vacío y conserva el puerto 3001 del backend para el proxy de Vite.

```sh
docker compose up -d --wait db
bun run dev
```

Abre `http://localhost:5173`. `dev` inicia Vite y Node con recarga y detiene ambos al pulsar Ctrl+C o al terminar cualquiera. PostgreSQL continúa activo; puedes detenerlo con `docker compose stop db`. El backend y Vite leen `.env` de la raíz; los cambios de variables requieren reiniciar los procesos. Si omites `DATABASE_URL`, la aplicación funciona sin personalización.

Para levantar backend y base mediante contenedores, usa `docker compose up --build`; ejecuta únicamente `bun run --filter web dev` para la interfaz. No ejecutes a la vez el backend de Compose y `bun run dev`: ambos ocuparían el puerto 3001.

## Compartir por Cloudflare Tunnel

`bun run tunnel` levanta PostgreSQL, compila el frontend, mantiene la recompilación en modo watch e inicia la API con recarga y un túnel hacia `127.0.0.1:3001`. Mantén `VITE_API_BASE_URL` vacío y detén antes otros procesos en ese puerto. Espera a PostgreSQL con `docker compose up -d --wait db` antes del primer arranque.

Para actualizar código sin cambiar el enlace, guarda, espera al build y recarga el navegador. No reinicies el túnel: un nuevo dominio temporal crea otro origen para el perfil, historial de descargas y PWA. Consulta [Cloudflare Tunnel](tunnel.md) para requisitos, instalación, actualización y diagnóstico.

## Frontend de producción: Netlify

1. Conecta el repositorio y selecciona la rama que deseas publicar.
2. Deja vacíos **Base directory** y **Package directory** para usar la raíz del monorepo.
3. Usa el archivo `netlify.toml`: comando `bun run prod:frontend`, publicación `web/dist` y Node 24.
4. Agrega `VITE_API_BASE_URL=https://tu-backend.up.railway.app` a las variables del build, con el dominio HTTPS real de la API y sin `/api` al final.
5. Publica y conserva el origen definitivo del frontend, por ejemplo `https://tu-sitio.netlify.app`, para configurar CORS en Railway.

Para generar los mismos archivos localmente:

```sh
bun install --frozen-lockfile
VITE_API_BASE_URL=https://tu-backend.up.railway.app bun run prod:frontend
```

El resultado es `web/dist`. El comando termina al compilar: Netlify sirve los archivos. También puedes subir esa carpeta en un despliegue manual; en ese caso Netlify no ejecuta el build.

Las variables `VITE_*` son públicas y quedan integradas en los archivos generados. Nunca pongas contraseñas, `DATABASE_URL` ni credenciales del backend allí. Cambiar el dominio de la API requiere recompilar y publicar el frontend.

Referencia: [monorepos de Netlify](https://docs.netlify.com/build/configure-builds/monorepos/).

## Backend de producción: Railway

1. Crea un proyecto con un servicio PostgreSQL y un servicio de aplicación conectado al repositorio.
2. Para la aplicación, mantén **Root Directory** en la raíz del repositorio. Railway debe usar el `Dockerfile` de la raíz: necesita ese contexto para copiar `server/`.
3. Deja vacíos los overrides de build y start. El Dockerfile instala Node 24, yt-dlp y FFmpeg e inicia el mismo script `start` del workspace `server`. No necesita Bun en el contenedor.
4. Agrega un volumen persistente en `/data/music` al backend y mantén una sola instancia. Ahí viven la cola SQLite y los MP3; PostgreSQL conserva los perfiles en su propio almacenamiento persistente.
5. Configura estas variables en el servicio backend:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | Referencia a `DATABASE_URL` del servicio PostgreSQL, mediante red privada; por ejemplo `${{Postgres.DATABASE_URL}}` si se llama `Postgres` |
| `FRONTEND_ORIGINS` | Origen HTTPS exacto de Netlify, sin barra final; varios separados por comas y sin espacios |
| `MUSIC_USER_AGENT` | `Sonora/1.0 (https://tu-dominio.example/contacto)` con contacto real |
| `HOST` | `0.0.0.0` (también configurado en la imagen) |
| `MUSIC_DIR` | `/data/music` (también configurado en la imagen) |

Railway proporciona `PORT`; la aplicación lo utiliza. Configura el healthcheck en `/api/health`, genera un dominio público HTTPS para la API y úsalo en Netlify. PostgreSQL debe permanecer en la red privada.

6. Despliega y espera el estado **SUCCESS**. Revisa los logs si el contenedor no arranca: `DATABASE_URL` debe ser válida y PostgreSQL debe estar disponible; al iniciar se crean las tablas necesarias.
7. Si agregas un dominio personalizado o cambias el origen del frontend, actualiza `FRONTEND_ORIGINS` y redespliega el backend. Los deploy previews de Netlify necesitan su propio origen permitido para poder usar la API.

Para ejecutar la API de producción fuera del contenedor, instala primero Node, Bun, yt-dlp y FFmpeg, configura el entorno o `.env`, y ejecuta:

```sh
bun install --frozen-lockfile
bun run prod:backend
```

Ese comando inicia solo el backend; no crea PostgreSQL ni publica en Railway. En Railway usa la imagen Docker para incluir las herramientas de audio.

Referencias: [Dockerfile en Railway](https://docs.railway.com/builds/dockerfiles), [healthchecks](https://docs.railway.com/deployments/healthchecks) y [volúmenes](https://docs.railway.com/volumes).

## Verificar y actualizar

```sh
curl --fail https://tu-backend.up.railway.app/api/health
curl -i -X OPTIONS https://tu-backend.up.railway.app/api/profile \
  -H 'Origin: https://tu-sitio.netlify.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type,x-sonora-device'
```

El primer comando debe devolver `{"ok":true}`. El segundo debe devolver 204 y `Access-Control-Allow-Origin` con el origen autorizado. El healthcheck confirma que la API responde; comprueba también en el frontend búsquedas, reproducción, descargas, actualizaciones de la cola y preferencias del navegador.

Los pushes a las ramas conectadas activan los despliegues de cada proveedor. Antes de un cambio de almacenamiento o esquema, realiza respaldo de PostgreSQL con `pg_dump` y del volumen `/data/music`. Conserva los volúmenes al redesplegar. Un rollback de código no revierte datos ni migraciones. Un servicio Railway con volumen puede tener una breve interrupción al redesplegar.

Para revisar localmente antes de publicar:

```sh
node --test server/test/*.test.js web/test/*.test.js
bun run prod:frontend
```

La prueba de integración de perfiles requiere `TEST_DATABASE_URL` apuntando a una base vacía y exclusiva de pruebas; consulta el README.

## Verificar PWA y separación de dispositivos

El build debe publicar `index.html`, `sw.js`, `manifest.webmanifest`, `icons/` y los recursos generados. La instalación requiere HTTPS o localhost. El service worker solo se registra en producción; el servidor de desarrollo Vite no activa esa caché.

Desde la URL final, comprueba la instalación desde Ajustes y la apertura de la interfaz sin conexión. Las búsquedas, recomendaciones, audio y archivos necesitan acceso a la API; la PWA no guarda una biblioteca musical offline. Una nueva versión del service worker puede esperar a que se cierren todas las ventanas y pestañas de la anterior.

Prueba una descarga desde dos navegadores o dispositivos: cada uno debe mostrar solo su historial, progreso y archivos. Conserva el almacenamiento del navegador para mantener su identidad. Comprueba también reproducción, pausa y cambio de pista; la continuidad con pantalla apagada necesita una prueba en el dispositivo real y depende del navegador y sistema.
