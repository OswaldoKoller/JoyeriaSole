# API REST

Base: `/api/v1` · JSON · Autenticación por cookie de sesión (httpOnly, SameSite=Strict).

## Convenciones

- Recursos en plural y kebab-case: `/stock-entries`, `/inventory-counts`.
- `GET` lista/detalle · `POST` crear · `PATCH` modificar parcialmente · acciones de estado como
  sub-recurso: `POST /stock-entries/:id/confirm`, `POST /inventory/counts/:id/approve`.
- **Sin `DELETE` para entidades con historial**: se desactivan (`PATCH { isActive: false }`). La única
  eliminación física es la de fichas de producto sin movimientos (`DELETE /products/:id`, solo
  Administrador) y la de fotos.
- Paginación: `?page=1&pageSize=25` (máx. 100) → `meta: { page, pageSize, total }`.
- Fechas ISO 8601 en UTC. Montos como string decimal (`"125.50"`) para no perder precisión.
- Cada respuesta incluye la cabecera `x-request-id` (también presente en los errores) para
  rastrear en los logs.
- Versionado: cambios incompatibles → `/api/v2`, conviviendo un tiempo con v1.

## Formato de respuesta

Éxito:

```json
{ "data": { "...": "..." }, "meta": { "page": 1, "pageSize": 25, "total": 130 } }
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos enviados no son válidos",
    "details": [{ "field": "body.email", "message": "Correo inválido" }],
    "requestId": "2f0c..."
  }
}
```

