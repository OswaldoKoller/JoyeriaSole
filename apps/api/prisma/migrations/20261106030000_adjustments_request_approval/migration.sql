-- CreateEnum
CREATE TYPE "adjustment_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "adjustment_reasons" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "requires_notes" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adjustment_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustments" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "status" "adjustment_status" NOT NULL DEFAULT 'PENDING',
    "reason_id" UUID NOT NULL,
    "notes" TEXT,
    "requested_by_id" UUID NOT NULL,
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "resolution_notes" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustment_items" (
    "id" UUID NOT NULL,
    "adjustment_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity_delta" INTEGER NOT NULL,
    "quantity_at_request" INTEGER NOT NULL,
    "balance_before" INTEGER,
    "balance_after" INTEGER,
    "unit_cost" DECIMAL(12,4),
    "movement_id" BIGINT,

    CONSTRAINT "inventory_adjustment_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "adjustment_reasons_code_key" ON "adjustment_reasons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_adjustments_number_key" ON "inventory_adjustments"("number");

-- CreateIndex
CREATE INDEX "inventory_adjustments_status_created_at_idx" ON "inventory_adjustments"("status", "created_at");

-- CreateIndex
CREATE INDEX "inventory_adjustments_requested_by_id_idx" ON "inventory_adjustments"("requested_by_id");

-- CreateIndex
CREATE INDEX "inventory_adjustments_reason_id_idx" ON "inventory_adjustments"("reason_id");

-- CreateIndex
CREATE INDEX "inventory_adjustment_items_variant_id_idx" ON "inventory_adjustment_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_adjustment_items_adjustment_id_variant_id_key" ON "inventory_adjustment_items"("adjustment_id", "variant_id");

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "adjustment_reasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment_items" ADD CONSTRAINT "inventory_adjustment_items_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "inventory_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment_items" ADD CONSTRAINT "inventory_adjustment_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Restricciones de integridad (ADR-017). Última línea de defensa si un servicio tuviera un bug.
-- =============================================================================
ALTER TABLE "inventory_adjustment_items"
  ADD CONSTRAINT "inventory_adjustment_items_delta_check" CHECK ("quantity_delta" <> 0),
  ADD CONSTRAINT "inventory_adjustment_items_at_request_check" CHECK ("quantity_at_request" >= 0),
  -- Cantidad anterior/nueva: o se registran las dos (al aprobar) o ninguna, y deben cuadrar.
  ADD CONSTRAINT "inventory_adjustment_items_balance_check" CHECK (
    ("balance_before" IS NULL AND "balance_after" IS NULL AND "movement_id" IS NULL)
    OR ("balance_before" IS NOT NULL AND "balance_after" IS NOT NULL AND "movement_id" IS NOT NULL
        AND "balance_after" = "balance_before" + "quantity_delta" AND "balance_after" >= 0)
  ),
  ADD CONSTRAINT "inventory_adjustment_items_unit_cost_check" CHECK ("unit_cost" IS NULL OR "unit_cost" >= 0);

ALTER TABLE "inventory_adjustments"
  -- Quien resuelve y cuándo: solo en APPROVED/REJECTED, siempre ambos.
  ADD CONSTRAINT "inventory_adjustments_resolution_check" CHECK (
    ("status" IN ('APPROVED', 'REJECTED')) = ("resolved_by_id" IS NOT NULL AND "resolved_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "inventory_adjustments_cancelled_check" CHECK (
    ("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL)
  ),
  -- Rechazar exige un comentario no vacío.
  ADD CONSTRAINT "inventory_adjustments_reject_notes_check" CHECK (
    "status" <> 'REJECTED' OR length(btrim(coalesce("resolution_notes", ''))) > 0
  );

-- =============================================================================
-- Un ajuste resuelto es historia: no se borra y no se modifica (solo PENDING admite cambios).
-- =============================================================================
CREATE OR REPLACE FUNCTION "prevent_resolved_adjustment_change"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los ajustes de inventario no se eliminan: use la cancelación o el rechazo';
  END IF;
  IF OLD."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'El ajuste ya fue resuelto (%) y no se puede modificar', OLD."status";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "inventory_adjustments_immutable"
  BEFORE UPDATE OR DELETE ON "inventory_adjustments"
  FOR EACH ROW EXECUTE FUNCTION "prevent_resolved_adjustment_change"();

CREATE OR REPLACE FUNCTION "prevent_resolved_adjustment_item_change"() RETURNS trigger AS $$
DECLARE
  parent_status "adjustment_status";
BEGIN
  SELECT "status" INTO parent_status FROM "inventory_adjustments" WHERE "id" = OLD."adjustment_id";
  IF parent_status IS DISTINCT FROM 'PENDING' THEN
    RAISE EXCEPTION 'Las líneas de un ajuste resuelto no se pueden modificar ni eliminar';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "inventory_adjustment_items_immutable"
  BEFORE UPDATE OR DELETE ON "inventory_adjustment_items"
  FOR EACH ROW EXECUTE FUNCTION "prevent_resolved_adjustment_item_change"();
