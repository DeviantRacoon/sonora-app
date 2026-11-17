# API y eventos

| Método y ruta | Función |
| --- | --- |
| `GET /api/search?q=...` | Busca canciones y playlists. Devuelve `partial: true` si falla la búsqueda de playlists. |
| `GET /api/playlist?id=...` | Obtiene canciones de una playlist. Devuelve `truncated: true` si supera el límite. |
| `GET /api/downloads` | Historial y progreso del navegador actual. |
| `GET /api/audio/:id` | Prepara audio en la cola y entrega MP3 con soporte de rangos HTTP; no aparece en descargas. |
| `POST /api/downloads` | Crea un lote con `{ items: [{ id, title }], album }`. |
| `POST /api/downloads/:jid/retry` | Reintenta un trabajo fallido y devuelve `{ ok }`. |
| `GET /api/downloads/batches/:bid/file` | Entrega el MP3 o ZIP cuando el lote está listo. |
| `GET /api/downloads/stream` | Abre el flujo SSE de lotes y trabajos. |

El flujo SSE envía primero una instantánea de lotes y trabajos, seguida de cambios de estado y avisos de eliminación de lotes. El estado de un lote indica si está listo, si hay archivos disponibles y cuántos trabajos terminaron o fallaron.

Las rutas `/api/downloads` (incluidas sus subrutas) y `/api/audio/:id` requieren `X-Sonora-Device` con un UUID v4 privado que el cliente conserva en `localStorage`. Los elementos multimedia, SSE y enlaces de descarga envían el mismo identificador mediante `?device=...`. Sin identificador válido se devuelve 401; los archivos de otro navegador devuelven 404 y sus reintentos devuelven `{ ok: false }`. El servidor filtra las instantáneas y los eventos, sin exponer los identificadores de otros dispositivos. Los lotes antiguos sin propietario no se muestran ni se reasignan.

## Salud y personalización

| Método y ruta | Cuerpo / respuesta |
| --- | --- |
| `GET /api/health` | Devuelve `{ "ok": true }`. |
| `POST /api/profile` | Crea un perfil y devuelve `{ token }` con HTTP 201. |
| `PATCH /api/profile` | `{ enabled: boolean }`: activa o desactiva conservando el perfil. |
| `DELETE /api/profile` | Elimina el perfil, actividad y preferencias; devuelve `{ ok: true }`. |
| `POST /api/profile/events` | `{ eventId, track: { id, title, channel }, kind, weight? }`, con `kind` igual a `play` o `download`. |
| `PUT /api/profile/preferences/:id` | `{ track: { id, title, channel }, kind }`, con `kind` igual a `like`, `exclude` o `null` para quitar la preferencia. |
| `GET /api/recommendations` | Devuelve `{ state, tracks, preferences }` para el perfil. |

Salvo crear un perfil y consultar salud, estas rutas necesitan `Authorization: Bearer <token>`. La credencial se conserva como `sonora-profile` y es independiente de `sonora-device`; no se envía a los proveedores musicales. Un token inválido o eliminado devuelve 401. Sin `DATABASE_URL`, las rutas de personalización responden 503. Las peticiones de perfil se limitan a 120 por minuto y dirección de conexión (429 al superar el límite).

`eventId` debe ser UUID; `track.id`, un ID de video válido. Título y canal aceptan hasta 500 y 300 caracteres, respectivamente. `weight` debe ser un número mayor que cero y no superior a 3; las reproducciones se guardan con peso 1. El cliente registra una reproducción tras 30 segundos y reparte el peso de descarga entre canciones del lote. Los eventos repetidos se deduplican.

| `state` | Significado |
| --- | --- |
| `disabled` | Personalización desactivada. |
| `learning` | Todavía no hay señales de tres canciones distintas. |
| `building` | Primera generación en curso y sin canciones previas. |
| `ready` | Hay canciones guardadas; una actualización puede estar ejecutándose en segundo plano. |
| `unavailable` | No hay canciones disponibles ni generación en curso. |

`preferences` es un mapa de ID de video a `like` o `exclude`. Las canciones recomendadas incluyen datos de búsqueda, artista y motivo. La generación es asíncrona: consultar recomendaciones puede iniciarla y devolver el estado antes de que termine.

## Audio, polling y errores de descargas

`GET /api/audio/:id` prepara o reutiliza un MP3 mediante la cola limitada. Responde con `audio/mpeg` y admite `Range` (206 para rangos válidos). Un ID inválido devuelve 400, falta de capacidad devuelve 429 y un trabajo terminado sin audio disponible devuelve 502. La espera de preparación se limita a tres minutos; un error de esa espera devuelve 500. El cliente puede volver a solicitar el audio para reintentar. Estos trabajos no se publican en el historial visible ni en su SSE.

`GET /api/downloads` devuelve `{ jobs, batches }` sin caché para el navegador identificado. El cliente lo consulta cada dos segundos cuando el hostname de la interfaz termina en `.trycloudflare.com`; en otros orígenes utiliza SSE. Sus eventos tienen `type` igual a `job`, `batch` o `batch_removed`.

Crear lotes exige de 1 a 200 canciones con ID válido; datos inválidos devuelven 400 y falta de capacidad global devuelve 429. Un archivo de lote inexistente o ajeno devuelve 404; si todavía no está listo, 409. Un lote de una canción entrega MP3; varias canciones entregan ZIP con los archivos que terminaron correctamente. Un reintento ajeno, no fallido o sin capacidad devuelve `{ ok: false }`.
