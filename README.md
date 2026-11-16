# Sonora

Aplicación para buscar música y playlists, escuchar vistas previas y descargar canciones en MP3 o lotes ZIP.

## Requisitos

- Node.js 22.13 o posterior y Bun.
- `yt-dlp` y FFmpeg disponibles en el entorno.

## Inicio

```sh
bun install
bun run dev
```

Vite muestra la dirección de desarrollo en la terminal y redirige `/api` al servidor local en el puerto 3001. Para compilar la interfaz e iniciar el servidor en producción:

```sh
bun run build
bun run start
```

El servidor sirve la interfaz compilada y la API en `http://127.0.0.1:3001`. Puedes configurar `PORT` y `HOST`; por ejemplo, usa `HOST=0.0.0.0` si tu proveedor necesita conectarse al servidor desde fuera del contenedor.

## Publicar en Netlify

Conecta el repositorio al sitio de Netlify. En **Build settings**, deja vacíos el directorio base y el directorio de paquete, para que se use la raíz del repositorio. El archivo `netlify.toml` configura Node 24, `bun run build:netlify` y `web/dist`; el build descarga yt-dlp, FFmpeg y ffprobe para Linux x64 e incluye el servidor. Después despliega desde Git o con la CLI de Netlify (27.17.0 o posterior). Arrastrar `web/dist` solo publica la interfaz y no incluye el servidor.

El servidor usa Netlify Server, disponible en acceso anticipado. La cola y los archivos se guardan en `/tmp`: se pierden cuando la instancia se detiene o se reemplaza, y los trabajos pueden interrumpirse. El servidor no tiene autenticación: cualquiera que conozca su URL puede usar su API. Las peticiones a YouTube también pueden fallar si este bloquea la dirección del servidor.

Para ejecutar las pruebas:

```sh
node --test server/test/*.test.js web/test/*.test.js
```

## Documentación

- [Stack y configuración](docs/stack.md)
- [Módulos y arquitectura](docs/modulos.md)
- [Funcionalidades](docs/funcionalidades.md)
- [Reglas y límites](docs/reglas.md)
- [API y eventos](docs/api.md)
