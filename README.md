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

Vite muestra la dirección de desarrollo en la terminal y redirige `/api` al servidor local en el puerto 3001. Para compilar la interfaz e iniciar el servidor:

```sh
bun run start
```

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
