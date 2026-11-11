# ADR-020: Fotos de producto dentro de PostgreSQL, tras una interfaz de almacenamiento

- **Estado:** Aceptado (decisión del cliente del 2026-11-05, Q-09 opción C y 9.1)
- **Fecha:** 2026-11-05
- **Sustituye en parte:** la restricción «API solo JSON, sin archivos» (P-14 / ADR-011), que seguía vigente hasta S3.

## Contexto

El cliente pidió fotografías de producto (B8): hasta 5 por producto, una principal, JPG/PNG/WebP de hasta 5 MB, reducidas a ~1200 px, subidas por quien gestiona el catálogo, y la posibilidad de adjuntar la foto al crear una pieza durante un ingreso. Es una pyme con pocos usuarios y un solo servicio desplegado; añadir un servicio externo (bucket) implica otra cuenta, otras credenciales, otra factura y otro punto de falla. Los archivos subidos son además superficie de ataque (formatos engañosos, metadatos, archivos políglota, bombas de descompresión).

## Decisión

1. **Los bytes se guardan en PostgreSQL** (`bytea`), junto al resto de los datos: la copia de seguridad de la base ya los incluye y no hay otro servicio que operar.
2. **Dos tablas** (migración `20261106010400_product_photos`):
   - `product_photos`: solo metadatos (producto, tipo, ancho, alto, tamaño, `sha256`, posición, `is_cover`, quién la subió). Los listados leen únicamente esta tabla.
   - `product_photo_blobs`: `photo_id` (PK, FK en cascada) y `bytes`. Solo se lee en el endpoint que sirve la imagen.
3. **Interfaz `PhotoStorage`** (`put`, `get`, `remove`) en `apps/api/src/modules/catalog/photos/photo-storage.ts`, con la implementación `PostgresPhotoStorage`. El servicio de fotos no sabe dónde viven los bytes.
4. **Procesamiento en el servidor** con `sharp`: se comprueba la firma real del archivo (JPEG, PNG o WebP; la extensión y el `Content-Type` declarados se ignoran), se decodifica y se **re-codifica siempre a WebP** (calidad 82) con lado mayor ≤ 1200 px y sin ampliar. La re-codificación elimina EXIF/GPS/ICC y cualquier contenido añadido o incrustado, y deja una lista blanca de un solo formato al servir. Tope de 64 megapíxeles decodificados; solo el primer fotograma.
5. **Límites**: 5 MB por archivo (`@fastify/multipart`, `fileSize`), 1 archivo y como máximo 3 partes por petición; el resto de la API sigue limitada a JSON de 1 MiB (el plugin vive solo en el contexto de las rutas de fotos). Máximo 5 fotos por producto, garantizado bajo bloqueo de la fila del producto. Tope de subidas por usuario/IP (40 por minuto).
6. **Servir la imagen**: `GET /api/v1/products/:id/photos/:photoId` con `catalog:read` (el Vendedor ve las fotos; los costos siguen ocultos), `ETag` = `sha256`, `304` sin leer los bytes, `Cache-Control: private, max-age=31536000, immutable` (cada foto tiene un id nuevo), `Content-Type` tomado de una lista blanca, `X-Content-Type-Options: nosniff` y `Content-Security-Policy: default-src 'none'; sandbox`.
7. **Permisos y auditoría**: subir, portada, reordenar y eliminar requieren `catalog:manage`; cada acción escribe en `audit_logs` dentro de la misma transacción (`product.photo_added`, `product.photo_cover_changed`, `product.photos_reordered`, `product.photo_removed`), sin bytes.
8. **Alta rápida en un ingreso (9.1)**: la subida funciona con el id de un producto ya creado. El flujo del integrador es: crear el producto, y con el `id` devuelto llamar a `POST /products/:id/photos` (o usar el componente `PhotoUploader` / el hook `useUploadProductPhoto`, que no dependen de la ficha del producto).
9. **Borrado**: la eliminación física de un producto (B11) borra sus fotos en cascada; las fotos de un producto con historial se conservan mientras el producto exista (los productos se desactivan, no se borran).

## Alternativas consideradas

| Alternativa                         | Por qué no                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Disco del contenedor / volumen      | Se pierde en cada despliegue en hosting sin disco persistente; no entra en el respaldo de la base; complica el escalado a más de una copia. |
| Bucket externo (Cloudflare R2, S3)  | Mejor a gran escala, pero añade cuenta, credenciales, costos y un punto de falla; el cliente eligió la opción C (todo en PostgreSQL).       |
| Guardar el original sin reducirlo   | Fotos de 5 MB × 5 por producto inflan la base y los respaldos; además conservaría EXIF/GPS y contenido arbitrario.                          |
| Una sola tabla con la columna bytes | Menos tablas, pero una consulta con `include` podría arrastrar los bytes; con la tabla aparte es imposible cargarlos por accidente.         |
| Servir como data-URI en el JSON     | Listados enormes, sin caché del navegador, sin ETag.                                                                                        |

## Dependencias nuevas (regla de `CLAUDE.md`)

- **`@fastify/multipart`** (mantenido por el equipo de Fastify): único modo soportado de recibir `multipart/form-data` con límites de tamaño, partes y campos. Escribir un analizador propio sería más riesgoso.
- **`sharp`**: decodifica y re-codifica imágenes (libvips) con binarios precompilados. Se verificó en Windows (desarrollo) y también se verificó en la imagen Docker de producción: se construyó la etapa `prod-deps` (Alpine, `npm ci --omit=dev`) y `sharp` procesó una imagen con el binario `linuxmusl-x64`, sin cambios en el `Dockerfile` ni paquetes del sistema. Es la librería estándar de Node para este caso; las alternativas en JavaScript puro son más lentas o no cubren WebP. Se vigila con `npm audit` como el resto de dependencias.

