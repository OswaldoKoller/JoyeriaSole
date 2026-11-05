-- CreateEnum
CREATE TYPE "price_change_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "price_change_origin" AS ENUM ('REQUEST', 'ADMIN_DIRECT', 'INITIAL');

-- CreateTable
CREATE TABLE "price_changes" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "previous_price" DECIMAL(12,2) NOT NULL,
    "new_price" DECIMAL(12,2) NOT NULL,
    "status" "price_change_status" NOT NULL DEFAULT 'PENDING',
    "origin" "price_change_origin" NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "decided_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),
    "reason" VARCHAR(500),
    "decision_comment" VARCHAR(500),
    "cost_snapshot" DECIMAL(12,4) NOT NULL,
    "batch_id" UUID,

    CONSTRAINT "price_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_changes_variant_id_created_at_idx" ON "price_changes"("variant_id", "created_at");

-- CreateIndex
CREATE INDEX "price_changes_status_created_at_idx" ON "price_changes"("status", "created_at");

-- CreateIndex
CREATE INDEX "price_changes_requested_by_id_idx" ON "price_changes"("requested_by_id");

-- CreateIndex
CREATE INDEX "price_changes_decided_by_id_idx" ON "price_changes"("decided_by_id");

-- CreateIndex
CREATE INDEX "price_changes_batch_id_idx" ON "price_changes"("batch_id");

-- AddForeignKey
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Reglas del historial de precios (ADR-018), garantizadas en la base de datos.
-- =============================================================================

-- Precios válidos y un cambio real (el precio nuevo debe diferir del anterior).
ALTER TABLE "price_changes"
  ADD CONSTRAINT "price_changes_prices_check"
  CHECK ("previous_price" >= 0 AND "new_price" >= 0 AND "previous_price" <> "new_price"),
  ADD CONSTRAINT "price_changes_cost_snapshot_check" CHECK ("cost_snapshot" >= 0);

-- Coherencia entre estado y decisión: PENDING sin decisión; el resto con quien y cuándo.
ALTER TABLE "price_changes"
  ADD CONSTRAINT "price_changes_decision_check" CHECK (
    ("status" = 'PENDING' AND "decided_by_id" IS NULL AND "decided_at" IS NULL)
    OR ("status" <> 'PENDING' AND "decided_by_id" IS NOT NULL AND "decided_at" IS NOT NULL)
  );

-- El cambio directo del Administrador y el precio inicial nacen aprobados por quien los registra.
ALTER TABLE "price_changes"
  ADD CONSTRAINT "price_changes_origin_check" CHECK (
    "origin" = 'REQUEST'
    OR ("status" = 'APPROVED' AND "decided_by_id" = "requested_by_id")
  );

-- Solo el solicitante cancela su solicitud.
ALTER TABLE "price_changes"
  ADD CONSTRAINT "price_changes_cancel_check"
  CHECK ("status" <> 'CANCELLED' OR "decided_by_id" = "requested_by_id");

-- Rechazar exige un comentario con contenido.
ALTER TABLE "price_changes"
  ADD CONSTRAINT "price_changes_reject_comment_check"
  CHECK ("status" <> 'REJECTED' OR length(btrim(coalesce("decision_comment", ''))) >= 3);

-- Una sola solicitud pendiente por variante.
CREATE UNIQUE INDEX "price_changes_one_pending_per_variant_idx"
  ON "price_changes"("variant_id") WHERE "status" = 'PENDING';

-- Inmutabilidad: un cambio resuelto no se modifica ni se borra. Una solicitud pendiente solo puede
-- resolverse (estado, quién, cuándo, comentario y lote); precios, variante y origen no cambian.
CREATE OR REPLACE FUNCTION "prevent_price_change_mutation"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'La tabla price_changes es un historial inmutable: DELETE no permitido';
  END IF;
  IF OLD."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'El cambio de precio ya fue resuelto y no se puede modificar';
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'decided_by_id' - 'decided_at' - 'decision_comment' - 'batch_id')
     <> (to_jsonb(OLD) - 'status' - 'decided_by_id' - 'decided_at' - 'decision_comment' - 'batch_id') THEN
    RAISE EXCEPTION 'Una solicitud de precio solo puede resolverse: no se editan sus datos';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "price_changes_immutable"
  BEFORE UPDATE OR DELETE ON "price_changes"
  FOR EACH ROW EXECUTE FUNCTION "prevent_price_change_mutation"();
