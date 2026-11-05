# Base de datos

PostgreSQL 18 · Prisma 7 · Esquema: [`apps/api/prisma/schema.prisma`](../../apps/api/prisma/schema.prisma)

## Convenciones

- Tablas en `snake_case` plural; columnas en `snake_case` (Prisma usa camelCase en código vía `@map`).
- IDs **UUID v7** (ordenables por tiempo, no adivinables). Tablas append-only de alto volumen
  (`inventory_movements`, `audit_logs`) usan `BIGINT` autoincremental.
- Fechas `timestamptz(3)` en UTC. La zona horaria de presentación (America/La_Paz) se aplica en la UI.
- Dinero `numeric`: precios `(12,2)`, costos unitarios `(12,4)` para no perder precisión al prorratear.
  Nunca `float`.
- Cantidades de stock: `integer` (piezas). PENDIENTE P-09.
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
                          └─< product_variants ─┬─< variant_attribute_values ── (attribute, option)
                                                ├── inventory_balances (1:1)
                                                ├─< inventory_movements
                                                ├─< supplier_products >── suppliers
                                                ├─< stock_entry_items >── stock_entries ── suppliers
                                                └─< inventory_count_items >── inventory_counts
```

## Tablas

### Usuarios y seguridad

| Tabla                            | Propósito                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `users`                          | Usuarios. `password_hash` Argon2id. `is_active` para desactivar sin borrar.                  |
| `roles`                          | Agrupaciones de permisos. `is_system` = creados por seed (ADMIN, INVENTORY_MANAGER, SELLER). |
| `permissions`                    | Catálogo `<recurso>:<acción>` (fuente: `packages/shared/src/permissions.ts`).                |
| `user_roles`, `role_permissions` | Relaciones N:M.                                                                              |
| `sessions`                       | Sesiones de servidor. Solo el **hash SHA-256** del token. Revocación con `revoked_at`.       |

### Catálogo

| Tabla                      | Propósito                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `categories`               | Árbol (subcategoría = categoría con `parent_id`). `slug` único. Profundidad: P-04.                    |
| `attributes`               | Definición: código, nombre, tipo (`OPTION`/`TEXT`/`NUMBER`/`BOOLEAN`), unidad.                        |
| `attribute_options`        | Valores de atributos `OPTION` ("Plata 925", "Talla 16"). `code` opcional para componer SKU.           |
| `category_attributes`      | Plantilla: qué atributos sugiere una categoría y cuáles como ejes de variante.                        |
| `products`                 | Ficha comercial. Estado `DRAFT`/`ACTIVE`/`INACTIVE`.                                                  |
| `product_variant_axes`     | Qué atributos generan variantes en **este** producto.                                                 |
| `product_attribute_values` | Atributos descriptivos comunes (CHECK: exactamente un valor).                                         |
| `product_variants`         | **Unidad de inventario**: `sku` único, `barcode` único opcional, costo, precio, stock mínimo, estado. |
| `variant_attribute_values` | Valor de cada eje para la variante (solo opciones).                                                   |

`products.profile_incomplete` (migración `20261106020200_product_profile_incomplete`) marca las piezas creadas desde un ingreso con datos mínimos cuya ficha falta completar (C1); no bloquea la pieza.

La migración `20261010000000_product_variant_sku_sequence` agrega la secuencia PostgreSQL para el SKU correlativo `SKU-000001`. Las secuencias no reutilizan números de transacciones canceladas; por eso puede haber huecos sin duplicados. La variante base se crea en la misma transacción que el producto.

### Proveedores e ingresos

| Tabla                    | Propósito                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `suppliers`              | Proveedores. `tax_id` (NIT) único opcional; `type` (`NATIONAL`/`FOREIGN`, defecto `NATIONAL`), `country`, `whatsapp`, `default_currency` (`BOB`/`USD`, defecto `BOB`) y `payment_terms` (migración `20261106020000_supplier_profile_v2`, compatible con filas existentes).                                                                                                                                                                             |
| `supplier_products`      | Código del proveedor para cada variante (ayuda a identificar piezas al recibir).                                                                                                                                                                                                                                                                                                                                                                       |
| `stock_entries`          | Ingreso: proveedor, documento (el comprobante puede repetirse: entregas parciales), estado `DRAFT`/`CONFIRMED`/`CANCELLED`, `currency` (`BOB`/`USD`) y `exchange_rate` (`Decimal(8,4)`, Bs por USD; `CHECK`: BOB sin tipo de cambio, USD con tipo de cambio > 0), quién creó/confirmó. Migración `20261106020100_stock_entry_import_costs`: reemplaza `freight_cost`, `packaging_cost` y `other_costs` por `stock_entry_costs` sin perder información. |
| `stock_entry_items`      | Ítems: cantidad esperada vs. recibida y `difference_reason`; `unit_price` (precio original en la moneda del ingreso), `unit_cost` (equivalente en Bs), `unit_extra_cost`, `extra_cost_allocated` (Bs) y `total_cost` (Bs) — los tres últimos se fijan al confirmar (ADR-016).                                                                                                                                                                          |
| `stock_entry_cost_types` | Catálogo de tipos de costo adicional (`code`, `name` únicos, `is_active`, `is_system`, `sort_order`). El seed (y la migración) crean Transporte, Embolsado, Aduanización, Comisiones y Otro; el Administrador agrega más.                                                                                                                                                                                                                              |
| `stock_entry_costs`      | Lista abierta de costos adicionales de un ingreso: tipo, `amount` en Bs (`CHECK` > 0) y nota opcional. Se reparten por valor de compra (ADR-015).                                                                                                                                                                                                                                                                                                      |

### Inventario

| Tabla                   | Propósito                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `inventory_movements`   | **Libro mayor inmutable**. Cantidad con signo, saldo antes/después, costo, referencia al documento, motivo, usuario, fecha. |
| `inventory_balances`    | Saldo actual por variante (lectura rápida). Se actualiza en la misma transacción que el movimiento.                         |
| `inventory_counts`      | Inventario físico: `DRAFT → IN_PROGRESS → IN_REVIEW → APPROVED` / `CANCELLED`.                                              |
| `inventory_count_items` | Por variante: stock del sistema (snapshot), contado, quién/cuándo, motivo de diferencia.                                    |

### Auditoría

| Tabla        | Propósito                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `audit_logs` | Acciones de negocio y seguridad: quién, qué (`entidad.acción`), sobre qué entidad, antes/después (JSONB), IP, user-agent, request id. |

## Restricciones en la base de datos (defensa en profundidad)

Definidas en la migración inicial (SQL), además de las de Prisma:

- `CHECK` de no negatividad en precios, costos, stock mínimo y cantidades de ingresos/conteos.
- `inventory_movements`: `quantity <> 0` y `balance_after = balance_before + quantity`.
- `product_attribute_values`: exactamente un valor no nulo.
- `categories`: una categoría no puede ser su propio padre.
- **Triggers append-only** en `inventory_movements` y `audit_logs`: impiden `UPDATE`/`DELETE`.
  (En `audit_logs` solo se permite que `user_id` pase a NULL si se elimina el usuario.)
- Stock negativo **no** restringido a propósito (P-08).

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
valores. **No** carga productos, categorías ni proveedores: los define el cliente.
