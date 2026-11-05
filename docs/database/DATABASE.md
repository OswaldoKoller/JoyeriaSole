# Base de datos

PostgreSQL 18 · Prisma 7 · Esquema: [`apps/api/prisma/schema.prisma`](../../apps/api/prisma/schema.prisma)

## Convenciones

- Tablas en `snake_case` plural; columnas en `snake_case` (Prisma usa camelCase en código vía `@map`).
- IDs **UUID v7** (ordenables por tiempo, no adivinables). Tablas append-only de alto volumen
  (`inventory_movements`, `audit_logs`) usan `BIGINT` autoincremental.
- Fechas `timestamptz(3)` en UTC. La zona horaria de presentación (America/La_Paz) se aplica en la UI.
- Dinero `numeric`: precios `(12,2)`, costos unitarios `(12,4)` para no perder precisión al prorratear.
  Nunca `float`.
- Cantidades de stock: `integer` (piezas enteras; P-09 aprobado).
- Borrado: **no se borra** información con historial; se desactiva (`is_active` / `status`).
  Las FK usan `RESTRICT` para impedir borrados que romperían la trazabilidad.

## Diagrama de entidades

```
users ─┬─< user_roles >── roles ──< role_permissions >── permissions
       ├─< sessions
       ├─< audit_logs
       └─< (created_by / confirmed_by / approved_by / user_id en documentos y movimientos)

categories ─┐ (parent_id → árbol: categoría / subcategoría)
            ├─< category_attributes >── attributes ──< attribute_options
            └─< products ─┬─< product_variant_axes >── attributes
                          ├─< product_attribute_values ── (attribute, option?)
                          ├─< product_photos ──── product_photo_blobs (1:1)
                          └─< product_variants ─┬─< variant_attribute_values ── (attribute, option)
                                                ├── inventory_balances (1:1)
                                                ├─< inventory_movements
                                                ├─< supplier_products >── suppliers
                                                ├─< stock_entry_items >── stock_entries ── suppliers
                                                ├─< inventory_adjustment_items >── inventory_adjustments >── adjustment_reasons
                                                ├─< price_changes >── users (solicitante, decisor)
                                                └─< inventory_count_items >── inventory_counts
```

## Tablas

### Usuarios y seguridad

| Tabla                            | Propósito                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                          | Usuarios. `password_hash` Argon2id. `is_active` para desactivar sin borrar. `must_change_password` = clave temporal pendiente de cambio (F2). |
| `roles`                          | Agrupaciones de permisos. `is_system` = creados por seed (ADMIN, INVENTORY_MANAGER, SELLER).                                                  |
| `permissions`                    | Catálogo `<recurso>:<acción>` (fuente: `packages/shared/src/permissions.ts`).                                                                 |
| `user_roles`, `role_permissions` | Relaciones N:M.                                                                                                                               |
| `sessions`                       | Sesiones de servidor. Solo el **hash SHA-256** del token. Revocación con `revoked_at`.                                                        |

### Catálogo

| Tabla                      | Propósito                                                                                                                                                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `categories`               | Árbol (subcategoría = categoría con `parent_id`). `slug` único. Profundidad: P-04 (dos niveles, validado por la API).                                                                                                                                                                                                |
| `attributes`               | Definición: código, nombre, tipo (`OPTION`/`TEXT`/`NUMBER`/`BOOLEAN`), unidad, `suggested_use` (`VARIANT_AXIS`/`DESCRIPTIVE`, enum `attribute_usage`, B2) e `is_system` (las 12 base: no se desactivan).                                                                                                             |
| `attribute_options`        | Valores de atributos `OPTION` ("Plata 925", "Talla 16"). `code` opcional para componer SKU.                                                                                                                                                                                                                          |
| `category_attributes`      | Plantilla: qué atributos usa una categoría, cuáles son obligatorios y cuáles se sugieren como ejes. Gestionada con `PUT /categories/:id/attributes`.                                                                                                                                                                 |
| `products`                 | Ficha comercial. Estado `DRAFT`/`ACTIVE`/`INACTIVE`. `profile_incomplete` = marca manual de ficha por completar (C1).                                                                                                                                                                                                |
| `product_variant_axes`     | Qué atributos generan variantes en **este** producto.                                                                                                                                                                                                                                                                |
| `product_attribute_values` | Atributos descriptivos comunes (CHECK: exactamente un valor).                                                                                                                                                                                                                                                        |
| `product_variants`         | **Unidad de inventario**: `sku` único, `barcode` único opcional, costo, precio, stock mínimo, estado.                                                                                                                                                                                                                |
| `product_photos`           | Fotos del producto (hasta 5, S3/Q-09): solo **metadatos** (tipo, medidas, tamaño, `sha256` = ETag, `position`, `is_cover`, quién la subió). CHECK de tipo (`image/webp`, `image/jpeg`, `image/png`), medidas > 0 y posición ≥ 0; índice único parcial: una portada por producto. Borrado en cascada con el producto. |
| `product_photo_blobs`      | Bytes (`bytea`) de cada foto, 1:1 con `product_photos` (cascada). Implementación PostgreSQL de `PhotoStorage` (ADR-020); solo se lee al servir la imagen.                                                                                                                                                            |
| `variant_attribute_values` | Valor de cada eje para la variante (solo opciones).                                                                                                                                                                                                                                                                  |