| HTTP | `code`                      | Cuándo                                                                                                          |
| ---- | --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`          | Datos de entrada inválidos (Zod) o JSON mal formado                                                             |
| 401  | `UNAUTHENTICATED`           | Sin sesión, sesión expirada/revocada, credenciales inválidas                                                    |
| 403  | `FORBIDDEN`                 | Sesión válida sin el permiso requerido; origen no permitido                                                     |
| 403  | `PASSWORD_CHANGE_REQUIRED`  | Clave temporal asignada por el Administrador: solo se puede cambiarla (`/auth/change-password`) o cerrar sesión |
| 404  | `NOT_FOUND`                 | Recurso o ruta inexistente                                                                                      |
| 409  | `CONFLICT`                  | Duplicado (SKU, código de barras, NIT...)                                                                       |
| 422  | `BUSINESS_RULE_VIOLATION`   | Regla de negocio (p. ej. confirmar un ingreso ya confirmado)                                                    |
| 422  | `STOCK_BLOCKS_DEACTIVATION` | No se desactiva un producto o variante con stock > 0 (P-22); `details.variants` lista SKU y cantidad            |
| 413  | `PAYLOAD_TOO_LARGE`         | Archivo subido de más de 5 MB (fotos) o demasiadas partes en la petición multipart                              |
| 429  | `RATE_LIMITED`              | Demasiadas solicitudes                                                                                          |
| 500  | `INTERNAL_ERROR`            | Error técnico. Nunca incluye detalles internos; ver logs con el `requestId`                                     |

## Endpoints implementados

Los endpoints del conteo físico (`/inventory/counts`) están en su propia sección más abajo.

| Método | Ruta                                      | Auth                                                                            | Descripción                                                                                                                                                                                                                                                                                       |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                                 | —                                                                               | Estado del servicio y de la BD (`200` ok / `503` degradado)                                                                                                                                                                                                                                       |
| POST   | `/auth/login`                             | —                                                                               | `{ email, password }` → `200 { data: { mustChangePassword } }` + cookie (sesión fija de 8 h). Límite: 10 intentos / 15 min por IP                                                                                                                                                                 |
| POST   | `/auth/change-password`                   | sesión                                                                          | Valida contraseña actual; revoca todas las sesiones y exige nuevo login                                                                                                                                                                                                                           |
| POST   | `/auth/logout`                            | sesión                                                                          | Revoca la sesión → `204`                                                                                                                                                                                                                                                                          |
| GET    | `/auth/me`                                | sesión                                                                          | Usuario actual con roles, permisos y `mustChangePassword`                                                                                                                                                                                                                                         |
| GET    | `/approvals/pending`                      | uno de `inventory:adjust-approve`, `prices:approve`, `inventory-counts:approve` | Bandeja «Pendientes de aprobación» (Q-14): `{ data: { adjustments, prices, counts, total } }`. Cada total es `null` si la persona no tiene el permiso para resolver ese tipo; `403` si no tiene ninguno. Ver [Pendientes de aprobación](#pendientes-de-aprobación-q-14)                           |
| GET    | `/suppliers`                              | `suppliers:read`                                                                | Lista paginada; filtros `q` (nombre, NIT, país o contacto), `status`, `type` y página                                                                                                                                                                                                             |
| GET    | `/suppliers/:id`                          | `suppliers:read`                                                                | Detalle de un proveedor; 404 si no existe                                                                                                                                                                                                                                                         |
| POST   | `/suppliers`                              | `suppliers:manage`                                                              | Crea un proveedor (solo `name` obligatorio; `type`=NATIONAL y `defaultCurrency`=BOB por defecto); auditoría; 201                                                                                                                                                                                  |
| PATCH  | `/suppliers/:id`                          | `suppliers:manage`                                                              | Edita campos o `isActive`; auditoría con antes/después                                                                                                                                                                                                                                            |
| GET    | `/users`                                  | `users:read`                                                                    | Lista paginada; filtros por nombre/correo y estado                                                                                                                                                                                                                                                |
| GET    | `/users/:id`                              | `users:read`                                                                    | Consulta usuario y roles; no expone contraseña ni sesiones                                                                                                                                                                                                                                        |
| POST   | `/users`                                  | `users:manage` + `roles:manage`                                                 | Crea usuario con roles y contraseña inicial; audita sin exponer hash                                                                                                                                                                                                                              |
| GET    | `/users/roles`                            | `users:read` + `roles:manage`                                                   | Roles disponibles para asignación múltiple                                                                                                                                                                                                                                                        |
| PATCH  | `/users/:id`                              | `users:manage`                                                                  | Edita nombre/estado; revoca sesiones al desactivar; audita el cambio                                                                                                                                                                                                                              |
| PUT    | `/users/:id/roles`                        | `users:manage` + `roles:manage`                                                 | Reemplaza la asignación de roles; protege al último administrador                                                                                                                                                                                                                                 |
| POST   | `/users/:id/reset-password`               | `users:manage`                                                                  | `{ temporaryPassword }` (≥ 10): marca cambio obligatorio, revoca sesiones, audita sin la clave; no sobre uno mismo                                                                                                                                                                                |
| GET    | `/categories`                             | `catalog:read`                                                                  | Lista categorías y subcategorías                                                                                                                                                                                                                                                                  |
| GET    | `/categories/:id`                         | `catalog:read`                                                                  | Consulta una categoría                                                                                                                                                                                                                                                                            |
| POST   | `/categories`                             | `catalog:manage`                                                                | Crea categoría principal o subcategoría; máximo dos niveles                                                                                                                                                                                                                                       |
| PATCH  | `/categories/:id`                         | `catalog:manage`                                                                | Edita nombre, descripción, orden o `isActive` (no se desactiva con subcategorías activas; no hay tercer nivel → 422)                                                                                                                                                                              |
| PUT    | `/categories/:id/attributes`              | `catalog:manage`                                                                | Reemplaza los atributos asignados a la categoría `{ attributes: [{ attributeId, isRequired, isVariantAxisDefault }] }`; la lista de categorías los incluye                                                                                                                                        |
| GET    | `/attributes?includeInactive=`            | `catalog:read`                                                                  | Definiciones y valores; `suggestedUse` (`VARIANT_AXIS`/`DESCRIPTIVE`) e `isSystem`                                                                                                                                                                                                                |
| POST   | `/attributes`                             | `catalog:manage`                                                                | Crea una definición `{ name, dataType, unit?, suggestedUse?, code? }` (el código se deriva del nombre); 409 si ya existe                                                                                                                                                                          |
| PATCH  | `/attributes/:id`                         | `catalog:manage`                                                                | Nombre, unidad, `suggestedUse`, `isActive`; las del sistema no se desactivan y las usadas tampoco (422)                                                                                                                                                                                           |
| POST   | `/attributes/:id/options`                 | `catalog:manage`                                                                | Agrega valor a atributo de tipo lista (código corto opcional)                                                                                                                                                                                                                                     |
| PATCH  | `/attributes/:id/options/:optionId`       | `catalog:manage`                                                                | Edita valor/código/orden o activa/desactiva; renombrar recalcula la etiqueta de las variantes que lo usan                                                                                                                                                                                         |
| GET    | `/products`                               | `catalog:read`                                                                  | Lista y busca por nombre, SKU, código de barras o código del proveedor; filtros `categoryId`, `incomplete` y `withoutPrice` (ignoran inactivos); trae `photos` (solo metadatos)                                                                                                                   |
| GET    | `/products/health`                        | `catalog:read`                                                                  | Contadores para el Inicio, sin costos: `{ activeProducts, incompleteProducts, productsWithoutPrice }`                                                                                                                                                                                             |
| GET    | `/products/:id`                           | `catalog:read`                                                                  | Consulta producto, variantes y `photos`. `isIncomplete` es verdadero si `profileIncomplete` (marca manual) o si no tiene descripción ni características                                                                                                                                           |
| GET    | `/products/lookup?code=`                  | `catalog:read`                                                                  | Devuelve el producto de un SKU, código de barras o código del proveedor                                                                                                                                                                                                                           |
| GET    | `/catalog/variants/lookup?code=`          | `catalog:read`                                                                  | Búsqueda unificada (lector = teclado): devuelve la variante (`matchedBy`: `SKU`/`BARCODE`/`SUPPLIER_CODE`) o 404; 409 si un código de proveedor corresponde a varias piezas                                                                                                                       |
| POST   | `/products`                               | `catalog:manage`                                                                | Crea ficha y variante base con SKU correlativo; admite `attributes` (características), `axes` (ejes con valores de la variante base) y `supplierId`. Responde `meta.warnings` (p. ej. código del proveedor repetido: no se guarda, Q-10). Con `salePrice` exige además `prices:approve`           |
| DELETE | `/products/:id`                           | `catalog:delete` (solo Admin)                                                   | Eliminación física (B11) solo sin movimientos, saldo ≠ 0, ítems de ingresos ni conteos; si no → 422 con el motivo; audita `product.deleted`                                                                                                                                                       |
| PATCH  | `/products/:id`                           | `catalog:manage`                                                                | Edita nombre, modelo, descripción, `attributes` (reemplaza el conjunto), `status` (`ACTIVE`/`INACTIVE`) o `profileIncomplete: false` (marca la ficha como completa); desactivar con stock > 0 → 422 `STOCK_BLOCKS_DEACTIVATION`; rechaza `salePrice` (400)                                        |
| PATCH  | `/products/variants/:id`                  | `catalog:manage`                                                                | `{ minStock }` (B10; 0 = sin alerta); audita antes/después                                                                                                                                                                                                                                        |
| PATCH  | `/products/variants/:id/status`           | `catalog:manage`                                                                | `{ status }`; desactivar una variante con stock > 0 → 422 `STOCK_BLOCKS_DEACTIVATION`                                                                                                                                                                                                             |
| PATCH  | `/products/variants/:id/barcode`          | `catalog:manage`                                                                | Registra el código del proveedor. Repetido: 409 sin `supplierId`; con proveedor se conserva en `supplier_products` y responde `meta.warnings`                                                                                                                                                     |
| POST   | `/products/variants/:id/barcode/generate` | `catalog:manage`                                                                | Genera código propio tras guardar producto activo                                                                                                                                                                                                                                                 |
| POST   | `/products/:id/axes`                      | `catalog:manage`                                                                | Define los ejes y valores de la variante base                                                                                                                                                                                                                                                     |
| POST   | `/products/:id/variants`                  | `catalog:manage`                                                                | Agrega combinación única con SKU correlativo (código repetido → aviso en `meta.warnings`); `salePrice` exige `prices:approve`                                                                                                                                                                     |
| GET    | `/products/:id/photos`                    | `catalog:read`                                                                  | Fotos del producto (solo metadatos: `id`, `url`, medidas, `position`, `isCover`), en orden de galería. **Nunca bytes**                                                                                                                                                                            |
| GET    | `/products/:id/photos/:photoId`           | `catalog:read`                                                                  | Bytes de la imagen (WebP). `ETag`, `304` con `If-None-Match`, `Cache-Control: private, immutable`, `Content-Type` de lista blanca, `nosniff`. El Vendedor puede verla                                                                                                                             |
| POST   | `/products/:id/photos`                    | `catalog:manage`                                                                | Sube **una** foto: `multipart/form-data`, campo `file`, JPG/PNG/WebP validado por contenido (≤ 5 MB → 413; otro formato o archivo dañado → 400; 6.ª foto → 422). Se re-codifica a WebP ≤ 1200 px sin metadatos. La primera foto queda como portada. 201 con la foto. Audita `product.photo_added` |
| PUT    | `/products/:id/photos/order`              | `catalog:manage`                                                                | `{ photoIds }` con exactamente las fotos del producto en el nuevo orden; responde la lista. Audita `product.photos_reordered`                                                                                                                                                                     |
| PUT    | `/products/:id/photos/:photoId/cover`     | `catalog:manage`                                                                | Marca la portada (una sola por producto); responde la lista. Audita `product.photo_cover_changed`                                                                                                                                                                                                 |
| DELETE | `/products/:id/photos/:photoId`           | `catalog:manage`                                                                | Elimina la foto y sus bytes; si era la portada, la primera restante lo pasa a ser; compacta posiciones. Audita `product.photo_removed`                                                                                                                                                            |
| GET    | `/products/variants/:id/cost-history`     | `costs:read`                                                                    | Historial de costos de la variante (compras confirmadas); paginado con `page` y `pageSize`                                                                                                                                                                                                        |
| GET    | `/inventory`                              | `inventory:read`                                                                | Saldos por variante, búsqueda y filtros `level` e `initialOnly`                                                                                                                                                                                                                                   |
| GET    | `/inventory/movements`                    | `inventory:read`                                                                | Historial global paginado con producto, variante y SKU                                                                                                                                                                                                                                            |
| GET    | `/inventory/:variantId/movements`         | `inventory:read`                                                                | Historial paginado de movimientos                                                                                                                                                                                                                                                                 |
| POST   | `/inventory/:variantId/initial`           | `inventory:initial-stock` (Admin, Responsable)                                  | Entrada inicial única; actualiza saldo y audita en transacción. Permiso propio porque cambia el stock **sin aprobación previa**: `inventory:adjust` (solicitar ajustes) ya no la habilita (P-40)                                                                                                  |
| GET    | `/inventory/adjustments`                  | `inventory:adjust`                                                              | Lista paginada; filtros `status`, `variantId`, `from`, `to` (valores con `costs:read`)                                                                                                                                                                                                            |
| GET    | `/inventory/adjustments/reasons`          | `inventory:adjust`                                                              | Catálogo de motivos activos (`requiresNotes` indica si exigen observación)                                                                                                                                                                                                                        |
| GET    | `/inventory/adjustments/pending-count`    | `inventory:adjust-approve`                                                      | `{ data: { count } }` de ajustes pendientes                                                                                                                                                                                                                                                       |
| GET    | `/inventory/adjustments/:id`              | `inventory:adjust`                                                              | Detalle con líneas, saldo actual, cantidad anterior/nueva y `blockers`                                                                                                                                                                                                                            |
| POST   | `/inventory/adjustments`                  | `inventory:adjust`                                                              | Solicita un ajuste (varias líneas con diferencia con signo); NO toca el stock; 201                                                                                                                                                                                                                |
| POST   | `/inventory/adjustments/:id/cancel`       | `inventory:adjust`                                                              | Cancela un pendiente; solo quien lo solicitó                                                                                                                                                                                                                                                      |
| POST   | `/inventory/adjustments/:id/approve`      | `inventory:adjust-approve`                                                      | Aprueba: movimientos `ADJUSTMENT`, saldos y auditoría atómicos                                                                                                                                                                                                                                    |
| POST   | `/inventory/adjustments/:id/reject`       | `inventory:adjust-approve`                                                      | Rechaza con `notes` obligatorias; no toca el stock                                                                                                                                                                                                                                                |
| POST   | `/inventory/exchanges`                    | `inventory:exchange`                                                            | Cambio de pieza: entra la devuelta y sale la entregada, en una transacción; 201                                                                                                                                                                                                                   |
| GET    | `/inventory/exchanges/:referenceId`       | `inventory:read`                                                                | Ambos movimientos y su auditoría (costos solo con `costs:read`)                                                                                                                                                                                                                                   |
| GET    | `/stock-entries`                          | `stock-entries:read`                                                            | Lista paginada; filtros `status`, `supplierId` y `q` (número o documento)                                                                                                                                                                                                                         |
| GET    | `/stock-entries/:id`                      | `stock-entries:read`                                                            | Detalle: ítems, panel de costos, lista de costos adicionales, otros ingresos del mismo comprobante y `blockers`                                                                                                                                                                                   |
| POST   | `/stock-entries`                          | `stock-entries:manage`                                                          | Crea un borrador (proveedor activo, documento, moneda BOB/USD y tipo de cambio; USD exige `costs:read`)                                                                                                                                                                                           |
| PATCH  | `/stock-entries/:id`                      | `stock-entries:manage`                                                          | Edita la cabecera; solo en borrador (cambiar moneda o tipo de cambio recalcula el costo en Bs de los ítems)                                                                                                                                                                                       |
| PUT    | `/stock-entries/:id/items`                | `stock-entries:manage` + `costs:read`                                           | Reemplaza todos los ítems del borrador de forma atómica (precio de compra en la moneda del ingreso)                                                                                                                                                                                               |
| PUT    | `/stock-entries/:id/costs`                | `stock-entries:manage` + `costs:read`                                           | Reemplaza la lista abierta de costos adicionales (tipo + monto en Bs + nota)                                                                                                                                                                                                                      |
| POST   | `/stock-entries/:id/items/quick`          | `stock-entries:manage` + `catalog:manage` + `costs:read`                        | Alta rápida de pieza nueva: producto + variante + ítem, atómico y auditado; el producto nace con `profileIncomplete`                                                                                                                                                                              |
| POST   | `/stock-entries/:id/confirm`              | `stock-entries:confirm` + `costs:read`                                          | Confirmación única: movimientos, saldos, último costo y auditoría atómicos                                                                                                                                                                                                                        |
| POST   | `/stock-entries/:id/cancel`               | `stock-entries:manage`                                                          | Cancela un borrador sin tocar el stock                                                                                                                                                                                                                                                            |
| GET    | `/stock-entry-cost-types`                 | `stock-entries:read`                                                            | Catálogo de tipos de costo adicional (activos e inactivos)                                                                                                                                                                                                                                        |
| POST   | `/stock-entry-cost-types`                 | `settings:manage`                                                               | Agrega un tipo de costo (solo Administrador)                                                                                                                                                                                                                                                      |
| PATCH  | `/stock-entry-cost-types/:id`             | `settings:manage`                                                               | Renombra o (des)activa un tipo agregado; los del sistema no se pueden cambiar                                                                                                                                                                                                                     |
| GET    | `/pricing/variants`                       | `prices:propose` o `prices:approve`                                             | Variantes activas con precio vigente, stock, panel de costos (solo `costs:read`) y solicitud pendiente; filtros `q`, `categoryId`, `noPrice`, `withPending`                                                                                                                                       |
| GET    | `/pricing/changes`                        | `prices:propose` o `prices:approve`                                             | Historial global de cambios de precio; filtros `status`, `q`, `variantId`; paginado                                                                                                                                                                                                               |
| GET    | `/pricing/variants/:id/history`           | `prices:propose` o `prices:approve`                                             | Historial de precios de una variante                                                                                                                                                                                                                                                              |
| GET    | `/pricing/pending-count`                  | `prices:approve`                                                                | `{ count }` de solicitudes pendientes                                                                                                                                                                                                                                                             |
| POST   | `/pricing/requests`                       | `prices:propose`                                                                | Solicita cambios de precio en lote (atómico) → solicitudes `PENDING`; `201`                                                                                                                                                                                                                       |
| POST   | `/pricing/apply`                          | `prices:approve`                                                                | Cambia precios directamente (lote atómico, origen `ADMIN_DIRECT`, etiqueta «Cambio directo (con autorización)»); `201`                                                                                                                                                                            |
| POST   | `/pricing/changes/approve`                | `prices:approve`                                                                | Aprueba solicitudes en masa (atómico; revalida el precio anterior); `meta.batchId`                                                                                                                                                                                                                |
| POST   | `/pricing/changes/reject`                 | `prices:approve`                                                                | Rechaza solicitudes en masa con `comment` obligatorio (atómico)                                                                                                                                                                                                                                   |
| POST   | `/pricing/changes/:id/cancel`             | `prices:propose` (solo el solicitante)                                          | Cancela una solicitud propia mientras esté `PENDING`                                                                                                                                                                                                                                              |

Ejemplos ejecutables: [`requests.http`](../../requests.http) (extensión REST Client).

## Endpoints previstos (pendientes de implementar)

| Módulo                      | Rutas tentativas                                    | Permisos      |
| --------------------------- | --------------------------------------------------- | ------------- |
| Auditoría                   | `/audit-logs` (pantalla solo para el Administrador) | `audit:read`  |
| Reportes y exportaciones    | Por definir según las respuestas G1–G6 del cliente  | Por definir   |
| Carga inicial de datos      | Importador con vista previa (S11, respuestas H1–H3) | Por definir   |
| Salidas por ventas (Fase 2) | Fuera del alcance de la Fase 1                      | `inventory:*` |

### Pendientes de aprobación (Q-14)

`GET /approvals/pending` alimenta la bandeja del Inicio. Solo cuenta: no modifica nada. Cada total se
calcula únicamente si la persona tiene el permiso para resolver ese tipo de pendiente; si no, vale `null`.

```json
{ "data": { "adjustments": 2, "prices": 1, "counts": null, "total": 3 } }
```

| Campo         | Qué cuenta                                  | Permiso que habilita el total |
| ------------- | ------------------------------------------- | ----------------------------- |
| `adjustments` | Ajustes en estado `PENDING`                 | `inventory:adjust-approve`    |
| `prices`      | Cambios de precio en estado `PENDING`       | `prices:approve`              |
| `counts`      | Conteos en estado `IN_REVIEW` (en revisión) | `inventory-counts:approve`    |
| `total`       | Suma de los totales no nulos                | —                             |

| Situación                                                           | Respuesta                                    |
| ------------------------------------------------------------------- | -------------------------------------------- |
| Sin sesión                                                          | `401`                                        |
| Sin ninguno de los tres permisos de aprobación (p. ej. el Vendedor) | `403`                                        |
| Con clave temporal pendiente de cambio                              | `403`                                        |
| Sin pendientes                                                      | `200` con ceros (en los tipos que puede ver) |

Administrador y Responsable de inventario (regla de autorización compartida, 2026-11-05): ven los tres
totales. Un rol que solo tenga alguno de los permisos ve únicamente ese total (los demás vienen `null`).

### Ingresos de mercadería

Un ingreso nace como **borrador** y no cambia el stock. Solo `POST /stock-entries/:id/confirm` lo hace, **una única vez**, en una transacción:

1. Convierte el precio de cada ítem a bolivianos con el tipo de cambio del ingreso (si es USD) y reparte la **lista de costos adicionales** entre los ítems **por valor de compra en Bs** (`cantidad recibida × costo unitario en Bs`); los centavos sobrantes se asignan por **mayor resto** y la suma iguala exactamente el total ([ADR-013](../decisions/ADR-013-costeo-ingresos.md), [ADR-015](../decisions/ADR-015-reparto-centavos-y-valor-cero.md), [ADR-016](../decisions/ADR-016-compras-en-dolares-y-costos-de-importacion.md)).
2. Registra un movimiento `STOCK_ENTRY` por ítem con el costo unitario total, aumenta el saldo y fija ese costo como **último costo** de la variante.
3. **No modifica el precio de venta**: este cambia solo por el módulo de precios ([ADR-018](../decisions/ADR-018-aprobacion-e-historial-de-precios.md)).

| Situación                                                           | Respuesta                                           |
| ------------------------------------------------------------------- | --------------------------------------------------- |
| Confirmar un ingreso ya confirmado o cancelado                      | `422` (`BUSINESS_RULE_VIOLATION`); no duplica stock |
| Costos adicionales con valor de compra cero                         | `422` con `details.blockers`; no se confirma        |
| Cantidad esperada distinta de la recibida sin justificación         | `422` con `details.blockers` (C2)                   |
| Moneda USD sin tipo de cambio, o tipo de cambio ≤ 0 / > 4 decimales | `400`                                               |
| Fecha del documento futura o de más de 30 días atrás                | `400` (zona `America/La_Paz`, C6)                   |
| Precio que convertido a Bs no cabe en la columna                    | `400`                                               |
| Ingreso vacío, sin piezas recibidas o con variantes inactivas       | `422` con `details.blockers`                        |
| Editar o cancelar un ingreso confirmado                             | `422`                                               |
| Dos confirmaciones simultáneas                                      | Una responde `200` y la otra `422`                  |

Confirmar exige `stock-entries:confirm`, separado de `stock-entries:manage` (crear y editar borradores).

**Moneda y tipo de cambio.** `currency` es `BOB` (por defecto) o `USD`; en `USD`, `exchangeRate` (Bs por USD, texto con hasta 4 decimales, > 0) es obligatorio y queda fijo al confirmar. Los precios `unitPrice` de los ítems van en la moneda del ingreso. La API devuelve por ítem el desglose `cost`: `unitPrice` (original), `unitCostBob`, `subtotalOriginal`, `subtotalBob`, `extraAllocated`, `totalCost`, `unitExtraCost` y `unitTotalCost`; y `totals` (`purchaseOriginal`, `purchaseBob`, `extras`, `grand`). Para borradores son una vista previa con el mismo cálculo de la confirmación; para confirmados, lo guardado.

**Visibilidad de costos.** Todo campo de costo (`purchaseTotal`, `extrasTotal`, `exchangeRate`, `costs`, `totals` y `cost` de cada ítem) llega `null` a quien no tiene `costs:read`. Crear con moneda USD, cargar ítems o costos, el alta rápida y confirmar exigen además `costs:read` (`403` sin él). El Vendedor no recibe costos en ninguna respuesta.

**Alta rápida (`POST /stock-entries/:id/items/quick`).** Cuerpo: `categoryId`, `name`, `receivedQty` (≥ 1), `unitPrice` y `supplierCode` opcional. Respuesta `201` con `data` (ingreso actualizado) y `meta` (`variantId`, `warnings`). El producto queda activo, con precio de venta 0 y `profileIncomplete: true`. Si el código del proveedor ya existe como código de barras o SKU de otra pieza, no se guarda como código de barras y se informa en `warnings`; el código solo se guarda en la relación proveedor-pieza si ese proveedor no lo usa ya en otra. La foto se sube después con `POST /products/:id/photos` (ver [Fotos de producto](#fotos-de-producto-s3-adr-020)).

**Entregas parciales.** El `documentNumber` puede repetirse entre ingresos; el detalle incluye `relatedEntries` (mismo proveedor y comprobante).

**Historial de costos.** `GET /products/variants/:id/cost-history` devuelve, de la más reciente a la más antigua, cada compra confirmada: `entryId`, `entryNumber`, `confirmedAt`, `supplierName`, `currency`, `exchangeRate`, `quantity`, `unitPrice`, `unitCostBob`, `unitExtraCost` y `unitTotalCost`.

### Ajustes de inventario

Un ajuste es un **documento** (`AJ-000001`) que quien tiene `inventory:adjust` **solicita** y quien tiene
`inventory:adjust-approve` (Administrador y Responsable de inventario, regla del 2026-11-05) **aprueba o
rechaza**, incluidos los suyos ([ADR-017](../decisions/ADR-017-ajustes-solicitud-aprobacion.md)). El stock cambia
**únicamente** en `POST /inventory/adjustments/:id/approve`, que en una sola transacción bloquea el
documento, **revalida cada línea con el saldo vigente**, registra un movimiento `ADJUSTMENT` por línea
(`referenceType = INVENTORY_ADJUSTMENT`, `referenceId` = id del documento), guarda cantidad anterior y
nueva, cierra el documento y audita.

Cuerpo de `POST /inventory/adjustments`:

```json
{
  "reasonId": "<uuid del motivo>",
  "notes": "texto libre (obligatorio si el motivo es «Otro»)",
  "items": [{ "variantId": "<uuid>", "quantityDelta": -2 }]
}
```

`quantityDelta` es entero con signo y distinto de cero (negativo = salida). No se repite una variante.

| Situación                                                                | Respuesta                                                      |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Sin sesión / sin permiso (el Vendedor no tiene ninguno)                  | `401` / `403`                                                  |
| Quien solo solicita intenta aprobar, rechazar o ver el contador          | `403`                                                          |
| `quantityDelta` 0 o no entero, líneas vacías o repetidas, sin motivo     | `400`                                                          |
| Motivo «Otro» sin observación, variante inactiva, saldo que quedaría < 0 | `422` (al solicitar **y** al aprobar con el saldo vigente)     |
| Motivo o variante inexistente                                            | `404`                                                          |
| Aprobar/rechazar/cancelar un ajuste ya resuelto                          | `422`; no duplica movimientos                                  |
| Cancelar un ajuste ajeno                                                 | `403`                                                          |
| Dos aprobaciones simultáneas contra el mismo saldo                       | Una responde `200` y la otra `422`; nunca queda stock negativo |

Si una línea falla al aprobar, **no se aplica ninguna** y el ajuste sigue pendiente. Los campos
`unitCost` y `valueImpact` (costo y valor en Bs, con signo) solo se envían con `costs:read`; para el resto
son `null`. `meta` y los filtros siguen la convención de paginación (`page`, `pageSize` ≤ 100).

### Precios de venta (`/pricing`, ADR-018)

El precio lo fija el cliente a mano; no hay fórmula, redondeo ni sugerencia. Todos los endpoints exigen `prices:propose` o `prices:approve` (el **Vendedor recibe `403`** en todos). `sale_price` solo cambia aquí: `PATCH /products/:id` rechaza `salePrice` (`400`), y el precio **inicial** al crear una pieza o variante (`salePrice` en `POST /products` y `POST /products/:id/variants`) exige `prices:approve` (`403` sin él) y queda en el historial con origen `INITIAL`.

| Operación                          | Cuerpo                                                                                                                                      | Resultado                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `POST /pricing/requests`           | `{ items: [{ variantId, newPrice }], reason? }` (1 a 200, sin repetir variante; `newPrice` texto con hasta 2 decimales, `"0"` = sin precio) | `PENDING`, origen `REQUEST`; el precio vigente no cambia                                          |
| `POST /pricing/apply`              | igual                                                                                                                                       | `APPROVED`, origen `ADMIN_DIRECT`, rige de inmediato                                              |
| `POST /pricing/changes/approve`    | `{ ids }`                                                                                                                                   | `APPROVED` por quien lo aprueba; actualiza `sale_price`, historial y auditoría en una transacción |
| `POST /pricing/changes/reject`     | `{ ids, comment }` (comentario de 3 a 500 caracteres)                                                                                       | `REJECTED`; el precio no cambia                                                                   |
| `POST /pricing/changes/:id/cancel` | —                                                                                                                                           | `CANCELLED`; solo el solicitante, solo si sigue `PENDING`                                         |

| Situación                                                                                          | Respuesta                                         |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Lote con un elemento inválido (precio igual al vigente, variante inactiva, solicitud ya resuelta…) | La operación completa falla; no se aplica ninguno |
| Variante inexistente / solicitud inexistente                                                       | `404`                                             |
| Precio nuevo igual al vigente, variante inactiva, solicitud ya resuelta                            | `422` con `details`                               |
| Variante con solicitud pendiente (al solicitar o aplicar)                                          | `409` con `details.variantIds`                    |
| Aprobar cuando el precio vigente ya no es el «anterior» de la solicitud                            | `409` con `details.ids` (solicitudes obsoletas)   |
| Cancelar una solicitud ajena                                                                       | `403`                                             |

`GET /pricing/variants` devuelve por variante `salePrice` (2 decimales), `stockQuantity` (solo con `inventory:read`), `pending` y `costs` (solo con `costs:read`, si no `null`): `purchaseUnitCost` y `purchaseQty`/`purchaseSubtotal` del último ingreso confirmado, `extraUnitCost`, `totalUnitCost` (= `cost_price`) y el ingreso de origen. Los cambios (`/pricing/changes`, `/pricing/variants/:id/history`) incluyen estado, origen, solicitante, decisor, fechas, `reason`, `decisionComment`, `batchId` y `costSnapshot` (costo total del momento; `null` sin `costs:read`). Auditoría: `price.requested`, `price.approved`, `price.rejected`, `price.cancelled` y `variant.price_changed` (precio anterior y nuevo).

### Cambios de pieza

Un cambio ([ADR-019](../decisions/ADR-019-cambios-de-pieza.md), C9/Q-12) registra **dos movimientos en una sola
transacción**: `EXCHANGE_IN` (entra la pieza devuelta, cantidad positiva) y `EXCHANGE_OUT` (sale la
entregada, cantidad negativa), ambos con `referenceType = EXCHANGE` y el mismo `referenceId`. No existen
devoluciones. No hay pantalla de registro en la Fase 1.

Cuerpo de `POST /inventory/exchanges`:

```json
{
  "returned": { "variantId": "<uuid>", "quantity": 1 },
  "delivered": { "variantId": "<uuid>", "quantity": 1 },
  "reason": "Talla equivocada",
  "notes": "texto libre opcional"
}
```

La respuesta (`{ data }`) trae `referenceId`, `reason`, `notes`, `userId`, `createdAt` y, por cada lado
(`returned`, `delivered`), `movementId`, `movementType`, variante, SKU, `quantity` con signo,
`balanceBefore`, `balanceAfter` y `unitCost` (costo vigente de la variante; solo con `costs:read`, si no
`null`), más `audit` (`inventory.exchange`; `null` sin `inventory:exchange` ni `audit:read`).

| Situación                                                           | Respuesta                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| Sin sesión / sin `inventory:exchange` (el Vendedor no lo tiene)     | `401` / `403`                                                  |
| Motivo vacío, cantidad 0, negativa o no entera, `variantId` no UUID | `400`                                                          |
| Misma variante en ambos lados, variante inactiva                    | `422`                                                          |
| Salida que dejaría el saldo negativo                                | `422`; **tampoco** se aplica la entrada                        |
| Variante inexistente / cambio inexistente en el GET                 | `404`                                                          |
| Dos cambios simultáneos sobre la última unidad                      | Uno responde `201` y el otro `422`; nunca queda saldo negativo |

Los movimientos se ven en `GET /inventory/:variantId/movements` y `GET /inventory/movements` con
`type` `EXCHANGE_IN` / `EXCHANGE_OUT`. Auditoría: `inventory.exchange`.

### Conteo físico a ciegas

Conteo por categoría con lector de códigos y segundo recuento obligatorio si hay diferencias
([ADR-021](../decisions/ADR-021-conteo-a-ciegas-segundo-recuento.md)). Todo cuelga de `/inventory/counts`.

| Método | Ruta                                  | Permiso                    | Descripción                                                                                           |
| ------ | ------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/`                                   | `inventory-counts:read`    | Lista paginada (`status`: `all`, `open` o un estado); progreso, sin stock del sistema                 |
| POST   | `/`                                   | `inventory-counts:manage`  | Crea un borrador `{ categoryId, notes? }` (CNT-000001); 409 si comparte variantes con otro conteo     |
| GET    | `/:id`                                | `inventory-counts:read`    | Detalle: `view: "BLIND"` (captura/recuento) o `view: "REVIEW"` (revisión/aprobado)                    |
| GET    | `/:id/scans`                          | `inventory-counts:read`    | Historial de lecturas (variante/hallazgo, delta, usuario, hora, si se deshizo)                        |
| POST   | `/:id/start`                          | `inventory-counts:manage`  | Toma la foto del sistema y el cursor de movimientos; quien inicia queda como operador                 |
| POST   | `/:id/take`                           | `inventory-counts:manage`  | Pasa a ser el operador (queda auditado)                                                               |
| POST   | `/:id/scan`                           | `inventory-counts:manage`  | `{ code }` por SKU, código de barras o de proveedor: suma 1 pieza o registra un hallazgo              |
| PUT    | `/:id/items/:variantId`               | `inventory-counts:manage`  | `{ quantity }` fija la cantidad contada de la ronda en curso                                          |
| POST   | `/:id/undo`                           | `inventory-counts:manage`  | Deshace la última lectura vigente de la ronda                                                         |
| PATCH  | `/:id/findings/:findingId`            | `inventory-counts:manage`  | `{ note }` nota del operador sobre un hallazgo                                                        |
| POST   | `/:id/close`                          | `inventory-counts:manage`  | Cierra la ronda: primer conteo → `RECOUNT` (si hay diferencias) o `IN_REVIEW`; recuento → `IN_REVIEW` |
| POST   | `/:id/approve`                        | `inventory-counts:approve` | Aprueba: concilia y genera los `COUNT_ADJUSTMENT`, saldos y auditoría atómicos                        |
| POST   | `/:id/cancel`                         | `inventory-counts:manage`  | `{ reason? }` cancela un conteo no terminado; no mueve stock                                          |
| POST   | `/:id/findings/:findingId/regularize` | `inventory-counts:approve` | `{ note }` marca un hallazgo como regularizado (en revisión o ya aprobado)                            |

