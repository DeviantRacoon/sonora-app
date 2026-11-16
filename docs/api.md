# API y eventos

| Método y ruta | Función |
| --- | --- |
| `GET /api/search?q=...` | Busca canciones y playlists. Devuelve `partial: true` si falla la búsqueda de playlists. |
| `GET /api/playlist?id=...` | Obtiene canciones de una playlist. Devuelve `truncated: true` si supera el límite. |
| `POST /api/downloads` | Crea un lote con `{ items: [{ id, title }], album }`. |
| `POST /api/downloads/:jid/retry` | Reintenta un trabajo fallido y devuelve `{ ok }`. |
| `GET /api/downloads/batches/:bid/file` | Entrega el MP3 o ZIP cuando el lote está listo. |
| `GET /api/downloads/stream` | Abre el flujo SSE de lotes y trabajos. |

El flujo SSE envía primero una instantánea de lotes y trabajos, seguida de cambios de estado y avisos de eliminación de lotes. El estado de un lote indica si está listo, si hay archivos disponibles y cuántos trabajos terminaron o fallaron.
