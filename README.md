# Sonora

Aplicación para buscar música y playlists, escuchar audio con controles del sistema, descubrir recomendaciones personales y descargar canciones en MP3 o lotes ZIP. Incluye PWA instalable y descargas separadas por navegador.

## Requisitos

- Node.js 22.13 o posterior y Bun.
- `yt-dlp` y FFmpeg disponibles en el entorno.
- PostgreSQL para recomendaciones y preferencias; Docker Compose permite ejecutarlo localmente. Sin base configurada, búsqueda, reproducción y descargas siguen disponibles.

## Inicio

```sh
bun install
bun run dev
```

`bun run dev` levanta la API con recarga en el puerto 3001 y Vite en el 5173. Al terminar cualquiera de los procesos se detiene el otro. Vite redirige `/api` al backend local; deja `VITE_API_BASE_URL` vacío para usar ese proxy. El backend y Vite cargan `.env` de la raíz; las variables del entorno tienen prioridad.

| Comando desde la raíz | Uso |
| --- | --- |
| `bun run dev` | Frontend y backend en desarrollo |
| `bun run tunnel` | Iniciar PostgreSQL, frontend, API y Cloudflare en segundo plano; mostrar URL, PID y log |
| `bun run tunnel:stop` | Detener frontend, API y túnel; conservar PostgreSQL |
| `bun run prod:frontend` | Compilar frontend de producción en `web/dist` |
| `bun run prod:backend` | Iniciar solo la API con `NODE_ENV=production` |
| `bun run build` / `bun run build:netlify` | Alias de `prod:frontend` |
| `bun run start` | Alias de `prod:backend` |

El frontend de producción es estático y lo sirve Netlify. La API usa `HOST` y `PORT` (por defecto `127.0.0.1:3001`); en un contenedor usa `HOST=0.0.0.0`. El backend también puede servir `web/dist` si compilaste la interfaz localmente.

## Cloudflare Tunnel

Para compartir frontend y API con una sola URL y actualizar al guardar cambios:

```sh
bun run tunnel
```

Necesitas `.env` configurado, Docker activo y `bin/cloudflared` instalado (el binario no se incluye en el repositorio). Detén antes cualquier `bun run dev` o backend que ocupe el puerto 3001. El comando inicia PostgreSQL, compila con `VITE_API_BASE_URL` vacío y sirve la interfaz desde el backend en `127.0.0.1:3001`. Al guardar cambios, Vite recompila el frontend y Node reinicia la API cuando cambian sus archivos; recarga el navegador para ver la interfaz nueva. El túnel conserva su URL durante estas actualizaciones. El comando devuelve la terminal tras esperar hasta 30 segundos por la conexión y muestra un resumen con URL, PID y log. Los procesos continúan en segundo plano; repetir el comando muestra el estado sin duplicarlos. Consulta la salida con `tail -f .tunnel/tunnel.log` y detén los procesos con `bun run tunnel:stop`; PostgreSQL sigue ejecutándose en Docker.

Usa el enlace HTTPS `trycloudflare.com` que imprime el túnel. Las peticiones a `/api`, los perfiles y los archivos descargados comparten ese origen; no necesitas cambiar `FRONTEND_ORIGINS`. La cola usa consultas periódicas en ese dominio porque los túneles rápidos no admiten SSE. Mantén PostgreSQL, el backend y el túnel encendidos. El enlace es temporal y cambia al reiniciar el túnel; para una URL fija configura un túnel con dominio propio en Cloudflare. Cualquier persona con el enlace puede usar la aplicación, pero cada navegador recibe únicamente sus propias descargas. La capacidad de procesamiento del servidor sigue siendo compartida.

Para actualizar código, deja el comando ejecutándose, espera a que termine la recompilación y recarga el navegador; no reinicies el túnel. Si cambia el dominio temporal, el perfil, historial e instalación PWA del origen anterior no se trasladan automáticamente. Consulta [la guía del túnel](docs/tunnel.md) para actualizar la PWA, comprobar servicios y resolver problemas.

## Despliegues

Consulta [la guía de despliegue](docs/despliegue.md) para publicar el frontend en Netlify y el backend con PostgreSQL en Railway, configurar variables y verificar ambos servicios.

Para ejecutar las pruebas:

```sh
node --test server/test/*.test.js web/test/*.test.js
```

## Documentación

- [Desarrollo y despliegues](docs/despliegue.md)
- [Cloudflare Tunnel y actualizaciones](docs/tunnel.md)
- [Stack y configuración](docs/stack.md)
- [Módulos y arquitectura](docs/modulos.md)
- [Funcionalidades](docs/funcionalidades.md)
- [Reglas y límites](docs/reglas.md)
- [API y eventos](docs/api.md)

## Perfiles y recomendaciones

