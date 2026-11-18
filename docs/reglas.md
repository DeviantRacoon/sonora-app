# Reglas y límites

## Búsquedas y caché

- La búsqueda acepta hasta 200 caracteres; los IDs de video y playlist se validan en el servidor.
- Una playlist devuelve como máximo sus primeras 500 entradas.
- Se ejecutan hasta cuatro procesos de consulta simultáneos, con 60 segundos y 10 MB de salida combinada como máximo por proceso. Se admiten hasta 32 consultas esperando un proceso durante 15 segundos; saturación devuelve 503 con `Retry-After`.
- La caché de respuestas del servidor conserva hasta 200 resultados / 16 MiB en memoria y, con PostgreSQL, hasta 2.000 resultados / 64 MiB de JSON serializado. El TTL absoluto es de 10 minutos; respuestas mayores de 1 MiB, errores y resultados parciales no se guardan. Las consultas idénticas comparten promesa; se admiten hasta 32 claves pendientes. Sin PostgreSQL funciona en memoria; un fallo de caché persistente no impide devolver el resultado. La caché del navegador conserva hasta 200 resultados durante 10 minutos.

## Cola y descargas

- Cada lote contiene entre 1 y 500 canciones; la cola admite hasta 1.000 trabajos pendientes o activos de descarga y una reserva de 16 para reproducción. Si no hay capacidad para todo el lote, la API responde con HTTP 429.
- Se ejecutan hasta dos descargas reales simultáneas, compartidas entre trabajos del mismo video. Los lotes alternan turnos y la reproducción tiene prioridad al liberarse un cupo. Cada proceso dispone de 30 minutos como máximo.
- El progreso se agrupa cada 250 ms y los estados finales se publican inmediatamente. Cada trabajo dispone de tres intentos, con esperas de 2 y 10 segundos sin ocupar un cupo. El reintento manual abre otra ronda de tres intentos. Con PostgreSQL, los trabajos y sus transiciones se guardan antes de ejecutarse; los interrumpidos se recuperan al reiniciar. Un fallo de persistencia pausa admisiones y ejecuciones hasta recuperar la escritura.
- Cada lote conserva los títulos solicitados para nombrar los archivos entregados.

## Conservación

- Los lotes terminados se conservan siete días desde su finalización.
- Los MP3 se conservan siete días desde su última reutilización y mientras un lote vigente los necesite.
- La limpieza se ejecuta al arrancar y cada hora; respeta los archivos en uso. Los archivos temporales se eliminan al iniciar.
- Se requiere una única instancia del servidor y almacenamiento persistente para `MUSIC_DIR`.

## Dispositivos y reproducción

- Historial, eventos, archivos y reintentos de descargas se filtran por un UUID v4 privado del navegador. No se utiliza el perfil de recomendaciones para esta separación.
- Las pestañas del mismo navegador y origen comparten el identificador. Un navegador, origen o dispositivo distinto obtiene otro; borrar los datos locales pierde el acceso al historial anterior.
- Los lotes anteriores sin propietario no se reasignan ni se muestran. Los archivos siguen sujetos a la retención habitual.
- Preparar audio comparte la concurrencia y utiliza su reserva de 16 trabajos pendientes; no crea una descarga visible. El endpoint espera hasta tres minutos a la preparación antes de devolver un error; el trabajo ya encolado puede continuar.
- El audio admite rangos HTTP y controles Media Session cuando están disponibles. La continuidad con pantalla apagada depende del navegador y del sistema; el video pausa el audio nativo.

## Personalización

- Requiere `DATABASE_URL` y PostgreSQL accesible. Sin configurar la variable, las rutas de personalización responden 503 y el resto de la aplicación puede utilizarse.
- El perfil necesita señales de tres canciones distintas para iniciar recomendaciones. Una reproducción se registra tras 30 segundos; una solicitud de descarga aceptada también aporta una señal. Las búsquedas libres no aportan gustos.
- Cada reproducción registrada pesa 1. Las descargas reparten hasta 3 de peso entre las canciones del lote; la actividad pierde peso con una escala de 30 días. Los likes se incluyen antes de la actividad al seleccionar canciones iniciales.
- Se deduplican eventos por identificador y se evita repetir la señal del mismo tipo para la misma canción y perfil durante un día.
- El motor toma hasta tres artistas iniciales, combina canciones conocidas y descubrimientos, entrega hasta 12 canciones y como máximo dos por artista. Omite artistas ambiguos y canciones excluidas.
- Las recomendaciones se consideran antiguas después de seis horas. Cambiar una preferencia invalida su fecha; la generación es asíncrona, con hasta dos perfiles a la vez y al menos cinco minutos entre intentos de cada perfil. La interfaz consulta cada 15 segundos mientras está activada la personalización.
- Las rutas de perfiles tienen un límite de 120 peticiones por minuto y dirección de conexión; detrás de un proxy varias personas pueden compartir ese límite.
- La actividad se conserva 90 días, las preferencias hasta borrarlas y los perfiles inactivos hasta un año. Desactivar conserva el perfil; borrarlo elimina también actividad y preferencias. No hay sincronización entre dispositivos.

## PWA y actualizaciones

- Instalación y service worker requieren HTTPS o localhost; el registro solo se realiza en el build de producción.
- La caché PWA conserva la interfaz, sin rutas API, MP3 ni ZIP. Abrir la interfaz sin conexión no permite buscar ni descargar música nueva.
- El service worker cambia de versión al cambiar sus recursos compilados o plantilla. Una versión nueva puede quedar esperando hasta que se cierren las pestañas y ventanas que usan la anterior; no se fuerza su activación durante la reproducción.
- Los ajustes de botones táctiles se limitan a vistas de hasta 650 px; desktop conserva los controles compactos. Los resultados anteriores se retiran del layout mientras se busca en desktop para evitar scroll vacío.