`products.profile_incomplete` (migración `20261106020200_product_profile_incomplete`) marca las piezas creadas desde un ingreso con datos mínimos cuya ficha falta completar (C1); no bloquea la pieza y se limpia a mano (`PATCH /products/:id` con `profileIncomplete: false`). La API expone además `isIncomplete`, **calculado**: una ficha está incompleta si `profile_incomplete` es verdadero **o** si no tiene descripción ni características descriptivas. Filtros, insignias y el contador del Inicio usan esa combinación (P-41).

La migración `20261010000000_product_variant_sku_sequence` agrega la secuencia PostgreSQL para el SKU correlativo `SKU-000001`. Las secuencias no reutilizan números de transacciones canceladas; por eso puede haber huecos sin duplicados. La variante base se crea en la misma transacción que el producto.

### Proveedores e ingresos

| Tabla                    | Propósito                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `suppliers`              | Proveedores. `tax_id` (NIT) único opcional; `type` (`NATIONAL`/`FOREIGN`, defecto `NATIONAL`), `country`, `whatsapp`, `default_currency` (`BOB`/`USD`, defecto `BOB`) y `payment_terms` (migración `20261106020000_supplier_profile_v2`, compatible con filas existentes).                                                                                                                                                                             |
| `supplier_products`      | Código del proveedor para cada variante (identifica piezas al recibir y alimenta la búsqueda unificada; índice por `supplier_code`).                                                                                                                                                                                                                                                                                                                   |
| `stock_entries`          | Ingreso: proveedor, documento (el comprobante puede repetirse: entregas parciales), estado `DRAFT`/`CONFIRMED`/`CANCELLED`, `currency` (`BOB`/`USD`) y `exchange_rate` (`Decimal(8,4)`, Bs por USD; `CHECK`: BOB sin tipo de cambio, USD con tipo de cambio > 0), quién creó/confirmó. Migración `20261106020100_stock_entry_import_costs`: reemplaza `freight_cost`, `packaging_cost` y `other_costs` por `stock_entry_costs` sin perder información. |
| `stock_entry_items`      | Ítems: cantidad esperada vs. recibida y `difference_reason`; `unit_price` (precio original en la moneda del ingreso), `unit_cost` (equivalente en Bs), `unit_extra_cost`, `extra_cost_allocated` (Bs) y `total_cost` (Bs) — los tres últimos se fijan al confirmar (ADR-016).                                                                                                                                                                          |
| `stock_entry_cost_types` | Catálogo de tipos de costo adicional (`code`, `name` únicos, `is_active`, `is_system`, `sort_order`). El seed (y la migración) crean Transporte, Embolsado, Aduanización, Comisiones y Otro; el Administrador agrega más.                                                                                                                                                                                                                              |
| `stock_entry_costs`      | Lista abierta de costos adicionales de un ingreso: tipo, `amount` en Bs (`CHECK` > 0) y nota opcional. Se reparten por valor de compra (ADR-015).                                                                                                                                                                                                                                                                                                      |

### Precios de venta

| Tabla           | Propósito                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `price_changes` | **Historial inmutable** de precios de venta por variante (ADR-018): `previous_price`/`new_price` (`Decimal(12,2)`), `status` (`PENDING`/`APPROVED`/`REJECTED`/`CANCELLED`), `origin` (`REQUEST`/`ADMIN_DIRECT`/`INITIAL`), `requested_by_id`, `decided_by_id`, fechas, `reason`, `decision_comment`, `cost_snapshot` (`Decimal(12,4)`, costo total del momento) y `batch_id` (lote de la decisión). |