**A ciegas.** En `DRAFT`, `IN_PROGRESS`, `RECOUNT` y `CANCELLED` el detalle es `view: "BLIND"`: cada
pieza trae solo identificación (`sku`, `barcode`, `productName`, `variantLabel`) y `quantity` (lo contado
en la ronda); **no existen** campos de stock del sistema, esperado ni diferencias, para ningún rol. Solo
`IN_REVIEW` y `APPROVED` devuelven `view: "REVIEW"` con `systemQty` (foto), `expectedQty` (lo que había al
contar), `countedQty`, `recountQty`, `finalQty`, `reconciledMovements`, `difference`, `currentQty`,
`resultingQty` y los hallazgos; `unitCost`/`valueImpact` solo con `costs:read`.

| Situación                                                                      | Respuesta                                                       |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Sin sesión / sin permiso (el Vendedor no tiene ninguno)                        | `401` / `403`                                                   |
| Quien solo captura intenta aprobar o regularizar                               | `403`                                                           |
| Capturar, deshacer o cerrar sin ser el operador                                | `403` (indica quién captura); `POST /:id/take` lo toma          |
| Código vacío, cantidad negativa o ids inválidos                                | `400`                                                           |
| Categoría o conteo inexistente                                                 | `404`                                                           |
| Variantes ya incluidas en otro conteo no terminado                             | `409` (nombra el conteo en conflicto)                           |
| Categoría sin variantes; estado que no admite la acción; aprobar sin recuento  | `422`                                                           |
| Pieza fuera de la lista de recuento; código de proveedor que identifica varias | `422`                                                           |
| Doble aprobación / dos aprobaciones simultáneas                                | Una responde `200` y la otra `422`; no duplica movimientos      |
| Saldo que quedaría negativo al conciliar                                       | `422`; no se aplica ninguna línea y el conteo sigue en revisión |

