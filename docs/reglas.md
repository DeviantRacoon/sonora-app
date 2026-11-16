# Reglas y límites

## Búsquedas y caché

- La búsqueda acepta hasta 200 caracteres; los IDs de video y playlist se validan en el servidor.
- Una playlist devuelve como máximo sus primeras 200 entradas.
- Se ejecutan hasta cuatro procesos de consulta simultáneos, con 60 segundos y 10 MB de salida combinada como máximo por proceso.
- Las cachés del servidor y del navegador conservan hasta 200 resultados durante 10 minutos. Las consultas idénticas pendientes comparten la misma promesa.

## Cola y descargas

- Cada lote contiene entre 1 y 200 canciones; la cola admite hasta 500 trabajos pendientes o activos. Si no hay capacidad para todo el lote, la API responde con HTTP 429.
- Se ejecutan hasta dos descargas simultáneas. Cada proceso dispone de 30 minutos como máximo.
- El progreso se publica cuando cambia el porcentaje entero. Los trabajos fallidos pueden reintentarse.
- Cada lote conserva los títulos solicitados para nombrar los archivos entregados.

## Conservación

- Los lotes terminados se conservan siete días desde su finalización.
- Los MP3 se conservan siete días desde su última reutilización y mientras un lote vigente los necesite.
- La limpieza se ejecuta al arrancar y cada hora; respeta los archivos en uso. Los archivos temporales se eliminan al iniciar.
- Se requiere una única instancia del servidor y almacenamiento persistente para `MUSIC_DIR`.