Migración `20261106020300_price_changes`. Reglas en la base: `CHECK` de precios >= 0 y distintos; estado coherente con la decisión (PENDING sin decidir, el resto con quién y cuándo); `ADMIN_DIRECT` e `INITIAL` nacen `APPROVED` por el mismo usuario; solo el solicitante cancela; `REJECTED` exige comentario; índice único parcial **una `PENDING` por variante**; y un trigger que impide `DELETE` y cualquier `UPDATE` de un cambio resuelto (de una pendiente solo permite resolverla: estado, decisor, fecha, comentario y lote). `product_variants.sale_price` solo cambia dentro de la transacción que registra el cambio en `price_changes` y su auditoría. El valor de enum `ADMIN_DIRECT` no cambia, pero desde la regla de autorización compartida (2026-11-05) lo registra también el Responsable de inventario (quien tenga `prices:approve`); su etiqueta visible es «Cambio directo (con autorización)». Sin cambios de esquema ni migración.

### Inventario

| Tabla                        | Propósito                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory_movements`        | **Libro mayor inmutable**. Cantidad con signo, saldo antes/después, costo, referencia al documento, motivo, usuario, fecha. Tipos: `INITIAL_STOCK`, `STOCK_ENTRY`, `ADJUSTMENT`, `COUNT_ADJUSTMENT`, `LOSS`, `EXCHANGE_IN`, `EXCHANGE_OUT` (y `SALE`, `CUSTOMER_RETURN`, `EXCHANGE` reservados sin uso).                                                                                                                                       |
| `inventory_balances`         | Saldo actual por variante (lectura rápida). Se actualiza en la misma transacción que el movimiento.                                                                                                                                                                                                                                                                                                                                            |
| `inventory_counts`           | Conteo físico (ADR-021): número `CNT-000001`, estado `DRAFT → IN_PROGRESS → RECOUNT → IN_REVIEW → APPROVED` / `CANCELLED`, `category_id` (alcance, incluye subcategorías), `operator_id` (único operador), fechas de cada paso, quién aprobó y motivo de cancelación. No se borra; terminado = inmutable (trigger).                                                                                                                            |
| `inventory_count_items`      | Una línea por variante del alcance: foto del sistema (`system_qty`, `snapshot_cursor`), primer conteo (`counted_qty`, `counted_cursor`), `needs_recount`, recuento (`recount_qty`, `recount_cursor`) y, al aprobar, el resultado congelado (`expected_qty`, `final_qty`, `reconciled_movements`, `difference`, saldos, `unit_cost`, `movement_id`). El cursor es el id del último movimiento de la variante al contar (conciliación, ADR-014). |
| `inventory_count_scans`      | Registro de cada lectura o cantidad fijada: ronda (1 o 2), variante **o** hallazgo, código, origen `SCAN`/`MANUAL`, `delta`, `quantity_after`, `movement_cursor`, usuario, hora y `undone_at`. Solo se agrega; lo único que cambia es `undone_at` (una vez); no se borra.                                                                                                                                                                      |
| `inventory_count_findings`   | Hallazgos: código leído que no existe (`NOT_FOUND`) o es de otra categoría (`OUT_OF_SCOPE`, con `variant_id`), ronda, cantidad, nota del operador y regularización (quién, cuándo, nota). Único por (conteo, ronda, código). No afectan el stock.                                                                                                                                                                                              |
| `adjustment_reasons`         | Catálogo de motivos de ajuste (P-20): `code`, `name`, `requires_notes` (el motivo «Otro» exige observación), `is_active`. Lo siembra el seed.                                                                                                                                                                                                                                                                                                  |
| `inventory_adjustments`      | Ajuste manual (ADR-017): número `AJ-000001`, estado `PENDING`, `APPROVED`, `REJECTED` o `CANCELLED`, motivo, observación, quién solicitó, quién resolvió y cuándo, comentario de resolución.                                                                                                                                                                                                                                                   |
| `inventory_adjustment_items` | Líneas: variante, `quantity_delta` con signo (distinto de 0), saldo visto al solicitar y, al aprobar, `balance_before`/`balance_after`, `unit_cost` y `movement_id` del movimiento `ADJUSTMENT`. Una variante por ajuste.                                                                                                                                                                                                                      |

### Auditoría

| Tabla        | Propósito                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `audit_logs` | Acciones de negocio y seguridad: quién, qué (`entidad.acción`), sobre qué entidad, antes/después (JSONB), IP, user-agent, request id. |

## Restricciones en la base de datos (defensa en profundidad)

Definidas en la migración inicial (SQL) y en las migraciones posteriores, además de las de Prisma:

- `CHECK` de no negatividad en precios, costos, stock mínimo y cantidades de ingresos/conteos.
- `CHECK (quantity >= 0)` en `inventory_balances` (`inventory_balances_quantity_check`, migración `20261106010000`): no existe stock negativo (P-08). Si un bug lo intentara, PostgreSQL revierte la transacción completa y la API responde un 500 genérico; además lo impide el servicio (`stock-ledger.ts`).
- `inventory_movements`: `quantity <> 0` y `balance_after = balance_before + quantity`. No hay CHECK de signo por tipo: que `EXCHANGE_IN` sea positivo y `EXCHANGE_OUT` negativo lo garantiza el servicio de inventario (migración `20261106030300` solo agrega esos dos valores a `movement_type`).
- Conteo físico (migración `20261106030200`): operador obligatorio en captura/recuento; resultado de cada línea coherente (`difference = final_qty − expected_qty`, `balance_after = balance_before + difference`, movimiento ⇔ diferencia ≠ 0); lecturas con `delta <> 0` y variante XOR hallazgo; triggers que impiden borrar conteos, modificar conteos/líneas terminados y alterar o borrar lecturas.
- `product_attribute_values`: exactamente un valor no nulo.
- `categories`: una categoría no puede ser su propio padre.
- **Trigger de inmutabilidad** en `price_changes` (migración `20261106020300`): un cambio de precio resuelto no se modifica ni se borra.
- `product_photos`: tipo en lista blanca, medidas positivas y **una sola portada por producto** (índice único parcial `product_photos_one_cover_per_product`); `product_photo_blobs`: bytes no vacíos. El máximo de 5 fotos lo garantiza el servicio bajo `SELECT ... FOR UPDATE` del producto.
- **Triggers append-only** en `inventory_movements` y `audit_logs`: impiden `UPDATE`/`DELETE`.
  (En `audit_logs` solo se permite que `user_id` pase a NULL si se elimina el usuario.)
- `inventory_adjustment_items`: `quantity_delta <> 0`; cantidad anterior, nueva y movimiento van juntas y
  `balance_after = balance_before + quantity_delta >= 0`.
- `inventory_adjustments`: `resolved_by/at` solo en `APPROVED`/`REJECTED`, `cancelled_at` solo en
  `CANCELLED`, y un rechazo exige comentario. **Triggers**: un ajuste no se borra y, una vez resuelto
  (`status <> 'PENDING'`), ni él ni sus líneas se modifican (ADR-017).

Estas garantías están cubiertas por `apps/api/test/integration/database-integrity.test.ts`.

## Migraciones

```bash
npm run db:migrate          # desarrollo: crea y aplica una migración a partir del schema
npm run db:deploy           # producción/CI: aplica migraciones pendientes (no destructivo)
npm run db:seed             # datos estructurales (idempotente)
npm run db:studio           # explorador visual
```

Reglas:

1. **Nunca editar una migración ya aplicada** en otro entorno. Crear una nueva.
2. Para SQL que Prisma no expresa (CHECK, triggers, índices parciales):
   `npx prisma migrate dev --create-only --name <nombre>` → editar el SQL → `npm run db:migrate`.
3. Cambios destructivos (borrar/renombrar columnas con datos) en dos pasos: agregar → migrar datos →
   eliminar en una versión posterior.
4. Revisar el SQL generado antes de commitear.

## Seed

`apps/api/prisma/seed.ts` carga solo **estructura**: permisos, roles preliminares, administrador
inicial (desde `SEED_ADMIN_*`) y las 12 definiciones de atributos citadas en el requerimiento, sin
valores. **No** carga productos, categorías ni proveedores: los define el cliente. También siembra,
de forma idempotente, el catálogo de motivos de ajuste (Robo, Pérdida, Muestra, Rotura, Error de
registro, Otro) y los tipos de costo de importación (Transporte, Embolsado, Aduanización, Comisiones,
Otro); solo agrega los que faltan y no pisa cambios hechos después.

Cuando se agregan o reasignan permisos (p. ej. `prices:propose`/`prices:approve`,
`inventory:adjust-approve` o `inventory:initial-stock`) hay que **volver a ejecutar el seed** en las
bases existentes. Desde la regla de autorización compartida (2026-11-05) el Responsable de inventario
también tiene `inventory:adjust-approve`, `prices:approve` e `inventory:initial-stock`; en bases ya
sembradas se le asignan al volver a ejecutar el seed o desde la pantalla de roles.