El escaneo `POST /:id/scan` responde `{ scan, item, finding, piecesCounted, scannedVariants }`:
`item` es la pieza contada (o `null` si fue un hallazgo) y `finding` el hallazgo (o `null`).

### Fotos de producto (S3, ADR-020)

Las fotos pertenecen al **producto** (no a la variante): hasta 5, una de ellas portada. Los bytes se guardan
en PostgreSQL detrás de la interfaz `PhotoStorage` y se piden aparte, por `url`; los listados nunca los traen.

Subida con `curl` (la sesión viaja en la cookie):

```bash
curl -X POST -b cookies.txt -F "file=@anillo.jpg;type=image/jpeg" \
  http://localhost:3000/api/v1/products/<productId>/photos
```

**Alta rápida de una pieza dentro de un ingreso (Q-09 9.1).** El producto debe existir antes de adjuntar la
foto: `POST /products` devuelve el `id` y con él se llama a `POST /products/:id/photos` (el producto nuevo no
tiene fotos, así que la primera queda como portada). En la web, el componente
`apps/web/src/features/catalog/photos/photo-uploader.tsx` (`<PhotoUploader productId productName photoCount onUploaded />`)
o el hook `useUploadProductPhoto()` hacen exactamente esto y son independientes de la ficha del producto.
**Pendiente:** conectar `PhotoUploader` al alta rápida de la pantalla de ingresos.

Errores: `400 VALIDATION_ERROR` (no es JPG/PNG/WebP real, archivo dañado, falta el campo `file`, orden inválido),
`413 PAYLOAD_TOO_LARGE`, `422 BUSINESS_RULE_VIOLATION` (ya tiene 5 fotos), `404`, `403`, `401`.

## Cómo agregar un endpoint

Ver la skill `.claude/skills/api-development/SKILL.md`. Resumen:

```ts
app.post(
  '/',
  {
    preHandler: app.requirePermission(PERMISSIONS.SUPPLIERS_MANAGE),
    schema: { body: createSupplierSchema, response: { 201: z.object({ data: supplierSchema }) } },
  },
  async (request, reply) => {
    const supplier = await service.create(request.body, request); // service escribe auditoría
    return reply.status(201).send({ data: supplier });
  },
);
```
