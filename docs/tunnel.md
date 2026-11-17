# Cloudflare Tunnel

El túnel permite abrir Sonora desde un celular u otro equipo mediante una URL HTTPS. Apunta al backend local, que sirve tanto `/api` como el frontend compilado: todo utiliza un mismo origen.

## Instalar cloudflared

El script espera el binario en `bin/cloudflared` (o `bin/cloudflared.exe` en Windows, ambos ignorados por Git). Ejemplo en Linux x86_64:

```sh
mkdir -p bin
curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o bin/cloudflared
chmod +x bin/cloudflared
bin/cloudflared --version
```

En Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force -Path bin
Invoke-WebRequest -Uri https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe -OutFile bin\cloudflared.exe
.\bin\cloudflared.exe --version
```

Para otras plataformas descarga el binario desde las [descargas oficiales](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/). Si lo tienes instalado en el sistema, enlázalo o mantén `cloudflared` en tu PATH.

## Túnel con Docker (para desarrollo local)

Si prefieres no descargar ni mantener el binario de cloudflared en tu máquina, Docker puede gestionar tanto PostgreSQL como el túnel:

1. Levanta la base de datos y el túnel en Docker:
```sh
bun run dev:docker
# o directamente: docker compose up -d db tunnel
```

2. Consulta la URL generada:
```sh
bun run tunnel:docker:logs
# o: docker compose logs tunnel
```

3. Inicia tu entorno de desarrollo en local:
```sh
bun run dev
```

El contenedor del túnel utiliza `host.docker.internal:3001` para enrutar las peticiones públicas directamente al backend que corre en tu máquina.

## Iniciar (con script local)

Necesitas Bun, Node, yt-dlp, FFmpeg, Docker activo, dependencias instaladas, `.env` configurado y `bin/cloudflared` (o `bin/cloudflared.exe`) ejecutable. Ese binario es local y no se incluye en el repositorio.

Desde la raíz, después de configurar `.env` como indica el [README](../README.md):

```sh
bun install
bun run tunnel
```

Detén antes cualquier `bun run dev` o backend que ocupe el puerto 3001. El comando `tunnel` lanza los procesos en segundo plano, espera hasta 30 segundos por la conexión y devuelve la terminal con un resumen de URL, PID y ruta del log. Si la conexión tarda más, consulta el log para obtener la URL y confirmar el arranque. Repetir el comando muestra el estado del proceso existente. El proceso interno `tunnel:run`:

1. Inicia el servicio `db` de Compose, espera a que esté saludable y realiza una primera compilación del frontend.
2. Mantiene Vite compilando cambios con `build --watch` y `VITE_API_BASE_URL` vacío.
3. Ejecuta la API con recarga de Node en `127.0.0.1:3001`.
4. Abre un Quick Tunnel hacia `http://127.0.0.1:3001` e imprime la URL HTTPS `https://…trycloudflare.com`.

Comparte o abre esa URL en el dispositivo. No hace falta cambiar `FRONTEND_ORIGINS`: la interfaz y la API utilizan el mismo origen. La máquina local, la API y el túnel deben seguir encendidos; PostgreSQL es necesario para la personalización.

## Actualizar sin cambiar la URL

Después de iniciar `bun run tunnel`, guarda los cambios y consulta `tail -f .tunnel/tunnel.log` para ver cuándo termina la compilación del proceso `build`. Node reinicia la API al cambiar sus módulos importados. Después, recarga la página del navegador o la ventana de Sonora instalada.

No necesitas reiniciar `cloudflared` para actualizar la interfaz o la API. La URL permanece mientras siga vivo el mismo proceso del túnel. El build en modo watch no ofrece HMR: el navegador no se actualiza por sí solo.

Los cambios de variables en `.env` o en la configuración de ejecución requieren reiniciar los procesos correspondientes. El proceso interno reúne build, API y túnel con `concurrently --kill-others`: ejecutar `bun run tunnel:stop` y volverlo a iniciar puede generar otra URL. Si necesitas conservar un origen entre reinicios, utiliza un túnel con dominio fijo.

La PWA comprueba el service worker al cargar. Una nueva versión puede esperar a que se cierren las pestañas y ventanas de la versión anterior. Si sigue apareciendo una interfaz antigua, cierra todas las vistas de Sonora de ese origen y vuelve a abrir la misma URL. No es necesario borrar los datos del sitio; hacerlo pierde los identificadores locales de perfil y descargas.

## Descargas, perfiles y PWA

