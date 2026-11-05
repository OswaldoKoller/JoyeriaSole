# API REST

Base: `/api/v1` · JSON · Autenticación por cookie de sesión (httpOnly, SameSite=Strict).

## Convenciones

- Recursos en plural y kebab-case: `/stock-entries`, `/inventory-counts`.
- `GET` lista/detalle · `POST` crear · `PATCH` modificar parcialmente · acciones de estado como
  sub-recurso: `POST /stock-entries/:id/confirm`, `POST /inventory-counts/:id/approve`.
- **Sin `DELETE` para entidades con historial**: se desactivan (`PATCH { isActive: false }`).
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
| 429  | `RATE_LIMITED`              | Demasiadas solicitudes                                                                                          |
| 500  | `INTERNAL_ERROR`            | Error técnico. Nunca incluye detalles internos; ver logs con el `requestId`                                     |

## Endpoints implementados

| Método | Ruta                                      | Auth                            | Descripción                                                                                                                       |
| ------ | ----------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                                 | —                               | Estado del servicio y de la BD (`200` ok / `503` degradado)                                                                       |
| POST   | `/auth/login`                             | —                               | `{ email, password }` → `200 { data: { mustChangePassword } }` + cookie (sesión fija de 8 h). Límite: 10 intentos / 15 min por IP |
| POST   | `/auth/change-password`                   | sesión                          | Valida contraseña actual; revoca todas las sesiones y exige nuevo login                                                           |
| POST   | `/auth/logout`                            | sesión                          | Revoca la sesión → `204`                                                                                                          |
| GET    | `/auth/me`                                | sesión                          | Usuario actual con roles, permisos y `mustChangePassword`                                                                         |
| GET    | `/suppliers`                              | `suppliers:read`                | Lista paginada; filtros por texto, estado y página                                                                                |
| GET    | `/suppliers/:id`                          | `suppliers:read`                | Detalle de un proveedor; 404 si no existe                                                                                         |
| POST   | `/suppliers`                              | `suppliers:manage`              | Crea un proveedor y registra auditoría; 201                                                                                       |
| PATCH  | `/suppliers/:id`                          | `suppliers:manage`              | Edita campos o `isActive`; auditoría con antes/después                                                                            |
| GET    | `/users`                                  | `users:read`                    | Lista paginada; filtros por nombre/correo y estado                                                                                |
| GET    | `/users/:id`                              | `users:read`                    | Consulta usuario y roles; no expone contraseña ni sesiones                                                                        |
| POST   | `/users`                                  | `users:manage` + `roles:manage` | Crea usuario con roles y contraseña inicial; audita sin exponer hash                                                              |
| GET    | `/users/roles`                            | `users:read` + `roles:manage`   | Roles disponibles para asignación múltiple                                                                                        |
| PATCH  | `/users/:id`                              | `users:manage`                  | Edita nombre/estado; revoca sesiones al desactivar; audita el cambio                                                              |
| PUT    | `/users/:id/roles`                        | `users:manage` + `roles:manage` | Reemplaza la asignación de roles; protege al último administrador                                                                 |
| POST   | `/users/:id/reset-password`               | `users:manage`                  | `{ temporaryPassword }` (≥ 10): marca cambio obligatorio, revoca sesiones, audita sin la clave; no sobre uno mismo                |
| GET    | `/categories`                             | `catalog:read`                  | Lista categorías y subcategorías                                                                                                  |
| GET    | `/categories/:id`                         | `catalog:read`                  | Consulta una categoría                                                                                                            |
| POST   | `/categories`                             | `catalog:manage`                | Crea categoría principal o subcategoría; máximo dos niveles                                                                       |
| PATCH  | `/categories/:id`                         | `catalog:manage`                | Edita nombre, descripción u orden                                                                                                 |
| GET    | `/attributes`                             | `catalog:read`                  | Consulta definiciones y valores de atributos                                                                                      |
| POST   | `/attributes/:id/options`                 | `catalog:manage`                | Agrega valor a atributo de tipo lista                                                                                             |
| GET    | `/products`                               | `catalog:read`                  | Lista y busca por nombre, SKU o código de barras                                                                                  |
| GET    | `/products/:id`                           | `catalog:read`                  | Consulta producto y variantes                                                                                                     |
| GET    | `/products/lookup?code=`                  | `catalog:read`                  | Busca exactamente un SKU o código de barras                                                                                       |
| POST   | `/products`                               | `catalog:manage`                | Crea ficha y variante base con SKU correlativo                                                                                    |
| PATCH  | `/products/:id`                           | `catalog:manage`                | Edita nombre, modelo, descripción o `status` (`ACTIVE`/`INACTIVE`); desactivar con stock > 0 → 422 `STOCK_BLOCKS_DEACTIVATION`    |
| PATCH  | `/products/variants/:id/status`           | `catalog:manage`                | `{ status }`; desactivar una variante con stock > 0 → 422 `STOCK_BLOCKS_DEACTIVATION`                                             |
| PATCH  | `/products/variants/:id/barcode`          | `catalog:manage`                | Registra código recibido del proveedor si no existe otro                                                                          |
| POST   | `/products/variants/:id/barcode/generate` | `catalog:manage`                | Genera código propio tras guardar producto activo                                                                                 |
| POST   | `/products/:id/axes`                      | `catalog:manage`                | Define los ejes y valores de la variante base                                                                                     |
| POST   | `/products/:id/variants`                  | `catalog:manage`                | Agrega combinación única con SKU correlativo                                                                                      |
| GET    | `/inventory`                              | `inventory:read`                | Saldos por variante, búsqueda y filtros `level` e `initialOnly`                                                                   |
| GET    | `/inventory/movements`                    | `inventory:read`                | Historial global paginado con producto, variante y SKU                                                                            |
| GET    | `/inventory/:variantId/movements`         | `inventory:read`                | Historial paginado de movimientos                                                                                                 |
| POST   | `/inventory/:variantId/initial`           | `inventory:adjust`              | Entrada inicial única; actualiza saldo y audita en transacción                                                                    |
| GET    | `/stock-entries`                          | `stock-entries:read`            | Lista paginada; filtros `status`, `supplierId` y `q` (número o documento)                                                         |
| GET    | `/stock-entries/:id`                      | `stock-entries:read`            | Detalle con ítems, costos por pieza y `blockers` (motivos que impiden confirmar)                                                  |
| POST   | `/stock-entries`                          | `stock-entries:manage`          | Crea un borrador (proveedor activo, documento y costos adicionales)                                                               |
| PATCH  | `/stock-entries/:id`                      | `stock-entries:manage`          | Edita la cabecera; solo en borrador                                                                                               |
| PUT    | `/stock-entries/:id/items`                | `stock-entries:manage`          | Reemplaza todos los ítems del borrador de forma atómica                                                                           |
| POST   | `/stock-entries/:id/confirm`              | `stock-entries:confirm`         | Confirmación única: movimientos, saldos, último costo y auditoría atómicos                                                        |
| POST   | `/stock-entries/:id/cancel`               | `stock-entries:manage`          | Cancela un borrador sin tocar el stock                                                                                            |
| Método | Ruta                                      | Auth                            | Descripción                                                                            |
| ------ | ----------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| GET    | `/health`                                 | —                               | Estado del servicio y de la BD (`200` ok / `503` degradado)                            |
| POST   | `/auth/login`                             | —                               | `{ email, password }` → `204` + cookie. Límite: 10 intentos / 15 min por IP            |
| POST   | `/auth/change-password`                   | sesión                          | Valida contraseña actual; revoca todas las sesiones y exige nuevo login                |
| POST   | `/auth/logout`                            | sesión                          | Revoca la sesión → `204`                                                               |
| GET    | `/auth/me`                                | sesión                          | Usuario actual con roles y permisos                                                    |
| GET    | `/suppliers`                              | `suppliers:read`                | Lista paginada; filtros por texto, estado y página                                     |
| GET    | `/suppliers/:id`                          | `suppliers:read`                | Detalle de un proveedor; 404 si no existe                                              |
| POST   | `/suppliers`                              | `suppliers:manage`              | Crea un proveedor y registra auditoría; 201                                            |
| PATCH  | `/suppliers/:id`                          | `suppliers:manage`              | Edita campos o `isActive`; auditoría con antes/después                                 |
| GET    | `/users`                                  | `users:read`                    | Lista paginada; filtros por nombre/correo y estado                                     |
| GET    | `/users/:id`                              | `users:read`                    | Consulta usuario y roles; no expone contraseña ni sesiones                             |
| POST   | `/users`                                  | `users:manage` + `roles:manage` | Crea usuario con roles y contraseña inicial; audita sin exponer hash                   |
| GET    | `/users/roles`                            | `users:read` + `roles:manage`   | Roles disponibles para asignación múltiple                                             |
| PATCH  | `/users/:id`                              | `users:manage`                  | Edita nombre/estado; revoca sesiones al desactivar; audita el cambio                   |
| PUT    | `/users/:id/roles`                        | `users:manage` + `roles:manage` | Reemplaza la asignación de roles; protege al último administrador                      |
| GET    | `/categories`                             | `catalog:read`                  | Lista categorías y subcategorías                                                       |
| GET    | `/categories/:id`                         | `catalog:read`                  | Consulta una categoría                                                                 |
| POST   | `/categories`                             | `catalog:manage`                | Crea categoría principal o subcategoría; máximo dos niveles                            |
| PATCH  | `/categories/:id`                         | `catalog:manage`                | Edita nombre, descripción u orden                                                      |
| GET    | `/attributes`                             | `catalog:read`                  | Consulta definiciones y valores de atributos                                           |
| POST   | `/attributes/:id/options`                 | `catalog:manage`                | Agrega valor a atributo de tipo lista                                                  |
| GET    | `/products`                               | `catalog:read`                  | Lista y busca por nombre, SKU o código de barras                                       |
| GET    | `/products/:id`                           | `catalog:read`                  | Consulta producto y variantes                                                          |
| GET    | `/products/lookup?code=`                  | `catalog:read`                  | Busca exactamente un SKU o código de barras                                            |
| POST   | `/products`                               | `catalog:manage`                | Crea ficha y variante base con SKU correlativo                                         |
| PATCH  | `/products/:id`                           | `catalog:manage`                | Edita nombre, modelo o descripción                                                     |
| PATCH  | `/products/variants/:id/barcode`          | `catalog:manage`                | Registra código recibido del proveedor si no existe otro                               |
| POST   | `/products/variants/:id/barcode/generate` | `catalog:manage`                | Genera código propio tras guardar producto activo                                      |
| POST   | `/products/:id/axes`                      | `catalog:manage`                | Define los ejes y valores de la variante base                                          |
| POST   | `/products/:id/variants`                  | `catalog:manage`                | Agrega combinación única con SKU correlativo                                           |
| GET    | `/inventory`                              | `inventory:read`                | Saldos por variante, búsqueda y filtros `level` e `initialOnly`                        |
| GET    | `/inventory/movements`                    | `inventory:read`                | Historial global paginado con producto, variante y SKU                                 |
| GET    | `/inventory/:variantId/movements`         | `inventory:read`                | Historial paginado de movimientos                                                      |
| POST   | `/inventory/:variantId/initial`           | `inventory:adjust`              | Entrada inicial única; actualiza saldo y audita en transacción                         |
| GET    | `/inventory/adjustments`                  | `inventory:adjust`              | Lista paginada; filtros `status`, `variantId`, `from`, `to` (valores con `costs:read`) |
| GET    | `/inventory/adjustments/reasons`          | `inventory:adjust`              | Catálogo de motivos activos (`requiresNotes` indica si exigen observación)             |
| GET    | `/inventory/adjustments/pending-count`    | `inventory:adjust-approve`      | `{ data: { count } }` de ajustes pendientes (bandeja del Administrador)                |
| GET    | `/inventory/adjustments/:id`              | `inventory:adjust`              | Detalle con líneas, saldo actual, cantidad anterior/nueva y `blockers`                 |
| POST   | `/inventory/adjustments`                  | `inventory:adjust`              | Solicita un ajuste (varias líneas con diferencia con signo); NO toca el stock; 201     |
| POST   | `/inventory/adjustments/:id/cancel`       | `inventory:adjust`              | Cancela un pendiente; solo quien lo solicitó                                           |
| POST   | `/inventory/adjustments/:id/approve`      | `inventory:adjust-approve`      | Aprueba: movimientos `ADJUSTMENT`, saldos y auditoría atómicos                         |
| POST   | `/inventory/adjustments/:id/reject`       | `inventory:adjust-approve`      | Rechaza con `notes` obligatorias; no toca el stock                                     |
| GET    | `/stock-entries`                          | `stock-entries:read`            | Lista paginada; filtros `status`, `supplierId` y `q` (número o documento)              |
| GET    | `/stock-entries/:id`                      | `stock-entries:read`            | Detalle con ítems, costos por pieza y `blockers` (motivos que impiden confirmar)       |
| POST   | `/stock-entries`                          | `stock-entries:manage`          | Crea un borrador (proveedor activo, documento y costos adicionales)                    |
| PATCH  | `/stock-entries/:id`                      | `stock-entries:manage`          | Edita la cabecera; solo en borrador                                                    |
| PUT    | `/stock-entries/:id/items`                | `stock-entries:manage`          | Reemplaza todos los ítems del borrador de forma atómica                                |
| POST   | `/stock-entries/:id/confirm`              | `stock-entries:confirm`         | Confirmación única: movimientos, saldos, último costo y auditoría atómicos             |
| POST   | `/stock-entries/:id/cancel`               | `stock-entries:manage`          | Cancela un borrador sin tocar el stock                                                 |

