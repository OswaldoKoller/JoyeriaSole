-- Ventas de mostrador y caja única (plan 11 de docs/propuestas/fase-2-ventas; autorizado el
-- 2026-11-10, ver docs/business/RESOLUCIONES-2026-11-10.md). Parte generada por Prisma + SQL adicional
-- al final (CHECK, índice parcial, triggers de inmutabilidad e integridad, siembras).
-- CreateEnum
CREATE TYPE "cash_session_status" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "cash_correction_kind" AS ENUM ('COUNTED_CASH', 'OPENING_AMOUNT', 'NOTE');

-- CreateEnum
CREATE TYPE "sale_incident_kind" AS ENUM ('WRONG_SALE', 'WRONG_PAYMENT', 'DUPLICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "sale_incident_status" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_cash" BOOLEAN NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "status" "cash_session_status" NOT NULL DEFAULT 'OPEN',
    "opened_by_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opening_amount" DECIMAL(12,2) NOT NULL,
    "closed_by_id" UUID,
    "closed_at" TIMESTAMPTZ(3),
    "cash_sales_total" DECIMAL(12,2),
    "cash_movements_net" DECIMAL(12,2),
    "expected_cash" DECIMAL(12,2),
    "counted_cash" DECIMAL(12,2),
    "difference" DECIMAL(12,2),
    "notes" VARCHAR(500),
    "open_request_id" UUID NOT NULL,
    "close_request_id" UUID,
    "close_request_hash" CHAR(64),

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "cash_session_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "seller_name" VARCHAR(120) NOT NULL,
    "sold_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "total" DECIMAL(12,2) NOT NULL,
    "client_request_id" UUID NOT NULL,
    "request_hash" CHAR(64) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,
    "unit_cost_snapshot" DECIMAL(12,4) NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "product_name" VARCHAR(200) NOT NULL,
    "variant_label" VARCHAR(200),
    "movement_id" BIGINT NOT NULL,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_payments" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "method_id" UUID NOT NULL,
    "method_is_cash" BOOLEAN NOT NULL,
    "method_name" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "tendered_amount" DECIMAL(12,2),
    "change_given" DECIMAL(12,2),
    "reference" VARCHAR(100),

    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_receipt_prints" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "copy_number" INTEGER NOT NULL,
    "format" VARCHAR(10) NOT NULL,
    "printed_by_id" UUID NOT NULL,
    "printed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_receipt_prints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_session_corrections" (
    "id" UUID NOT NULL,
    "cash_session_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" "cash_correction_kind" NOT NULL,
    "previous_value" DECIMAL(12,2),
    "new_value" DECIMAL(12,2),
    "expected_cash_after" DECIMAL(12,2) NOT NULL,
    "counted_cash_after" DECIMAL(12,2) NOT NULL,
    "difference_after" DECIMAL(12,2) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "corrected_by_id" UUID NOT NULL,
    "corrected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "client_request_id" UUID NOT NULL,
    "request_hash" CHAR(64) NOT NULL,

    CONSTRAINT "cash_session_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_incidents" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "sale_id" UUID,
    "kind" "sale_incident_kind" NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "status" "sale_incident_status" NOT NULL DEFAULT 'OPEN',
    "reported_by_id" UUID NOT NULL,
    "reported_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolution" VARCHAR(1000),
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "client_request_id" UUID NOT NULL,

    CONSTRAINT "sale_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_settings" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "trade_name" VARCHAR(120) NOT NULL,
    "address" VARCHAR(200),
    "phone" VARCHAR(40),
    "tax_id" VARCHAR(20),
    "receipt_show_seller" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,

    CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_code_key" ON "payment_methods"("code");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_name_key" ON "payment_methods"("name");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_id_is_cash_key" ON "payment_methods"("id", "is_cash");

-- CreateIndex
CREATE UNIQUE INDEX "cash_sessions_number_key" ON "cash_sessions"("number");

-- CreateIndex
CREATE UNIQUE INDEX "cash_sessions_open_request_id_key" ON "cash_sessions"("open_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_sessions_close_request_id_key" ON "cash_sessions"("close_request_id");

-- CreateIndex
CREATE INDEX "cash_sessions_opened_at_idx" ON "cash_sessions"("opened_at");

-- CreateIndex
CREATE INDEX "cash_sessions_opened_by_id_idx" ON "cash_sessions"("opened_by_id");

-- CreateIndex
CREATE INDEX "cash_sessions_closed_by_id_idx" ON "cash_sessions"("closed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_number_key" ON "sales"("number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_client_request_id_key" ON "sales"("client_request_id");

-- CreateIndex
CREATE INDEX "sales_sold_at_id_idx" ON "sales"("sold_at", "id");

-- CreateIndex
CREATE INDEX "sales_seller_id_sold_at_idx" ON "sales"("seller_id", "sold_at");

-- CreateIndex
CREATE INDEX "sales_cash_session_id_idx" ON "sales"("cash_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_items_movement_id_key" ON "sale_items"("movement_id");

-- CreateIndex
CREATE INDEX "sale_items_variant_id_sale_id_idx" ON "sale_items"("variant_id", "sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_items_sale_id_variant_id_key" ON "sale_items"("sale_id", "variant_id");

-- CreateIndex
CREATE INDEX "sale_payments_sale_id_idx" ON "sale_payments"("sale_id");

-- CreateIndex
CREATE INDEX "sale_payments_method_id_idx" ON "sale_payments"("method_id");

-- CreateIndex
CREATE INDEX "sale_receipt_prints_printed_by_id_idx" ON "sale_receipt_prints"("printed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_receipt_prints_sale_id_copy_number_key" ON "sale_receipt_prints"("sale_id", "copy_number");

-- CreateIndex
CREATE UNIQUE INDEX "cash_session_corrections_client_request_id_key" ON "cash_session_corrections"("client_request_id");

-- CreateIndex
CREATE INDEX "cash_session_corrections_corrected_by_id_idx" ON "cash_session_corrections"("corrected_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_session_corrections_cash_session_id_sequence_key" ON "cash_session_corrections"("cash_session_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "sale_incidents_number_key" ON "sale_incidents"("number");

-- CreateIndex
CREATE UNIQUE INDEX "sale_incidents_client_request_id_key" ON "sale_incidents"("client_request_id");

-- CreateIndex
CREATE INDEX "sale_incidents_status_reported_at_idx" ON "sale_incidents"("status", "reported_at");

-- CreateIndex
CREATE INDEX "sale_incidents_sale_id_idx" ON "sale_incidents"("sale_id");

-- CreateIndex
CREATE INDEX "sale_incidents_reported_by_id_idx" ON "sale_incidents"("reported_by_id");

-- CreateIndex
CREATE INDEX "sale_incidents_resolved_by_id_idx" ON "sale_incidents"("resolved_by_id");

-- CreateIndex
CREATE INDEX "business_settings_updated_by_id_idx" ON "business_settings"("updated_by_id");

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "inventory_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_method_id_method_is_cash_fkey" FOREIGN KEY ("method_id", "method_is_cash") REFERENCES "payment_methods"("id", "is_cash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_receipt_prints" ADD CONSTRAINT "sale_receipt_prints_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_receipt_prints" ADD CONSTRAINT "sale_receipt_prints_printed_by_id_fkey" FOREIGN KEY ("printed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_session_corrections" ADD CONSTRAINT "cash_session_corrections_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_session_corrections" ADD CONSTRAINT "cash_session_corrections_corrected_by_id_fkey" FOREIGN KEY ("corrected_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_incidents" ADD CONSTRAINT "sale_incidents_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_incidents" ADD CONSTRAINT "sale_incidents_reported_by_id_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_incidents" ADD CONSTRAINT "sale_incidents_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =============================================================================
-- SQL adicional de Ventas y Caja (plan 11 de docs/propuestas/fase-2-ventas, §3; ADR-022, 023 y 024).
-- Prisma no expresa CHECK, índices parciales ni triggers. Todos los RAISE usan el código por
-- defecto (P0001) para que el mensaje llegue intacto (migración append_only_error_code).
--
-- Una venta confirmada es INMUTABLE (DEC-V07): no se anula, no se borra y no se modifica. No existe
-- estado de venta ni ninguna vía de reversión. TRUNCATE no se cubre con triggers: se revoca al
-- usuario de la aplicación en producción (prisma/privileges, D3).
-- =============================================================================

-- 1. Signo del movimiento de venta (I-05 parcial; la migración de garantías no lo trae) -----------
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_sale_sign_check" CHECK ("type" <> 'SALE' OR "quantity" < 0);

-- 2. Medios de pago ------------------------------------------------------------------------------
ALTER TABLE "payment_methods"
  ADD CONSTRAINT "payment_methods_code_check" CHECK (length(btrim("code")) > 0),
  ADD CONSTRAINT "payment_methods_name_check" CHECK (length(btrim("name")) > 0);

-- Catálogo fijo (D-09, POR DEFECTO — PENDIENTE DE CONFIRMACIÓN). El seed hace lo mismo sin pisar
-- `is_active`. Fuente: SYSTEM_PAYMENT_METHODS en packages/shared/src/sales.ts.
INSERT INTO "payment_methods" ("id", "code", "name", "is_cash", "is_active", "is_system", "sort_order")
VALUES
  (uuidv7(), 'CASH', 'Efectivo', true, true, true, 1),
  (uuidv7(), 'QR', 'QR', false, true, true, 2),
  (uuidv7(), 'BANK_TRANSFER', 'Transferencia', false, true, true, 3)
ON CONFLICT ("code") DO NOTHING;

-- 3. Sesiones de caja -----------------------------------------------------------------------------
-- Una sola sesión abierta, garantizada en la base (R-10).
CREATE UNIQUE INDEX "cash_sessions_single_open_idx" ON "cash_sessions" ("status") WHERE "status" = 'OPEN';

ALTER TABLE "cash_sessions"
  ADD CONSTRAINT "cash_sessions_opening_amount_check" CHECK ("opening_amount" >= 0),
  ADD CONSTRAINT "cash_sessions_counted_cash_check" CHECK ("counted_cash" >= 0),
  ADD CONSTRAINT "cash_sessions_cash_sales_total_check" CHECK ("cash_sales_total" >= 0),
  ADD CONSTRAINT "cash_sessions_closed_after_opened_check" CHECK ("closed_at" >= "opened_at"),
  ADD CONSTRAINT "cash_sessions_closed_state_check" CHECK (
    ("status" = 'CLOSED') = (
      "closed_by_id" IS NOT NULL AND "closed_at" IS NOT NULL AND "cash_sales_total" IS NOT NULL
      AND "cash_movements_net" IS NOT NULL AND "expected_cash" IS NOT NULL
      AND "counted_cash" IS NOT NULL AND "difference" IS NOT NULL
      AND "close_request_id" IS NOT NULL AND "close_request_hash" IS NOT NULL
    )
  ),
  -- Sin gastos ni retiros (B6): los movimientos de caja valen 0.
  ADD CONSTRAINT "cash_sessions_movements_net_check" CHECK ("cash_movements_net" = 0),
  ADD CONSTRAINT "cash_sessions_expected_cash_check"
    CHECK ("expected_cash" = "opening_amount" + "cash_sales_total" + "cash_movements_net"),
  ADD CONSTRAINT "cash_sessions_difference_check" CHECK ("difference" = "counted_cash" - "expected_cash"),
  -- R-14: toda diferencia lleva observación (el IS NOT NULL es necesario: un CHECK nulo no falla).
  ADD CONSTRAINT "cash_sessions_difference_note_check" CHECK (
    "status" <> 'CLOSED' OR "difference" = 0
    OR ("notes" IS NOT NULL AND length(btrim("notes")) >= 3)
  ),
  ADD CONSTRAINT "cash_sessions_close_request_hash_check" CHECK ("close_request_hash" ~ '^[0-9a-f]{64}$');

-- Una sesión nace abierta y sin datos de cierre; una abierta solo cambia para cerrarse (con sus
-- datos de apertura intactos y los cobros en efectivo RECALCULADOS); una cerrada no cambia nunca
-- (sin reapertura, R-16); ninguna se borra.
CREATE FUNCTION "cash_sessions_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  recalculated numeric(12, 2);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'OPEN' OR NEW.closed_by_id IS NOT NULL OR NEW.closed_at IS NOT NULL
       OR NEW.cash_sales_total IS NOT NULL OR NEW.cash_movements_net IS NOT NULL
       OR NEW.expected_cash IS NOT NULL OR NEW.counted_cash IS NOT NULL OR NEW.difference IS NOT NULL
       OR NEW.close_request_id IS NOT NULL OR NEW.close_request_hash IS NOT NULL THEN
      RAISE EXCEPTION 'cash_sessions: una sesión de caja se registra abierta y sin datos de cierre';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'cash_sessions: las sesiones de caja no se borran (DELETE no permitido)';
  END IF;
  IF OLD.status = 'CLOSED' THEN
    RAISE EXCEPTION 'cash_sessions: la sesión % está cerrada; no se modifica ni se reabre', OLD.number;
  END IF;
  IF NEW.status <> 'CLOSED' THEN
    RAISE EXCEPTION 'cash_sessions: una sesión abierta solo puede cambiar para cerrarse';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.number IS DISTINCT FROM OLD.number
     OR NEW.opened_by_id IS DISTINCT FROM OLD.opened_by_id
     OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
     OR NEW.opening_amount IS DISTINCT FROM OLD.opening_amount
     OR NEW.open_request_id IS DISTINCT FROM OLD.open_request_id THEN
    RAISE EXCEPTION 'cash_sessions: el cierre no puede cambiar los datos de apertura de la sesión %', OLD.number;
  END IF;
  SELECT COALESCE(sum(p.amount), 0) INTO recalculated
    FROM sale_payments p JOIN sales s ON s.id = p.sale_id
   WHERE s.cash_session_id = OLD.id AND p.method_is_cash;
  IF NEW.cash_sales_total IS DISTINCT FROM recalculated THEN
    RAISE EXCEPTION 'cash_sessions: los cobros en efectivo del cierre (%) no coinciden con las ventas de la sesión (%)',
      NEW.cash_sales_total, recalculated;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "cash_sessions_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "cash_sessions"
  FOR EACH ROW EXECUTE FUNCTION "cash_sessions_guard"();

-- 4. Ventas, líneas y pagos (inmutables) ----------------------------------------------------------
ALTER TABLE "sales"
  ADD CONSTRAINT "sales_total_check" CHECK ("total" > 0),
  ADD CONSTRAINT "sales_seller_name_check" CHECK (length(btrim("seller_name")) > 0),
  ADD CONSTRAINT "sales_request_hash_check" CHECK ("request_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_items_quantity_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "sale_items_unit_price_check" CHECK ("unit_price" > 0),
  ADD CONSTRAINT "sale_items_line_total_check" CHECK ("line_total" = "quantity" * "unit_price"),
  ADD CONSTRAINT "sale_items_unit_cost_snapshot_check" CHECK ("unit_cost_snapshot" >= 0);

ALTER TABLE "sale_payments"
  ADD CONSTRAINT "sale_payments_amount_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "sale_payments_cash_fields_check"
    CHECK ("method_is_cash" = ("tendered_amount" IS NOT NULL AND "change_given" IS NOT NULL)),
  ADD CONSTRAINT "sale_payments_change_check" CHECK (
    NOT "method_is_cash" OR ("change_given" >= 0 AND "tendered_amount" = "amount" + "change_given")
  ),
  ADD CONSTRAINT "sale_payments_reference_check" CHECK (NOT "method_is_cash" OR "reference" IS NULL);

-- Inmutabilidad: UPDATE y DELETE siempre fallan (prevent_append_only_change usa TG_TABLE_NAME).
CREATE TRIGGER "sales_immutable"
  BEFORE UPDATE OR DELETE ON "sales"
  FOR EACH ROW EXECUTE FUNCTION "prevent_append_only_change"();
CREATE TRIGGER "sale_items_immutable"
  BEFORE UPDATE OR DELETE ON "sale_items"
  FOR EACH ROW EXECUTE FUNCTION "prevent_append_only_change"();
CREATE TRIGGER "sale_payments_immutable"
  BEFORE UPDATE OR DELETE ON "sale_payments"
  FOR EACH ROW EXECUTE FUNCTION "prevent_append_only_change"();

-- Toda venta pertenece a una sesión ABIERTA (R-11). FOR SHARE: un cierre simultáneo (FOR UPDATE)
-- espera a que la venta confirme y la incluye en su arqueo.
CREATE FUNCTION "sales_require_open_session"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_status cash_session_status;
  v_opened timestamptz;
BEGIN
  SELECT status, opened_at INTO v_status, v_opened
    FROM cash_sessions WHERE id = NEW.cash_session_id FOR SHARE;
  IF NOT FOUND OR v_status <> 'OPEN' THEN
    RAISE EXCEPTION 'sales: no hay una sesión de caja abierta para registrar la venta';
  END IF;
  IF NEW.sold_at < v_opened THEN
    RAISE EXCEPTION 'sales: la venta no puede ser anterior a la apertura de su sesión de caja';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "sales_require_open_session"
  BEFORE INSERT ON "sales"
  FOR EACH ROW EXECUTE FUNCTION "sales_require_open_session"();

-- Al COMMIT: la venta tiene ≥ 1 línea y ≥ 1 pago y Σ líneas = total = Σ pagos. Cierra también el
-- hueco de insertar líneas o pagos en una venta ya confirmada (la suma dejaría de cuadrar).
CREATE FUNCTION "sales_assert_integrity"(p_sale_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_total numeric(12, 2);
  n_items integer;
  s_items numeric;
  n_payments integer;
  s_payments numeric;
BEGIN
  SELECT total INTO v_total FROM sales WHERE id = p_sale_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sales: la venta % no existe', p_sale_id;
  END IF;
  SELECT count(*), COALESCE(sum(line_total), 0) INTO n_items, s_items
    FROM sale_items WHERE sale_id = p_sale_id;
  SELECT count(*), COALESCE(sum(amount), 0) INTO n_payments, s_payments
    FROM sale_payments WHERE sale_id = p_sale_id;
  IF n_items = 0 THEN
    RAISE EXCEPTION 'sales: la venta % no tiene líneas', p_sale_id;
  END IF;
  IF n_payments = 0 THEN
    RAISE EXCEPTION 'sales: la venta % no tiene pagos', p_sale_id;
  END IF;
  IF s_items <> v_total THEN
    RAISE EXCEPTION 'sales: las líneas de la venta % suman % y el total es %', p_sale_id, s_items, v_total;
  END IF;
  IF s_payments <> v_total THEN
    RAISE EXCEPTION 'sales: los pagos de la venta % suman % y el total es %', p_sale_id, s_payments, v_total;
  END IF;
END $$;

CREATE FUNCTION "sales_integrity_check"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'sales' THEN
    PERFORM sales_assert_integrity(NEW.id);
  ELSE
    PERFORM sales_assert_integrity(NEW.sale_id);
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "sales_integrity_check"
  AFTER INSERT ON "sales" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "sales_integrity_check"();
CREATE CONSTRAINT TRIGGER "sale_items_integrity_check"
  AFTER INSERT ON "sale_items" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "sales_integrity_check"();
CREATE CONSTRAINT TRIGGER "sale_payments_integrity_check"
  AFTER INSERT ON "sale_payments" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "sales_integrity_check"();

-- Cada línea apunta a SU movimiento SALE del libro: misma variante, cantidad negada, documento
-- SALE de la misma venta y el mismo costo unitario.
CREATE FUNCTION "sale_items_movement_check"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  m inventory_movements%ROWTYPE;
BEGIN
  SELECT * INTO m FROM inventory_movements WHERE id = NEW.movement_id;
  IF NOT FOUND OR m.type <> 'SALE' OR m.variant_id <> NEW.variant_id
     OR m.quantity <> -NEW.quantity
     OR m.reference_type IS DISTINCT FROM 'SALE'
     OR m.reference_id IS DISTINCT FROM NEW.sale_id
     OR m.unit_cost IS DISTINCT FROM NEW.unit_cost_snapshot THEN
    RAISE EXCEPTION 'sale_items: la línea % no coincide con su movimiento SALE %', NEW.id, NEW.movement_id;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "sale_items_movement_check"
  AFTER INSERT ON "sale_items" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "sale_items_movement_check"();

-- 5. Impresiones del comprobante (append-only) ----------------------------------------------------
ALTER TABLE "sale_receipt_prints"
  ADD CONSTRAINT "sale_receipt_prints_copy_number_check" CHECK ("copy_number" >= 1),
  ADD CONSTRAINT "sale_receipt_prints_format_check" CHECK ("format" IN ('58mm', '80mm', 'A5', 'A4'));

CREATE TRIGGER "sale_receipt_prints_append_only"
  BEFORE UPDATE OR DELETE ON "sale_receipt_prints"
  FOR EACH ROW EXECUTE FUNCTION "prevent_append_only_change"();

-- 6. Correcciones de caja (append-only; documento 10 §5) ------------------------------------------
ALTER TABLE "cash_session_corrections"
  ADD CONSTRAINT "cash_session_corrections_sequence_check" CHECK ("sequence" >= 1),
  ADD CONSTRAINT "cash_session_corrections_kind_values_check" CHECK (
    ("kind" = 'NOTE') = ("previous_value" IS NULL AND "new_value" IS NULL)
    AND ("kind" = 'NOTE' OR ("previous_value" IS NOT NULL AND "new_value" IS NOT NULL))
  ),
  ADD CONSTRAINT "cash_session_corrections_new_value_check" CHECK ("new_value" >= 0),
  ADD CONSTRAINT "cash_session_corrections_change_check" CHECK ("new_value" <> "previous_value"),
  ADD CONSTRAINT "cash_session_corrections_counted_check" CHECK ("counted_cash_after" >= 0),
  ADD CONSTRAINT "cash_session_corrections_difference_check"
    CHECK ("difference_after" = "counted_cash_after" - "expected_cash_after"),
  ADD CONSTRAINT "cash_session_corrections_reason_check" CHECK (length(btrim("reason")) >= 10),
  ADD CONSTRAINT "cash_session_corrections_request_hash_check" CHECK ("request_hash" ~ '^[0-9a-f]{64}$');

CREATE TRIGGER "cash_session_corrections_append_only"
  BEFORE UPDATE OR DELETE ON "cash_session_corrections"
  FOR EACH ROW EXECUTE FUNCTION "prevent_append_only_change"();

-- Solo sobre sesiones CLOSED; el valor anterior es el vigente; las cifras «después» se recalculan
-- con los cobros CONGELADOS al cerrar (AE-4); la secuencia no tiene saltos.
CREATE FUNCTION "cash_session_corrections_validate"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  s cash_sessions%ROWTYPE;
  cur_opening numeric(12, 2);
  cur_counted numeric(12, 2);
  last_sequence integer;
  expected numeric(12, 2);
BEGIN
  SELECT * INTO s FROM cash_sessions WHERE id = NEW.cash_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cash_session_corrections: la sesión % no existe', NEW.cash_session_id;
  END IF;
  IF s.status <> 'CLOSED' THEN
    RAISE EXCEPTION 'cash_session_corrections: solo se corrigen sesiones cerradas (sesión %)', s.number;
  END IF;
  SELECT COALESCE(max(sequence), 0) INTO last_sequence
    FROM cash_session_corrections WHERE cash_session_id = s.id;
  IF NEW.sequence <> last_sequence + 1 THEN
    RAISE EXCEPTION 'cash_session_corrections: la secuencia debe ser % (llegó %)', last_sequence + 1, NEW.sequence;
  END IF;
  SELECT new_value INTO cur_opening FROM cash_session_corrections
   WHERE cash_session_id = s.id AND kind = 'OPENING_AMOUNT' ORDER BY sequence DESC LIMIT 1;
  cur_opening := COALESCE(cur_opening, s.opening_amount);
  SELECT new_value INTO cur_counted FROM cash_session_corrections
   WHERE cash_session_id = s.id AND kind = 'COUNTED_CASH' ORDER BY sequence DESC LIMIT 1;
  cur_counted := COALESCE(cur_counted, s.counted_cash);
  IF NEW.kind = 'OPENING_AMOUNT' THEN
    IF NEW.previous_value IS DISTINCT FROM cur_opening THEN
      RAISE EXCEPTION 'cash_session_corrections: el fondo vigente es %, no %', cur_opening, NEW.previous_value;
    END IF;
    cur_opening := NEW.new_value;
  ELSIF NEW.kind = 'COUNTED_CASH' THEN
    IF NEW.previous_value IS DISTINCT FROM cur_counted THEN
      RAISE EXCEPTION 'cash_session_corrections: el contado vigente es %, no %', cur_counted, NEW.previous_value;
    END IF;
    cur_counted := NEW.new_value;
  END IF;
  expected := cur_opening + s.cash_sales_total + s.cash_movements_net;
  IF NEW.expected_cash_after IS DISTINCT FROM expected
     OR NEW.counted_cash_after IS DISTINCT FROM cur_counted THEN
    RAISE EXCEPTION 'cash_session_corrections: cifras incoherentes (esperado %, contado %)', expected, cur_counted;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "cash_session_corrections_validate"
  BEFORE INSERT ON "cash_session_corrections"
  FOR EACH ROW EXECUTE FUNCTION "cash_session_corrections_validate"();

-- 7. Incidencias de venta (solo trazabilidad) -----------------------------------------------------
ALTER TABLE "sale_incidents"
  ADD CONSTRAINT "sale_incidents_description_check" CHECK (length(btrim("description")) >= 10),
  ADD CONSTRAINT "sale_incidents_resolution_check" CHECK (length(btrim("resolution")) >= 10),
  ADD CONSTRAINT "sale_incidents_closed_state_check" CHECK (
    ("status" = 'CLOSED') = (
      "resolution" IS NOT NULL AND "resolved_by_id" IS NOT NULL AND "resolved_at" IS NOT NULL
    )
  );

-- DELETE prohibido; UPDATE solo OPEN → CLOSED y solo cambian estado, resolución, quién y cuándo.
CREATE FUNCTION "sale_incidents_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  closing_fields text[] := ARRAY['status', 'resolution', 'resolved_by_id', 'resolved_at'];
BEGIN
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

CREATE TRIGGER "sale_incidents_guard"
  BEFORE UPDATE OR DELETE ON "sale_incidents"
  FOR EACH ROW EXECUTE FUNCTION "sale_incidents_guard"();

-- 8. Configuración del negocio (registro único) ---------------------------------------------------
ALTER TABLE "business_settings"
  ADD CONSTRAINT "business_settings_singleton_check" CHECK ("id" = 1),
  ADD CONSTRAINT "business_settings_trade_name_check" CHECK (length(btrim("trade_name")) >= 1);

-- D-07 (POR DEFECTO — PENDIENTE DE CONFIRMACIÓN): valores provisionales editables por el
-- Administrador. El seed no los sobrescribe.
INSERT INTO "business_settings" ("id", "trade_name", "address", "phone", "tax_id", "receipt_show_seller", "updated_at", "updated_by_id")
VALUES (1, 'Joyería Sole', NULL, NULL, NULL, false, now(), NULL)
ON CONFLICT DO NOTHING;