## Consecuencias

- **Volumen estimado**: una foto reducida suele pesar 40–150 KB. Con 2 000 productos × 3 fotos ≈ 0,5–1 GB. Es manejable en PostgreSQL, pero hay que vigilar el tamaño de la base y el plan del hosting; los respaldos crecen en la misma proporción.
- **Memoria**: se procesa una imagen a la vez por petición; el archivo (≤ 5 MB) se lee entero en memoria. `sharp.cache(false)` evita retener memoria en libvips.
- **Carga**: servir imágenes pasa por el proceso de la API y la base. Se mitiga con `ETag`, `304` sin leer bytes y caché `immutable` del navegador.
- **Sin recorte ni edición** de imágenes ni vistas previas en varios tamaños (solo una versión de ≤ 1200 px, la miniatura es la misma imagen reducida por el navegador).
- **Consistencia**: foto, bytes y auditoría se escriben en la misma transacción. Con un bucket externo esto deja de ser posible (ver plan de migración).

## Plan de migración a un bucket

1. Implementar `S3PhotoStorage` (`put`/`get`/`remove`) y elegirla por una variable de entorno (validada en `config/env.ts`).
2. Añadir a `product_photos` una columna `storage_key` (nullable) y marcar qué filas ya están fuera de la base.
3. Script de migración idempotente: copiar `bytes` al bucket, comprobar `sha256`, guardar `storage_key` y recién entonces borrar la fila de `product_photo_blobs`.
4. En una implementación externa `put` no puede participar en la transacción: se sube **antes** de confirmar y, si la transacción falla, se borra el objeto (o un barrido periódico elimina huérfanos). `remove` se ejecuta **después** de confirmar.
5. Servir por URL firmada de corta duración o seguir proxiando desde la API (para conservar la comprobación de `catalog:read`).

## Nota 2026-11-10: miniaturas y portadas sin revalidación (DT-DAT-17/18, OD-04)

Esta nota complementa la decisión sin reescribirla; deja sin efecto la consecuencia «Sin recorte ni edición de imágenes ni vistas previas en varios tamaños» en lo que respecta a los tamaños.

- **Miniaturas**: además de la versión de ≤ 1200 px, cada foto tiene miniaturas WebP (calidad 78) de **160, 320 y 640 px de ancho**, solo las menores que la foto. Lista blanca cerrada (`PHOTO_THUMB_WIDTHS`, CHECK en la base): un tamaño arbitrario permitiría agotar CPU y espacio. Se generan con el mismo `sharp` (sin dependencias nuevas) a partir de la foto ya re-codificada, **al subir** y en la misma transacción, en la tabla `product_photo_thumbnails` (migración `20261110000000_product_photo_thumbnails`). Siguen viviendo en PostgreSQL detrás de `PhotoStorage` (`putThumbnails`, `getThumbnail`, `saveThumbnail`), así que el plan de migración a un bucket se extiende a ellas.
- **Fotos anteriores**: si falta la miniatura, el endpoint la genera desde la original y la guarda (`INSERT … ON CONFLICT DO NOTHING`, fuera de transacción; si la foto se eliminó mientras tanto, no guarda nada). No hace falta un script de migración.
- **Servir**: `GET /products/:id/photos/:photoId?w=160|320|640` (mismos permisos y cabeceras; `ETag` = `"<sha256>-w<ancho>"`, `304` sin leer bytes, `Cache-Control: private, max-age=31536000, immutable`). Un ancho mayor o igual que la foto devuelve la original. Cualquier otro valor → 400.
- **Portadas**: en vez de añadir `coverPhotoId` a cada listado (OD-04 A), que cambiaría los esquemas de una docena de respuestas, `GET /products/variants/covers?ids=…` (≤ 100) devuelve los metadatos de la portada de varias piezas en una petición; la web la agrupa por pantalla, la reutiliza 5 minutos (TanStack Query, invalidada al cambiar fotos) y pide la imagen por su URL inmutable. Se logra el mismo objetivo (cero revalidaciones por imagen) sin tocar otros módulos. `/variants/:variantId/cover` se conserva (con `?w=`) como respaldo.
- **Consecuencias**: ~55 % más espacio por foto en la base y los respaldos (medido en una fotografía real reducida a 1200 × 750 = 44,7 KB; miniaturas de 160 / 320 / 640 px = 2,5 / 6,3 / 15,6 KB). Una lista que muestra miniaturas de 160 px transfiere ~6 % de lo que transfería con la foto completa, y el navegador decodifica imágenes ~50 veces más pequeñas en píxeles.

## Seguridad

Validación por contenido y re-codificación obligatoria (archivos renombrados, SVG/HTML/GIF, políglotas y EXIF no llegan a guardarse); lista blanca de `Content-Type`, `nosniff` y CSP restrictiva al servir; límites de tamaño, partes y píxeles; permisos por endpoint; tope de subidas; CSRF y CORS como en el resto de la API (la cookie de sesión acompaña a las etiquetas `<img>` del mismo origen). Ver [SECURITY.md](../security/SECURITY.md).
