---
name: database-design
description: Convenciones y procedimiento para modificar el modelo de datos (Prisma 7 + PostgreSQL 18) — schema.prisma, migraciones, restricciones SQL, índices y seed. Usar al tocar apps/api/prisma o al escribir consultas no triviales.
---

# Diseño de base de datos

Referencia: `docs/database/DATABASE.md`, `apps/api/prisma/schema.prisma`.

## Convenciones obligatorias

```prisma
model StockEntry {
  id        String   @id @default(uuid(7)) @db.Uuid          // UUID v7
  supplierId String  @map("supplier_id") @db.Uuid            // snake_case en BD
  total     Decimal  @db.Decimal(12, 2)                      // dinero: Decimal, nunca Float
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)
  supplier  Supplier @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  @@index([supplierId])
  @@map("stock_entries")                                     // tabla plural snake_case
}
```

- Precios `Decimal(12,2)`; costos unitarios `Decimal(12,4)`; cantidades `Int` (P-09).
- Enums con `@@map("snake_case")`.
- Entidades con historial: `isActive`/`status`, nunca borrado físico; FKs `Restrict`.
- Índice en cada FK usada para filtrar y en columnas de listados/ordenamiento.
- Documentar con `///` los campos cuyo significado no es obvio o dependen de un PENDIENTE.

## Procedimiento

```bash
# 1. Editar schema.prisma
npx prisma format && npx prisma validate        # (desde apps/api)
# 2a. Migración generada
npm run db:migrate -- --name agregar_x
# 2b. Si necesita SQL extra (CHECK, trigger, índice parcial):
cd apps/api && npx prisma migrate dev --create-only --name agregar_x
#     editar prisma/migrations/<ts>_agregar_x/migration.sql y luego:
npm run db:migrate
# 3. Revisar el SQL; actualizar docs/database/DATABASE.md; tests de integridad si aplica
```

## Prohibido

- Editar una migración ya aplicada (crea una nueva; ver la migración `append_only_error_code` como ejemplo).
- `prisma migrate reset` / `db:reset` / `DROP` sin confirmación explícita del usuario.
- `prisma db push` (salta el historial de migraciones).
- En triggers: no usar `ERRCODE 'restrict_violation'` (Prisma lo reporta como FK y oculta el mensaje);
  usar el código por defecto de `RAISE EXCEPTION`.

## Invariantes ya protegidas en BD (no romperlas)

- `inventory_movements`: append-only (trigger), `quantity <> 0`, `balance_after = balance_before + quantity`.
- `audit_logs`: append-only (solo `user_id → NULL` al borrar usuario).
- No negatividad de precios, costos, `min_stock` y cantidades de ingresos/conteos.
- SKU y barcode únicos.

## Transacciones y concurrencia (para servicios)

```ts
await prisma.$transaction(async (tx) => {
  // Bloquea la fila del saldo para evitar actualizaciones perdidas
  const [balance] = await tx.$queryRaw<{ quantity: number }[]>`
    SELECT quantity FROM inventory_balances WHERE variant_id = ${variantId}::uuid FOR UPDATE`;
  // ... insertar movimiento con balance_before/after y actualizar saldo
});
```

## Seed

`prisma/seed.ts`: idempotente (`upsert`, `createMany({ skipDuplicates: true })`), solo estructura.
Nunca productos, proveedores o stock inventados.
