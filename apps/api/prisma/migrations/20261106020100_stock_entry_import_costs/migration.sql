-- S5 · Ingresos v2 (importación). ADR-016.
--   1) Moneda de compra por ingreso (BOB/USD) y tipo de cambio (Q-07).
--   2) Costos adicionales como lista abierta con catálogo de tipos (Q-08), en lugar de las tres
--      columnas fijas: los valores ya guardados se CONVIERTEN en líneas, sin perder información.
--   3) Por ítem: precio original, costo adicional asignado, costo total y justificación de diferencia.

-- CreateEnum
CREATE TYPE "stock_entry_currency" AS ENUM ('BOB', 'USD');

-- CreateTable
CREATE TABLE "stock_entry_cost_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_entry_cost_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_entry_costs" (
    "id" UUID NOT NULL,
    "stock_entry_id" UUID NOT NULL,
    "cost_type_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_entry_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_entry_cost_types_code_key" ON "stock_entry_cost_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "stock_entry_cost_types_name_key" ON "stock_entry_cost_types"("name");

-- CreateIndex
CREATE INDEX "stock_entry_costs_stock_entry_id_idx" ON "stock_entry_costs"("stock_entry_id");

-- CreateIndex
CREATE INDEX "stock_entry_costs_cost_type_id_idx" ON "stock_entry_costs"("cost_type_id");

-- AddForeignKey
ALTER TABLE "stock_entry_costs" ADD CONSTRAINT "stock_entry_costs_stock_entry_id_fkey" FOREIGN KEY ("stock_entry_id") REFERENCES "stock_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_entry_costs" ADD CONSTRAINT "stock_entry_costs_cost_type_id_fkey" FOREIGN KEY ("cost_type_id") REFERENCES "stock_entry_cost_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tipos del sistema (el seed los vuelve a upsertar por `code`: es idempotente). Se insertan aquí
-- porque la conversión de los costos antiguos los necesita antes de que corra cualquier seed.
INSERT INTO "stock_entry_cost_types" ("id", "code", "name", "is_system", "sort_order") VALUES
  (uuidv7(), 'TRANSPORT', 'Transporte', true, 1),
  (uuidv7(), 'PACKAGING', 'Embolsado', true, 2),
  (uuidv7(), 'CUSTOMS', 'Aduanización', true, 3),
  (uuidv7(), 'COMMISSIONS', 'Comisiones', true, 4),
  (uuidv7(), 'OTHER', 'Otro', true, 5);

-- Moneda y tipo de cambio del ingreso. Los ingresos existentes se registraron en bolivianos.
ALTER TABLE "stock_entries"
  ADD COLUMN "currency" "stock_entry_currency" NOT NULL DEFAULT 'BOB',
  ADD COLUMN "exchange_rate" DECIMAL(8,4);

ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_currency_rate_check" CHECK (
  ("currency" = 'BOB' AND "exchange_rate" IS NULL)
  OR ("currency" = 'USD' AND "exchange_rate" IS NOT NULL AND "exchange_rate" > 0)
);

-- Datos por ítem. `unit_price` (moneda del ingreso) arranca igual a `unit_cost` (todo era Bs).
ALTER TABLE "stock_entry_items"
  ADD COLUMN "difference_reason" VARCHAR(500),
  ADD COLUMN "unit_price" DECIMAL(12,4),
  ADD COLUMN "extra_cost_allocated" DECIMAL(12,2),
  ADD COLUMN "total_cost" DECIMAL(14,4);

UPDATE "stock_entry_items" SET "unit_price" = "unit_cost";
ALTER TABLE "stock_entry_items" ALTER COLUMN "unit_price" SET NOT NULL;
ALTER TABLE "stock_entry_items" ADD CONSTRAINT "stock_entry_items_unit_price_check" CHECK ("unit_price" >= 0);

-- Ingresos ya confirmados: se reconstruyen el costo adicional asignado y el costo total del ítem a
-- partir de lo guardado (costo adicional unitario × cantidad). Es una reconstrucción: el reparto
-- exacto en centavos de entonces no se conservó por ítem, sí el costo unitario (que es lo vigente).
UPDATE "stock_entry_items" AS item
SET "extra_cost_allocated" = ROUND(item."received_qty" * item."unit_extra_cost", 2),
    "total_cost" = item."received_qty" * (item."unit_cost" + item."unit_extra_cost")
FROM "stock_entries" AS entry
WHERE entry."id" = item."stock_entry_id"
  AND entry."status" = 'CONFIRMED'
  AND item."unit_extra_cost" IS NOT NULL;

-- Conversión de las tres columnas fijas en líneas de la lista (solo montos mayores que cero).
INSERT INTO "stock_entry_costs" ("id", "stock_entry_id", "cost_type_id", "amount", "created_at")
SELECT uuidv7(), entry."id", type."id", entry."freight_cost", entry."created_at"
FROM "stock_entries" AS entry JOIN "stock_entry_cost_types" AS type ON type."code" = 'TRANSPORT'
WHERE entry."freight_cost" > 0;

INSERT INTO "stock_entry_costs" ("id", "stock_entry_id", "cost_type_id", "amount", "created_at")
SELECT uuidv7(), entry."id", type."id", entry."packaging_cost", entry."created_at"
FROM "stock_entries" AS entry JOIN "stock_entry_cost_types" AS type ON type."code" = 'PACKAGING'
WHERE entry."packaging_cost" > 0;

INSERT INTO "stock_entry_costs" ("id", "stock_entry_id", "cost_type_id", "amount", "note", "created_at")
SELECT uuidv7(), entry."id", type."id", entry."other_costs", 'Valores extras (migrado)', entry."created_at"
FROM "stock_entries" AS entry JOIN "stock_entry_cost_types" AS type ON type."code" = 'OTHER'
WHERE entry."other_costs" > 0;

ALTER TABLE "stock_entries"
  DROP COLUMN "freight_cost",
  DROP COLUMN "packaging_cost",
  DROP COLUMN "other_costs";

-- Los montos de la lista son siempre positivos.
ALTER TABLE "stock_entry_costs" ADD CONSTRAINT "stock_entry_costs_amount_check" CHECK ("amount" > 0);

-- El comprobante del proveedor puede repetirse (entregas parciales, C5): índice de consulta, no único.
DROP INDEX "stock_entries_supplier_id_idx";
CREATE INDEX "stock_entries_supplier_id_document_number_idx" ON "stock_entries"("supplier_id", "document_number");
