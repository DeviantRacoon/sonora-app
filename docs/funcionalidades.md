# Funcionalidades

## Búsqueda y playlists

Sonora busca canciones y playlists en paralelo y muestra título, canal, duración y miniatura cuando están disponibles. Si falla solo la búsqueda de playlists, muestra las canciones y un aviso de resultados parciales. Una playlist extensa muestra sus primeras 200 entradas y un aviso.

Las consultas idénticas en curso comparten el mismo resultado. Las búsquedas y playlists se conservan temporalmente en el servidor y el navegador; los fallos y resultados parciales no se guardan en caché. Durante la búsqueda, el contenido anterior no ocupa espacio en desktop: el indicador y el reproductor no generan scroll por elementos ocultos. Las listas largas sí permiten desplazarse.

## Reproducción

El reproductor utiliza audio nativo: reproducir, pausar, cambiar de pista y avanzar automáticamente dentro de la selección desde la que se inició la escucha. El servidor prepara el MP3 en la cola y reutiliza el archivo si ya está disponible. La preparación puede retrasar el inicio de una canción.

Media Session publica el título y artista y conecta los controles de reproducción del sistema, auriculares y pantalla de bloqueo cuando el navegador los admite. El audio puede continuar en segundo plano o con la pantalla apagada; la continuidad depende del navegador y del sistema operativo.

**Ver video** abre el reproductor de YouTube y pausa el audio nativo para evitar dos reproducciones simultáneas. **Ver disco** vuelve al audio. El video no ofrece la misma continuidad en segundo plano.

## Móvil y desktop

Los botones de desktop conservan su apariencia compacta. Hasta 650 px, las acciones de preferencias tienen zonas táctiles de al menos 44 px y etiquetas visibles. El reproductor se abre ampliado en móvil, con progreso, controles, favoritos, exclusión y descarga; puede contraerse sin detener el audio. Los controles de preferencias dependen de que la personalización esté activada.

La interfaz incluye búsquedas recientes, tema claro u oscuro, mensajes de estado y soporte para movimiento reducido. El tema y las búsquedas recientes se almacenan en el navegador.

## Descargas por navegador

Se pueden descargar canciones individualmente o seleccionar varias para obtener un lote ZIP sin recompresión. El audio se convierte a MP3 con metadatos y miniatura. La cola muestra progreso, fallos parciales y reintentos; permite recuperar las canciones completadas aunque otras fallen.

Cada navegador tiene su propio historial visible, eventos, acceso a archivos y reintentos, identificado por `sonora-device`. Las pestañas del mismo navegador lo comparten; otro dispositivo o navegador tiene otro identificador. La capacidad de procesamiento y la caché de MP3 siguen siendo comunes al servidor. Preparar audio para escuchar no añade entradas a la cola visible de descargas.

Borrar los datos del sitio pierde el identificador y el acceso al historial anterior. Los lotes antiguos sin propietario no se muestran ni se reasignan; la actualización no elimina sus archivos. La cola persistente se recupera al reiniciar el servidor y marca como fallidos los trabajos cuyo MP3 ya no existe.

## Inicio y recomendaciones

La sección **Hecho para ti** utiliza un perfil privado del navegador. Aprende de reproducciones de al menos 30 segundos, solicitudes de descarga aceptadas y likes; las búsquedas libres no se usan como gustos. Las recomendaciones empiezan después de reunir tres canciones distintas como señales válidas.

El motor prioriza likes y actividad reciente, identifica artistas con MusicBrainz, consulta artistas relacionados en ListenBrainz y busca sus canciones mediante yt-dlp. Combina artistas conocidos y descubrimientos, elimina duplicados, respeta exclusiones y limita los resultados por artista. Si los proveedores fallan o no identifican un artista con suficiente claridad, puede devolver menos canciones o ninguna.

Desde Ajustes se puede desactivar la personalización conservando el perfil, o borrar el perfil y desactivar el aprendizaje. Un **No me interesa** se puede deshacer desde la canción en los resultados de búsqueda. Los perfiles no se sincronizan entre dispositivos.

## PWA e interfaz sin conexión

La compilación de producción incluye manifiesto, iconos y service worker. Se puede instalar desde **Ajustes → Instalar Sonora** o desde el menú del navegador. En iPhone o iPad, las instrucciones indican Safari → Compartir → Añadir a pantalla de inicio. Requiere HTTPS o localhost.

Después de instalarse el service worker, la interfaz puede abrirse sin conexión. La API, el audio y los archivos descargados no se guardan en esa caché: buscar, generar recomendaciones, preparar o solicitar audio y descargar archivos requieren conectividad. La PWA no incorpora una biblioteca musical offline.