El frontend se publica en Netlify y la API se ejecuta por separado. Copia `.env.example` a `.env`, cambia la contraseña (usa caracteres seguros para URL) y define `MUSIC_USER_AGENT` con una URL de contacto real. Ejecuta `docker compose up --build`. PostgreSQL conserva perfiles en el volumen `profiles`; `music` conserva SQLite y MP3. Elimina volúmenes únicamente si quieres borrar esos datos.

Para desarrollo puedes levantar solo `docker compose up -d db`, configurar `DATABASE_URL` en `.env` y ejecutar `bun run dev`. Las tablas se crean al iniciar el backend. Sin `DATABASE_URL`, la personalización responde 503 y el resto de Sonora sigue funcionando.

En Railway crea dos servicios equivalentes: PostgreSQL y el backend construido con el Dockerfile. Conecta `DATABASE_URL`, configura `FRONTEND_ORIGINS` con el origen exacto de Netlify (sin barra final), `MUSIC_USER_AGENT`, `HOST=0.0.0.0` y un volumen en `/data/music`. Mantén una instancia del backend: la cola SQLite y los eventos están diseñados para un solo proceso. No expongas PostgreSQL públicamente. El healthcheck del backend es `/api/health`.

En Netlify define `VITE_API_BASE_URL=https://tu-api.example` y recompila. Esta variable es pública; las credenciales de PostgreSQL pertenecen exclusivamente al backend. La URL incluye el origen, sin `/api`. CORS permite los orígenes de `FRONTEND_ORIGINS`, separados por comas. Respalda PostgreSQL con `pg_dump` y el volumen de música antes de cambios de infraestructura.

El perfil usa una credencial aleatoria en este navegador; borrar sus datos o cambiar de dispositivo crea otro perfil. Sonora aprende de reproducciones de 30 segundos y solicitudes de descarga aceptadas, con likes y exclusiones explícitos. Las búsquedas libres no se guardan como gustos porque no identifican una canción o artista de forma fiable. Actividad: 90 días; preferencias: hasta borrarlas; perfiles inactivos: un año. Desactivar conserva el perfil; borrar lo elimina y desactiva el aprendizaje. Las recomendaciones empiezan al reunir señales de tres canciones distintas. Las exclusiones se pueden quitar desde el botón de la canción en los resultados de búsqueda.

MusicBrainz identifica artistas y ListenBrainz propone artistas relacionados. No se envía la credencial del navegador a esos proveedores. Las coincidencias ambiguas se omiten; puede haber menos de 12 resultados o ninguno. El motor reutiliza búsquedas de YouTube, por lo que bloqueos de yt-dlp afectan también a las recomendaciones. Se actualizan cada seis horas; las preferencias invalidan el resultado. Los errores esperan cinco minutos antes de reintentar. No hay sincronización entre dispositivos ni importación del historial antiguo.

Pruebas de integración de perfiles (usa una base **vacía y exclusiva de pruebas**):

```sh
TEST_DATABASE_URL=postgres://usuario:clave@localhost:5432/sonora_test node --test server/test/profiles.test.js
```

## Móvil, reproducción e instalación

Desktop conserva sus botones compactos; en móvil las preferencias tienen etiquetas y zonas táctiles de al menos 44 px. El reproductor ampliado permite cambiar de pista, avanzar, marcar favoritos y descargar; contraerlo no detiene el audio. Durante las búsquedas en desktop, el contenido anterior se retira del layout para evitar scroll vacío.

Sonora incluye un manifiesto PWA e iconos para instalarla desde **Ajustes → Instalar Sonora** o desde el menú del navegador. Requiere HTTPS (o localhost). La interfaz queda disponible sin conexión después de la primera visita; buscar, preparar audio y descargar requieren conexión con la API.

El service worker se registra solo en producción. Las actualizaciones pueden esperar a que se cierren las pestañas y ventanas de la versión anterior. La caché offline conserva la interfaz, sin MP3, ZIP ni rutas API.

El reproductor usa audio nativo y Media Session para los controles del sistema y la pantalla de bloqueo. El audio se prepara en la misma cola limitada que las descargas y reutiliza el MP3 en caché. Al mostrar el video se pausa el audio; vuelve a **Ver disco** para escuchar en segundo plano. La continuidad con pantalla apagada depende del navegador y del sistema operativo.

Cada navegador conserva un identificador aleatorio `sonora-device`: su historial, progreso, reintentos y archivos se filtran en el servidor. Las pestañas del mismo navegador comparten las descargas; otro navegador o dispositivo tiene su propia cola visible. Borrar los datos del sitio pierde el acceso a ese historial. Los lotes anteriores a esta separación no se atribuyen automáticamente a ningún dispositivo ni se muestran; sus archivos no se borran por esta actualización.

La API de descargas y `/api/audio/:id` requieren `X-Sonora-Device` (UUID v4); los enlaces de archivos, audio y SSE usan `?device=...` porque esas APIs del navegador no permiten cabeceras personalizadas. Este identificador es privado: no compartas enlaces que lo incluyan.
