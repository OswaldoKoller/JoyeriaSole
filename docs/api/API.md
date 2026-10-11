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

| Método | Ruta                                      | Auth                            | Descripción                                                                 |
| ------ | ----------------------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| GET    | `/health`                                 | —                               | Estado del servicio y de la BD (`200` ok / `503` degradado)                 |
| POST   | `/auth/login`                             | —                               | `{ email, password }` → `204` + cookie. Límite: 10 intentos / 15 min por IP |
| POST   | `/auth/change-password`                   | sesión                          | Valida contraseña actual; revoca todas las sesiones y exige nuevo login     |
| POST   | `/auth/logout`                            | sesión                          | Revoca la sesión → `204`                                                    |
| GET    | `/auth/me`                                | sesión                          | Usuario actual con roles y permisos                                         |
| GET    | `/suppliers`                              | `suppliers:read`                | Lista paginada; filtros por texto, estado y página                          |
| GET    | `/suppliers/:id`                          | `suppliers:read`                | Detalle de un proveedor; 404 si no existe                                   |
| POST   | `/suppliers`                              | `suppliers:manage`              | Crea un proveedor y registra auditoría; 201                                 |
| PATCH  | `/suppliers/:id`                          | `suppliers:manage`              | Edita campos o `isActive`; auditoría con antes/después                      |
| GET    | `/users`                                  | `users:read`                    | Lista paginada; filtros por nombre/correo y estado                          |
| GET    | `/users/:id`                              | `users:read`                    | Consulta usuario y roles; no expone contraseña ni sesiones                  |
| POST   | `/users`                                  | `users:manage` + `roles:manage` | Crea usuario con roles y contraseña inicial; audita sin exponer hash        |
| GET    | `/users/roles`                            | `users:read` + `roles:manage`   | Roles disponibles para asignación múltiple                                  |
| PATCH  | `/users/:id`                              | `users:manage`                  | Edita nombre/estado; revoca sesiones al desactivar; audita el cambio        |
| PUT    | `/users/:id/roles`                        | `users:manage` + `roles:manage` | Reemplaza la asignación de roles; protege al último administrador           |
| GET    | `/categories`                             | `catalog:read`                  | Lista categorías y subcategorías                                            |
| GET    | `/categories/:id`                         | `catalog:read`                  | Consulta una categoría                                                      |
| POST   | `/categories`                             | `catalog:manage`                | Crea categoría principal o subcategoría; máximo dos niveles                 |
| PATCH  | `/categories/:id`                         | `catalog:manage`                | Edita nombre, descripción u orden                                           |
| GET    | `/attributes`                             | `catalog:read`                  | Consulta definiciones y valores de atributos                                |
| POST   | `/attributes/:id/options`                 | `catalog:manage`                | Agrega valor a atributo de tipo lista                                       |
| GET    | `/products`                               | `catalog:read`                  | Lista y busca por nombre, SKU o código de barras                            |
| GET    | `/products/:id`                           | `catalog:read`                  | Consulta producto y variantes                                               |
| GET    | `/products/lookup?code=`                  | `catalog:read`                  | Busca exactamente un SKU o código de barras                                 |
| POST   | `/products`                               | `catalog:manage`                | Crea ficha y variante base con SKU correlativo                              |
| PATCH  | `/products/:id`                           | `catalog:manage`                | Edita nombre, modelo o descripción                                          |
| PATCH  | `/products/variants/:id/barcode`          | `catalog:manage`                | Registra código recibido del proveedor si no existe otro                    |
| POST   | `/products/variants/:id/barcode/generate` | `catalog:manage`                | Genera código propio tras guardar producto activo                           |
| POST   | `/products/:id/axes`                      | `catalog:manage`                | Define los ejes y valores de la variante base                               |
| POST   | `/products/:id/variants`                  | `catalog:manage`                | Agrega combinación única con SKU correlativo                                |
| GET    | `/inventory`                              | `inventory:read`                | Saldos por variante, búsqueda y filtros `level` e `initialOnly`             |
| GET    | `/inventory/movements`                    | `inventory:read`                | Historial global paginado con producto, variante y SKU                      |
| GET    | `/inventory/:variantId/movements`         | `inventory:read`                | Historial paginado de movimientos                                           |
| POST   | `/inventory/:variantId/initial`           | `inventory:adjust`              | Entrada inicial única; actualiza saldo y audita en transacción              |

Ejemplos ejecutables: [`requests.http`](../../requests.http) (extensión REST Client).

## Endpoints previstos para la Fase 1 (pendientes de implementar)

| Módulo            | Rutas tentativas                                                                      | Permisos                                   |
| ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------ |
| Catálogo          | Atributos descriptivos por producto; edición de precios según P-25                    | `catalog:*`, `prices:manage`, `costs:read` |
| Ingresos          | `/stock-entries`, `/stock-entries/:id/items`, `/stock-entries/:id/confirm`, `/cancel` | `stock-entries:*`                          |
| Inventario        | Ajustes posteriores y salidas de stock; P-01 parcial                                  | `inventory:*`                              |
| Inventario físico | `/inventory-counts`, `/:id/start`, `/:id/items`, `/:id/review`, `/:id/approve`        | `inventory-counts:*`                       |
| Auditoría         | `/audit-logs`                                                                         | `audit:read`                               |

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
