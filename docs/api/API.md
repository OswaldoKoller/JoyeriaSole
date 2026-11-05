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

| HTTP | `code`                    | Cuándo                                                                      |
| ---- | ------------------------- | --------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`        | Datos de entrada inválidos (Zod) o JSON mal formado                         |
| 401  | `UNAUTHENTICATED`         | Sin sesión, sesión expirada/revocada, credenciales inválidas                |
| 403  | `FORBIDDEN`               | Sesión válida sin el permiso requerido; origen no permitido                 |
| 404  | `NOT_FOUND`               | Recurso o ruta inexistente                                                  |
| 409  | `CONFLICT`                | Duplicado (SKU, código de barras, NIT...)                                   |
| 422  | `BUSINESS_RULE_VIOLATION` | Regla de negocio (p. ej. confirmar un ingreso ya confirmado)                |
| 429  | `RATE_LIMITED`            | Demasiadas solicitudes                                                      |
| 500  | `INTERNAL_ERROR`          | Error técnico. Nunca incluye detalles internos; ver logs con el `requestId` |

## Endpoints implementados

| Método | Ruta                                      | Auth                                                     | Descripción                                                                                                      |
| ------ | ----------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                                 | —                                                        | Estado del servicio y de la BD (`200` ok / `503` degradado)                                                      |
| POST   | `/auth/login`                             | —                                                        | `{ email, password }` → `204` + cookie. Límite: 10 intentos / 15 min por IP                                      |
| POST   | `/auth/change-password`                   | sesión                                                   | Valida contraseña actual; revoca todas las sesiones y exige nuevo login                                          |
| POST   | `/auth/logout`                            | sesión                                                   | Revoca la sesión → `204`                                                                                         |
| GET    | `/auth/me`                                | sesión                                                   | Usuario actual con roles y permisos                                                                              |
| GET    | `/suppliers`                              | `suppliers:read`                                         | Lista paginada; filtros `q` (nombre, NIT, país o contacto), `status`, `type` y página                            |
| GET    | `/suppliers/:id`                          | `suppliers:read`                                         | Detalle de un proveedor; 404 si no existe                                                                        |
| POST   | `/suppliers`                              | `suppliers:manage`                                       | Crea un proveedor (solo `name` obligatorio; `type`=NATIONAL y `defaultCurrency`=BOB por defecto); auditoría; 201 |
| PATCH  | `/suppliers/:id`                          | `suppliers:manage`                                       | Edita campos o `isActive`; auditoría con antes/después                                                           |
| GET    | `/users`                                  | `users:read`                                             | Lista paginada; filtros por nombre/correo y estado                                                               |
| GET    | `/users/:id`                              | `users:read`                                             | Consulta usuario y roles; no expone contraseña ni sesiones                                                       |
| POST   | `/users`                                  | `users:manage` + `roles:manage`                          | Crea usuario con roles y contraseña inicial; audita sin exponer hash                                             |
| GET    | `/users/roles`                            | `users:read` + `roles:manage`                            | Roles disponibles para asignación múltiple                                                                       |
| PATCH  | `/users/:id`                              | `users:manage`                                           | Edita nombre/estado; revoca sesiones al desactivar; audita el cambio                                             |
| PUT    | `/users/:id/roles`                        | `users:manage` + `roles:manage`                          | Reemplaza la asignación de roles; protege al último administrador                                                |
| GET    | `/categories`                             | `catalog:read`                                           | Lista categorías y subcategorías                                                                                 |
| GET    | `/categories/:id`                         | `catalog:read`                                           | Consulta una categoría                                                                                           |
| POST   | `/categories`                             | `catalog:manage`                                         | Crea categoría principal o subcategoría; máximo dos niveles                                                      |
| PATCH  | `/categories/:id`                         | `catalog:manage`                                         | Edita nombre, descripción u orden                                                                                |
| GET    | `/attributes`                             | `catalog:read`                                           | Consulta definiciones y valores de atributos                                                                     |
| POST   | `/attributes/:id/options`                 | `catalog:manage`                                         | Agrega valor a atributo de tipo lista                                                                            |
| GET    | `/products`                               | `catalog:read`                                           | Lista y busca por nombre, SKU o código de barras                                                                 |
| GET    | `/products/:id`                           | `catalog:read`                                           | Consulta producto y variantes                                                                                    |
| GET    | `/products/lookup?code=`                  | `catalog:read`                                           | Busca exactamente un SKU o código de barras                                                                      |
| POST   | `/products`                               | `catalog:manage`                                         | Crea ficha y variante base con SKU correlativo                                                                   |
| PATCH  | `/products/:id`                           | `catalog:manage`                                         | Edita nombre, modelo o descripción; `profileIncomplete: false` marca la ficha como completa                      |
| PATCH  | `/products/variants/:id/barcode`          | `catalog:manage`                                         | Registra código recibido del proveedor si no existe otro                                                         |
| POST   | `/products/variants/:id/barcode/generate` | `catalog:manage`                                         | Genera código propio tras guardar producto activo                                                                |
| POST   | `/products/:id/axes`                      | `catalog:manage`                                         | Define los ejes y valores de la variante base                                                                    |
| POST   | `/products/:id/variants`                  | `catalog:manage`                                         | Agrega combinación única con SKU correlativo                                                                     |
| GET    | `/inventory`                              | `inventory:read`                                         | Saldos por variante, búsqueda y filtros `level` e `initialOnly`                                                  |
| GET    | `/inventory/movements`                    | `inventory:read`                                         | Historial global paginado con producto, variante y SKU                                                           |
| GET    | `/inventory/:variantId/movements`         | `inventory:read`                                         | Historial paginado de movimientos                                                                                |
| POST   | `/inventory/:variantId/initial`           | `inventory:adjust`                                       | Entrada inicial única; actualiza saldo y audita en transacción                                                   |
| GET    | `/stock-entries`                          | `stock-entries:read`                                     | Lista paginada; filtros `status`, `supplierId` y `q` (número o documento)                                        |
| GET    | `/stock-entries/:id`                      | `stock-entries:read`                                     | Detalle: ítems, panel de costos, lista de costos adicionales, otros ingresos del mismo comprobante y `blockers`  |
| POST   | `/stock-entries`                          | `stock-entries:manage`                                   | Crea un borrador (proveedor activo, documento, moneda BOB/USD y tipo de cambio; USD exige `costs:read`)          |
| PATCH  | `/stock-entries/:id`                      | `stock-entries:manage`                                   | Edita la cabecera; solo en borrador (cambiar moneda o tipo de cambio recalcula el costo en Bs de los ítems)      |
| PUT    | `/stock-entries/:id/items`                | `stock-entries:manage` + `costs:read`                    | Reemplaza todos los ítems del borrador de forma atómica (precio de compra en la moneda del ingreso)              |
| PUT    | `/stock-entries/:id/costs`                | `stock-entries:manage` + `costs:read`                    | Reemplaza la lista abierta de costos adicionales (tipo + monto en Bs + nota)                                     |
| POST   | `/stock-entries/:id/items/quick`          | `stock-entries:manage` + `catalog:manage` + `costs:read` | Alta rápida de pieza nueva: producto + variante + ítem, atómico y auditado                                       |
| POST   | `/stock-entries/:id/confirm`              | `stock-entries:confirm` + `costs:read`                   | Confirmación única: movimientos, saldos, último costo y auditoría atómicos                                       |
| GET    | `/stock-entry-cost-types`                 | `stock-entries:read`                                     | Catálogo de tipos de costo adicional (activos e inactivos)                                                       |
| POST   | `/stock-entry-cost-types`                 | `settings:manage`                                        | Agrega un tipo de costo (solo Administrador)                                                                     |
| PATCH  | `/stock-entry-cost-types/:id`             | `settings:manage`                                        | Renombra o (des)activa un tipo agregado; los del sistema no se pueden cambiar                                    |
| GET    | `/products/variants/:id/cost-history`     | `costs:read`                                             | Historial de costos de la variante (compras confirmadas); paginado con `page` y `pageSize`                       |
| POST   | `/stock-entries/:id/cancel`               | `stock-entries:manage`                                   | Cancela un borrador sin tocar el stock                                                                           |

Ejemplos ejecutables: [`requests.http`](../../requests.http) (extensión REST Client).

## Endpoints previstos para la Fase 1 (pendientes de implementar)

| Módulo            | Rutas tentativas                                                               | Permisos                                   |
| ----------------- | ------------------------------------------------------------------------------ | ------------------------------------------ |
| Catálogo          | Atributos descriptivos por producto; edición de precios según P-25             | `catalog:*`, `prices:manage`, `costs:read` |
| Inventario        | Ajustes posteriores y salidas de stock; P-01 parcial                           | `inventory:*`                              |
| Inventario físico | `/inventory-counts`, `/:id/start`, `/:id/items`, `/:id/review`, `/:id/approve` | `inventory-counts:*`                       |
| Auditoría         | `/audit-logs`                                                                  | `audit:read`                               |

### Ingresos de mercadería

Un ingreso nace como **borrador** y no cambia el stock. Solo `POST /stock-entries/:id/confirm` lo hace, **una única vez**, en una transacción:

1. Convierte el precio de cada ítem a bolivianos con el tipo de cambio del ingreso (si es USD) y reparte la **lista de costos adicionales** entre los ítems **por valor de compra en Bs** (`cantidad recibida × costo unitario en Bs`); los centavos sobrantes se asignan por **mayor resto** y la suma iguala exactamente el total ([ADR-013](../decisions/ADR-013-costeo-ingresos.md), [ADR-015](../decisions/ADR-015-reparto-centavos-y-valor-cero.md), [ADR-016](../decisions/ADR-016-compras-en-dolares-y-costos-de-importacion.md)).
2. Registra un movimiento `STOCK_ENTRY` por ítem con el costo unitario total, aumenta el saldo y fija ese costo como **último costo** de la variante.
3. **No modifica el precio de venta** (P-25 pendiente).

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

**Alta rápida (`POST /stock-entries/:id/items/quick`).** Cuerpo: `categoryId`, `name`, `receivedQty` (≥ 1), `unitPrice` y `supplierCode` opcional. Respuesta `201` con `data` (ingreso actualizado) y `meta` (`variantId`, `warnings`). Si el código del proveedor ya existe como código de barras o SKU de otra pieza, no se guarda como código de barras y se informa en `warnings`; el código solo se guarda en la relación proveedor-pieza si ese proveedor no lo usa ya en otra.

**Entregas parciales.** El `documentNumber` puede repetirse entre ingresos; el detalle incluye `relatedEntries` (mismo proveedor y comprobante).

**Historial de costos.** `GET /products/variants/:id/cost-history` devuelve, de la más reciente a la más antigua, cada compra confirmada: `entryId`, `entryNumber`, `confirmedAt`, `supplierName`, `currency`, `exchangeRate`, `quantity`, `unitPrice`, `unitCostBob`, `unitExtraCost` y `unitTotalCost`.

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
