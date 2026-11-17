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
