-- =============================================================================
-- Endurecimiento de ventas y caja tras la revisión de seguridad (2026-11-11). No edita la migración
-- 20261111000000_sales_and_cash: la complementa.
--
--   B-3  sale_payments: el CHECK anterior aceptaba un pago QR o por transferencia con
--        tendered_amount NO nulo y change_given nulo. El nuevo exige que AMBOS campos sean nulos
--        fuera del efectivo y AMBOS no nulos en efectivo.
--   B-6  Índice para el listado de incidencias sin filtro de estado (ordenado por fecha).
--   B-7  sale_incidents_guard cubre también INSERT: una incidencia nace abierta y sin datos de cierre.
-- =============================================================================

-- B-3 --------------------------------------------------------------------------------------------
ALTER TABLE "sale_payments" DROP CONSTRAINT "sale_payments_cash_fields_check";
ALTER TABLE "sale_payments"
  ADD CONSTRAINT "sale_payments_cash_fields_check" CHECK (
    "method_is_cash" = ("tendered_amount" IS NOT NULL)
    AND "method_is_cash" = ("change_given" IS NOT NULL)
  );

-- B-6 --------------------------------------------------------------------------------------------
-- CreateIndex
CREATE INDEX "sale_incidents_reported_at_idx" ON "sale_incidents"("reported_at");

-- B-7 --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "sale_incidents_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  closing_fields text[] := ARRAY['status', 'resolution', 'resolved_by_id', 'resolved_at'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'OPEN' OR NEW.resolution IS NOT NULL OR NEW.resolved_by_id IS NOT NULL
       OR NEW.resolved_at IS NOT NULL THEN
      RAISE EXCEPTION 'sale_incidents: una incidencia se registra abierta y sin datos de cierre';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'sale_incidents: las incidencias no se borran (DELETE no permitido)';
  END IF;
  IF OLD.status <> 'OPEN' OR NEW.status <> 'CLOSED' THEN
    RAISE EXCEPTION 'sale_incidents: solo se puede cerrar una incidencia abierta';
  END IF;
  IF (to_jsonb(NEW) - closing_fields) <> (to_jsonb(OLD) - closing_fields) THEN
    RAISE EXCEPTION 'sale_incidents: al cerrar solo cambian el estado y la resolución';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER "sale_incidents_guard" ON "sale_incidents";
CREATE TRIGGER "sale_incidents_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "sale_incidents"
  FOR EACH ROW EXECUTE FUNCTION "sale_incidents_guard"();
