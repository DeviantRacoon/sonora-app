# Funcionalidades

## Búsqueda y playlists

La aplicación busca canciones y playlists en paralelo y muestra título, canal, duración y miniatura cuando están disponibles. Si falla solo la búsqueda de playlists, muestra las canciones y avisa que los resultados son parciales. Una playlist extensa muestra sus primeras 200 entradas y un aviso.

Las búsquedas y playlists se guardan temporalmente en el servidor y en el navegador. Las peticiones idénticas en curso comparten el mismo resultado; los fallos y resultados parciales no se conservan en caché.

## Descargas

El usuario puede seleccionar canciones, descargarlas individualmente o agruparlas en un lote. El audio se convierte a MP3 con metadatos y miniatura. Los lotes con varias canciones se entregan en un ZIP sin recompresión.

La interfaz muestra el estado y el progreso de cada trabajo. Los lotes parcialmente fallidos permiten descargar las canciones completadas y reintentar las fallidas. Las descargas repetidas de un mismo video comparten el trabajo en curso o reutilizan el MP3 guardado.

La cola se recupera tras reiniciar el servidor: los trabajos interrumpidos vuelven a encolarse. Si falta un MP3 guardado, el trabajo se marca como fallido para permitir su reintento.

## Interfaz y reproducción

La interfaz ofrece vista previa con el reproductor de YouTube, selección de canciones, cola de descargas, reintentos, búsquedas recientes y selección de tema. Las búsquedas recientes y el tema se almacenan en el navegador.