Ejemplos ejecutables: [`requests.http`](../../requests.http) (extensión REST Client).

## Endpoints previstos para la Fase 1 (pendientes de implementar)

| Módulo            | Rutas tentativas                                                               | Permisos                                   |
| ----------------- | ------------------------------------------------------------------------------ | ------------------------------------------ |
| Catálogo          | Atributos descriptivos por producto; edición de precios según P-25             | `catalog:*`, `prices:manage`, `costs:read` |
| Inventario        | Salidas por ventas y cambios (Fase 2); los ajustes ya están implementados      | `inventory:*`                              |
| Inventario físico | `/inventory-counts`, `/:id/start`, `/:id/items`, `/:id/review`, `/:id/approve` | `inventory-counts:*`                       |
| Auditoría         | `/audit-logs`                                                                  | `audit:read`                               |

### Ingresos de mercadería

Un ingreso nace como **borrador** y no cambia el stock. Solo `POST /stock-entries/:id/confirm` lo hace, **una única vez**, en una transacción:

1. Reparte transporte + embolsado + extras entre los ítems **por valor de compra** (`cantidad recibida × costo unitario`); los centavos sobrantes se asignan por **mayor resto** y la suma iguala exactamente el total ([ADR-013](../decisions/ADR-013-costeo-ingresos.md), [ADR-015](../decisions/ADR-015-reparto-centavos-y-valor-cero.md)).
2. Registra un movimiento `STOCK_ENTRY` por ítem con el costo unitario total, aumenta el saldo y fija ese costo como **último costo** de la variante.
3. **No modifica el precio de venta** (P-25 pendiente).

| Situación                                                     | Respuesta                                           |
| ------------------------------------------------------------- | --------------------------------------------------- |
| Confirmar un ingreso ya confirmado o cancelado                | `422` (`BUSINESS_RULE_VIOLATION`); no duplica stock |
| Costos adicionales con valor de compra cero                   | `422` con `details.blockers`; no se confirma        |
| Ingreso vacío, sin piezas recibidas o con variantes inactivas | `422` con `details.blockers`                        |
| Editar o cancelar un ingreso confirmado                       | `422`                                               |
| Dos confirmaciones simultáneas                                | Una responde `200` y la otra `422`                  |

Confirmar exige `stock-entries:confirm`, separado de `stock-entries:manage` (crear y editar borradores).

### Ajustes de inventario

Un ajuste es un **documento** (`AJ-000001`) que el Responsable **solicita** y el Administrador
**aprueba o rechaza** ([ADR-017](../decisions/ADR-017-ajustes-solicitud-aprobacion.md)). El stock cambia
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
