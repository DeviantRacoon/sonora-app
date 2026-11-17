# Módulos y arquitectura

## Servidor

| Archivo | Responsabilidad |
| --- | --- |
| `server/env.js` | Carga `.env` antes de importar la aplicación. |
| `server/index.js` | Configura Express y CORS, valida peticiones y dispositivos, expone API y SSE, entrega MP3/ZIP/audio y sirve `web/dist` cuando existe. |
| `server/services/ytdlp.js` | Ejecuta yt-dlp sin shell para buscar, consultar playlists y convertir audio; limita procesos, tiempos y salida. |
| `server/services/queue.js` | Persiste lotes y trabajos en SQLite; administra progreso, propietarios, reintentos, preparación de audio, reutilización de MP3 y limpieza. |
| `server/services/cache.js` | Conserva consultas temporalmente y comparte peticiones idénticas en curso. |
| `server/services/profiles.js` | Gestiona credenciales, preferencias y actividad en PostgreSQL; selecciona señales y coordina la generación de recomendaciones. |
| `server/services/recommendations.js` | Resuelve artistas, consulta MusicBrainz/ListenBrainz, busca canciones y aplica diversidad, deduplicación y exclusiones. |
| `server/migrations/001-profiles.sql` | Define las tablas e índices de personalización, creados al iniciar. |
| `server/test/` | Pruebas de consultas, caché, descargas, aislamiento de dispositivos, rangos de audio, recuperación, entorno y personalización. |

## Interfaz

| Archivo | Responsabilidad |
| --- | --- |
| `web/src/App.jsx` | Coordina navegación, búsqueda, selección, reproducción nativa, video, Media Session y eventos de escucha. |
| `web/src/api.js` | Construye URLs y peticiones, conserva el identificador del dispositivo y recibe progreso mediante SSE o polling en `trycloudflare.com`. |
| `web/src/personalization.js` | Crea y conserva la credencial del perfil; envía señales y cambios de preferencias, desactiva o borra el perfil. |
| `web/src/cache.js` | Comparte y conserva temporalmente búsquedas y playlists en el navegador. |
| `web/src/components/Home.jsx` | Presenta recomendaciones, motivos, búsquedas recientes y estados iniciales. |
| `web/src/components/TrackRow.jsx` | Presenta selección, reproducción, likes, exclusión y descarga; adapta acciones a móvil. |
| `web/src/components/DownloadQueue.jsx` | Muestra lotes y trabajos del navegador, archivos disponibles y reintentos. |
| `web/src/components/Preferences.jsx` | Ajustes de personalización, borrado e instalación. |
| `web/src/components/InstallApp.jsx` | Gestiona la invitación de instalación disponible o muestra instrucciones del navegador. |
| `web/src/components/MotionLogo.jsx` | Logotipo y estados animados. |
| `web/src/motion.js` | Transiciones de vistas con respeto a movimiento reducido. |
| `web/src/index.css`, `web/src/home.css` | Temas, layout, reproductor, adaptación móvil y estados de carga. |
| `web/src/main.jsx` | Monta React y registra el service worker solo en producción. |
| `web/vite.config.js`, `web/service-worker.js` | Generan la versión y lista de recursos PWA; sirven la interfaz en caché cuando falla la navegación sin conexión. |
| `web/public/manifest.webmanifest`, `web/public/icons/` | Identidad, modo standalone e iconos de instalación. |
| `web/test/` | Pruebas de cliente API, identificador privado, caché y transiciones. |

## Flujos principales

**Descarga:** navegador → API con identificador privado → lote persistente → yt-dlp/MP3 compartido → progreso filtrado por propietario → enlace privado MP3 o ZIP. La cola de procesamiento es común; el historial visible y el acceso a archivos pertenecen al navegador. SSE entrega instantánea y cambios; los túneles rápidos usan consultas cada dos segundos.

**Reproducción:** audio nativo → `/api/audio/:id` con identificador → preparación en la cola o reutilización del MP3 → respuesta con soporte de rangos HTTP. Los trabajos de reproducción no aparecen en descargas. Media Session conecta los controles del sistema; el video opcional se reproduce por separado del audio nativo.

**Personalización:** actividad y preferencias → API con credencial Bearer → PostgreSQL → selección de canciones iniciales → proveedores musicales y búsquedas → recomendaciones persistidas → consulta periódica del frontend. La credencial del perfil y el identificador de descargas son independientes.

**PWA:** build de Vite → service worker y recursos estáticos versionados → registro en producción → caché de la interfaz. Las rutas `/api`, audio y descargas quedan fuera de esa caché.