En `trycloudflare.com`, Sonora consulta el progreso cada dos segundos mediante `GET /api/downloads`. Los Quick Tunnels no admiten SSE y tienen un límite de 200 peticiones simultáneas en curso; son una opción de pruebas. Consulta la [documentación oficial de Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

Cada navegador conserva su propio identificador de descargas y su credencial de recomendaciones. Compartir la URL de la aplicación no comparte las colas visibles: el celular no recibe el historial del PC. Los enlaces directos de audio y archivos incluyen un identificador privado; no los compartas.

La URL HTTPS permite instalar la PWA desde Ajustes. La API, el audio y los archivos no se almacenan en la caché offline: aunque la interfaz instalada abra sin conexión, el servidor y el túnel deben estar disponibles para buscar, preparar música y descargar.

Si reinicias el Quick Tunnel y cambia el dominio, el navegador trata la URL nueva como otro origen: obtiene otro perfil e historial visible. Los datos del servidor no se borran por ese cambio, pero los identificadores guardados en el dominio viejo no se trasladan automáticamente. La PWA instalada también sigue apuntando al dominio anterior; tendrás que abrir e instalar la URL nueva. Para conservar perfiles, historial e instalación entre reinicios, necesitas un dominio estable.

## Dominio fijo (opcional)

El Quick Tunnel cambia de URL al reiniciar. Para una URL estable crea un túnel con nombre en una cuenta de Cloudflare con un dominio propio (consulta la [guía oficial](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-local-tunnel/)), apunta su ingress a `http://127.0.0.1:3001` y sustituye en el script `tunnel:run` de `package.json` el comando `cloudflared tunnel --url …` por `cloudflared tunnel run <nombre>`. Los túneles con nombre no tienen las restricciones de los Quick Tunnels, aunque la app seguirá usando consultas periódicas en lugar de SSE solo en `trycloudflare.com`.

## Diagnóstico de red y firewall

`bun run tunnel` ejecuta antes de arrancar unas verificaciones y marca con ✗ lo que falla; `bun run tunnel:check` las ejecuta solas, sin iniciar nada:

| Verificación | Si falla |
| --- | --- |
| `bin/cloudflared` ejecutable | Instálalo (ver arriba). |
| Puerto local 3001 libre | Hay otro backend (`bun run dev` o `docker compose up backend`). |
| DNS `api.trycloudflare.com` | DNS, VPN o filtrado DNS. |
| TCP 443 a `api.trycloudflare.com` | Firewall o proxy bloquea HTTPS saliente. |
| TCP 7844 a `region1.v2.argotunnel.com` | Firewall bloquea el puerto que usa cloudflared; ábrelo (TCP y UDP 7844). |

"Tiempo agotado" suele indicar un firewall que descarta paquetes; "conexión rechazada", uno que los rechaza. Si el túnel no conecta en 30 s o el proceso termina, el script analiza el log y lista posibles causas (certificado TLS de un proxy, DNS, tiempo agotado, puerto ocupado, PostgreSQL). No comprueba UDP: si TCP 7844 pasa pero el túnel va lento, cloudflared reintenta por HTTP/2.

## Detener y comprobar

`bun run tunnel:stop` detiene los procesos en segundo plano. `Ctrl+C` al consultar el log solo detiene su lectura. La salida se guarda en `.tunnel/tunnel.log` y se reemplaza en cada nuevo arranque. El PID se guarda en `.tunnel/tunnel.pid`; ambos archivos están excluidos de Git. PostgreSQL continúa en Docker; puedes detenerlo con `docker compose stop db`. No elimines los volúmenes para detener servicios.

Comprueba el origen local:

```sh
curl --fail http://127.0.0.1:3001/api/health
curl --fail --head http://127.0.0.1:3001/manifest.webmanifest
curl --fail --head http://127.0.0.1:3001/sw.js
```

Después abre `/api/health` desde el dominio HTTPS del túnel: debe devolver `{"ok":true}`. Verifica búsqueda, reproducción y descarga desde el celular; una petición a `/api/downloads` sin identificador debe devolver 401.

| Síntoma | Comprobación |
| --- | --- |
| Puerto 3001 ocupado | Detén el otro backend antes de iniciar el comando. |
| Error de conexión a PostgreSQL | Revisa `docker compose ps db` y espera con `docker compose up -d --wait db`; comprueba `DATABASE_URL`. |
| `bin/cloudflared` no existe o no ejecuta | Instala el binario para tu sistema y ajusta la ruta local del script. |
| Cloudflare devuelve 502 | Comprueba primero la API local y que el túnel apunte a `127.0.0.1:3001`. |
| La interfaz no refleja cambios | Espera a que termine el build, recarga y, si persiste, cierra las ventanas de la PWA y las pestañas de ese origen. |
| Desaparecen gustos o historial al cambiar de URL | El nuevo dominio tiene otro almacenamiento local; utiliza un origen estable para conservar la identidad. |
