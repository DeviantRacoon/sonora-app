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

## Publicar la interfaz en Netlify por arrastre

1. Ejecuta `bun install` y `bun run build` en tu computadora.
2. La carpeta resultante es `web/dist`. Arrástrala a [Netlify Drop](https://app.netlify.com/drop). Netlify no ejecuta el build al publicar mediante arrastre.

La carpeta compilada contiene solo la interfaz. Para que funcionen las búsquedas y descargas, necesitas publicar por separado el servidor Node con `yt-dlp` y FFmpeg instalados y un directorio de música escribible. Configura `HOST=0.0.0.0` y el puerto indicado por el proveedor, e inicia con `bun run start`.

Una vez que tengas la URL HTTPS del servidor, crea un archivo llamado `_redirects` dentro de `web/dist` con esta línea, reemplazando el dominio por el de tu servidor:

```text
/api/*  https://tu-servidor.example.com/api/:splat  200
```

Arrastra de nuevo `web/dist` a Netlify. Cada vez que ejecutes `bun run build`, vuelve a crear `_redirects` antes de publicar. Los proxies de Netlify tienen un límite de 26 segundos: las búsquedas lentas, el progreso en directo y las descargas largas pueden interrumpirse. El servidor no tiene autenticación: cualquiera que conozca su URL puede usar su API.

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
