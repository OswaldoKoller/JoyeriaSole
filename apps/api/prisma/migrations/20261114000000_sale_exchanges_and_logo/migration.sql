-- Cambio de pieza de una venta (ADR-026), logo del negocio y leyenda del comprobante.
-- DDL generado por prisma migrate diff + garantías escritas a mano (sección final).

-- AlterTable
ALTER TABLE "business_settings" ADD COLUMN     "receipt_footer_note" VARCHAR(300);

-- CreateTable
CREATE TABLE "business_logo" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "content_type" VARCHAR(50) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "bytes" BYTEA NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID NOT NULL,

    CONSTRAINT "business_logo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_exchanges" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "sale_id" UUID NOT NULL,
    "cash_session_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "seller_name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "source_item_id" UUID,
    "source_exchange_id" UUID,
    "returned_variant_id" UUID NOT NULL,
    "returned_sku" VARCHAR(64) NOT NULL,
    "returned_product_name" VARCHAR(200) NOT NULL,
    "returned_variant_label" VARCHAR(200),
    "delivered_variant_id" UUID NOT NULL,
    "delivered_sku" VARCHAR(64) NOT NULL,
    "delivered_product_name" VARCHAR(200) NOT NULL,
    "delivered_variant_label" VARCHAR(200),
    "quantity" INTEGER NOT NULL,
    "credit_unit_price" DECIMAL(12,2) NOT NULL,
    "delivered_unit_price" DECIMAL(12,2) NOT NULL,
    "difference" DECIMAL(12,2) NOT NULL,
    "note" VARCHAR(300),
    "returned_movement_id" BIGINT NOT NULL,
    "delivered_movement_id" BIGINT NOT NULL,
    "client_request_id" UUID NOT NULL,
    "request_hash" CHAR(64) NOT NULL,

    CONSTRAINT "sale_exchanges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_exchange_payments" (
    "id" UUID NOT NULL,
    "exchange_id" UUID NOT NULL,
    "method_id" UUID NOT NULL,
    "method_is_cash" BOOLEAN NOT NULL,
    "method_name" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "tendered_amount" DECIMAL(12,2),
    "change_given" DECIMAL(12,2),
    "reference" VARCHAR(100),

    CONSTRAINT "sale_exchange_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_logo_updated_by_id_idx" ON "business_logo"("updated_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_exchanges_number_key" ON "sale_exchanges"("number");

-- CreateIndex
CREATE UNIQUE INDEX "sale_exchanges_returned_movement_id_key" ON "sale_exchanges"("returned_movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_exchanges_delivered_movement_id_key" ON "sale_exchanges"("delivered_movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_exchanges_client_request_id_key" ON "sale_exchanges"("client_request_id");

-- CreateIndex
CREATE INDEX "sale_exchanges_sale_id_idx" ON "sale_exchanges"("sale_id");

-- CreateIndex
CREATE INDEX "sale_exchanges_created_at_id_idx" ON "sale_exchanges"("created_at", "id");

-- CreateIndex
CREATE INDEX "sale_exchanges_seller_id_created_at_idx" ON "sale_exchanges"("seller_id", "created_at");

-- CreateIndex
CREATE INDEX "sale_exchanges_cash_session_id_idx" ON "sale_exchanges"("cash_session_id");

-- CreateIndex
CREATE INDEX "sale_exchanges_source_item_id_idx" ON "sale_exchanges"("source_item_id");

-- CreateIndex
CREATE INDEX "sale_exchanges_source_exchange_id_idx" ON "sale_exchanges"("source_exchange_id");

-- CreateIndex
CREATE INDEX "sale_exchanges_returned_variant_id_idx" ON "sale_exchanges"("returned_variant_id");

-- CreateIndex
CREATE INDEX "sale_exchanges_delivered_variant_id_idx" ON "sale_exchanges"("delivered_variant_id");

-- CreateIndex
CREATE INDEX "sale_exchange_payments_exchange_id_idx" ON "sale_exchange_payments"("exchange_id");

-- CreateIndex
CREATE INDEX "sale_exchange_payments_method_id_idx" ON "sale_exchange_payments"("method_id");

-- AddForeignKey
ALTER TABLE "business_logo" ADD CONSTRAINT "business_logo_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_exchanges" ADD CONSTRAINT "sale_exchanges_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_exchanges" ADD CONSTRAINT "sale_exchanges_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_exchanges" ADD CONSTRAINT "sale_exchanges_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_exchanges" ADD CONSTRAINT "sale_exchanges_source_item_id_fkey" FOREIGN KEY ("source_item_id") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_exchanges" ADD CONSTRAINT "sale_exchanges_source_exchange_id_fkey" FOREIGN KEY ("source_exchange_id") REFERENCES "sale_exchanges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_exchanges" ADD CONSTRAINT "sale_exchanges_returned_variant_id_fkey" FOREIGN KEY ("returned_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_exchanges" ADD CONSTRAINT "sale_exchanges_delivered_variant_id_fkey" FOREIGN KEY ("delivered_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_exchanges" ADD CONSTRAINT "sale_exchanges_returned_movement_id_fkey" FOREIGN KEY ("returned_movement_id") REFERENCES "inventory_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_exchanges" ADD CONSTRAINT "sale_exchanges_delivered_movement_id_fkey" FOREIGN KEY ("delivered_movement_id") REFERENCES "inventory_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_exchange_payments" ADD CONSTRAINT "sale_exchange_payments_exchange_id_fkey" FOREIGN KEY ("exchange_id") REFERENCES "sale_exchanges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_exchange_payments" ADD CONSTRAINT "sale_exchange_payments_method_id_method_is_cash_fkey" FOREIGN KEY ("method_id", "method_is_cash") REFERENCES "payment_methods"("id", "is_cash") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =============================================================================
-- Garantías de base de datos (ADR-026). Todo lo de abajo se escribió a mano sobre el DDL generado.
-- No edita ninguna migración anterior: reemplaza `cash_sessions_guard` con CREATE OR REPLACE.
-- =============================================================================

-- 1. Logo del negocio ----------------------------------------------------------------------------
ALTER TABLE "business_logo"
  ADD CONSTRAINT "business_logo_singleton_check" CHECK ("id" = 1),
  ADD CONSTRAINT "business_logo_content_type_check" CHECK ("content_type" = 'image/webp'),
  ADD CONSTRAINT "business_logo_size_check" CHECK (
    "width" > 0 AND "height" > 0 AND "size_bytes" > 0 AND octet_length("bytes") = "size_bytes"
  ),
  ADD CONSTRAINT "business_logo_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$');

-- 2. Leyenda al pie del comprobante --------------------------------------------------------------
ALTER TABLE "business_settings"
  ADD CONSTRAINT "business_settings_footer_note_check"
    CHECK ("receipt_footer_note" IS NULL OR length(btrim("receipt_footer_note")) >= 1);

-- Política de la tienda (asesor legal, 2026-11-14): sin devoluciones, solo cambio de pieza. El
-- Administrador puede editar o quitar el texto en «Datos del negocio».
UPDATE "business_settings"
   SET "receipt_footer_note" = 'No se aceptan devoluciones. Solo se realizan cambios de pieza presentando este comprobante.'
 WHERE "receipt_footer_note" IS NULL;

-- 3. Cambios de pieza: restricciones de fila ------------------------------------------------------
ALTER TABLE "sale_exchanges"
  ADD CONSTRAINT "sale_exchanges_source_check"
    CHECK (("source_item_id" IS NOT NULL) <> ("source_exchange_id" IS NOT NULL)),
  ADD CONSTRAINT "sale_exchanges_quantity_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "sale_exchanges_distinct_variants_check"
    CHECK ("returned_variant_id" <> "delivered_variant_id"),
  ADD CONSTRAINT "sale_exchanges_credit_price_check" CHECK ("credit_unit_price" > 0),
  -- Regla de negocio (2026-11-14): NUNCA se cambia por una pieza más económica.
  ADD CONSTRAINT "sale_exchanges_not_cheaper_check"
    CHECK ("delivered_unit_price" >= "credit_unit_price"),
  ADD CONSTRAINT "sale_exchanges_difference_check"
    CHECK ("difference" = "quantity" * ("delivered_unit_price" - "credit_unit_price")),
  ADD CONSTRAINT "sale_exchanges_seller_name_check" CHECK (length(btrim("seller_name")) > 0),
  ADD CONSTRAINT "sale_exchanges_note_check" CHECK ("note" IS NULL OR length(btrim("note")) > 0),
  ADD CONSTRAINT "sale_exchanges_request_hash_check" CHECK ("request_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "sale_exchange_payments"
  ADD CONSTRAINT "sale_exchange_payments_amount_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "sale_exchange_payments_cash_fields_check" CHECK (
    "method_is_cash" = ("tendered_amount" IS NOT NULL)
    AND "method_is_cash" = ("change_given" IS NOT NULL)
  ),
  ADD CONSTRAINT "sale_exchange_payments_change_check" CHECK (
    NOT "method_is_cash" OR ("change_given" >= 0 AND "tendered_amount" = "amount" + "change_given")
  ),
  ADD CONSTRAINT "sale_exchange_payments_reference_check"
    CHECK (NOT "method_is_cash" OR "reference" IS NULL);

-- 4. Inmutabilidad: un cambio registrado no se edita ni se borra ---------------------------------
CREATE TRIGGER "sale_exchanges_immutable"
  BEFORE UPDATE OR DELETE ON "sale_exchanges"
  FOR EACH ROW EXECUTE FUNCTION "prevent_append_only_change"();
CREATE TRIGGER "sale_exchange_payments_immutable"
  BEFORE UPDATE OR DELETE ON "sale_exchange_payments"
  FOR EACH ROW EXECUTE FUNCTION "prevent_append_only_change"();

-- 5. Todo cambio pertenece a una sesión de caja ABIERTA (la diferencia se cobra en esa caja) -------
-- FOR SHARE: un cierre simultáneo (FOR UPDATE) espera a que el cambio confirme y lo incluye en su
-- arqueo, igual que con las ventas.
CREATE FUNCTION "sale_exchanges_require_open_session"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_status cash_session_status;
  v_opened timestamptz;
BEGIN
  SELECT status, opened_at INTO v_status, v_opened
    FROM cash_sessions WHERE id = NEW.cash_session_id FOR SHARE;
  IF NOT FOUND OR v_status <> 'OPEN' THEN
    RAISE EXCEPTION 'sale_exchanges: no hay una sesión de caja abierta para registrar el cambio';
  END IF;
  IF NEW.created_at < v_opened THEN
    RAISE EXCEPTION 'sale_exchanges: el cambio no puede ser anterior a la apertura de su sesión de caja';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "sale_exchanges_require_open_session"
  BEFORE INSERT ON "sale_exchanges"
  FOR EACH ROW EXECUTE FUNCTION "sale_exchanges_require_open_session"();

-- 6. Integridad al COMMIT (sin descuadre de inventario ni de caja) --------------------------------
--   a) Σ pagos = diferencia a cobrar (0 si no hay diferencia).
--   b) La pieza devuelta sale de la MISMA venta, es esa variante y se pagó a ese precio; no se
--      cambian más unidades que las disponibles (de la línea de venta o del cambio anterior).
--   c) Cada lado del cambio apunta a SU movimiento del libro: variante, cantidad con el signo
--      correcto, tipo EXCHANGE_IN / EXCHANGE_OUT y documento EXCHANGE de este cambio.
CREATE FUNCTION "sale_exchanges_assert_integrity"(p_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  e sale_exchanges%ROWTYPE;
  m_in inventory_movements%ROWTYPE;
  m_out inventory_movements%ROWTYPE;
  n_pay integer;
  s_pay numeric;
  src_sale uuid;
  src_variant uuid;
  src_price numeric;
  src_qty integer;
  used integer;
BEGIN
  SELECT * INTO e FROM sale_exchanges WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sale_exchanges: el cambio % no existe', p_id;
  END IF;

  SELECT count(*), COALESCE(sum(amount), 0) INTO n_pay, s_pay
    FROM sale_exchange_payments WHERE exchange_id = p_id;
  IF s_pay <> e.difference THEN
    RAISE EXCEPTION 'sale_exchanges: los pagos del cambio % suman % y la diferencia es %', p_id, s_pay, e.difference;
  END IF;

  IF e.source_item_id IS NOT NULL THEN
    SELECT sale_id, variant_id, unit_price, quantity INTO src_sale, src_variant, src_price, src_qty
      FROM sale_items WHERE id = e.source_item_id;
    SELECT COALESCE(sum(quantity), 0) INTO used FROM sale_exchanges WHERE source_item_id = e.source_item_id;
  ELSE
    SELECT sale_id, delivered_variant_id, delivered_unit_price, quantity INTO src_sale, src_variant, src_price, src_qty
      FROM sale_exchanges WHERE id = e.source_exchange_id;
    SELECT COALESCE(sum(quantity), 0) INTO used FROM sale_exchanges WHERE source_exchange_id = e.source_exchange_id;
  END IF;
  IF src_sale IS DISTINCT FROM e.sale_id
     OR src_variant IS DISTINCT FROM e.returned_variant_id
     OR src_price IS DISTINCT FROM e.credit_unit_price THEN
    RAISE EXCEPTION 'sale_exchanges: la pieza devuelta del cambio % no coincide con su origen', p_id;
  END IF;
  IF used > src_qty THEN
    RAISE EXCEPTION 'sale_exchanges: se cambian % unidades y solo hay % disponibles (cambio %)', used, src_qty, p_id;
  END IF;

  SELECT * INTO m_in FROM inventory_movements WHERE id = e.returned_movement_id;
  IF NOT FOUND OR m_in.type <> 'EXCHANGE_IN' OR m_in.variant_id <> e.returned_variant_id
     OR m_in.quantity <> e.quantity
     OR m_in.reference_type IS DISTINCT FROM 'EXCHANGE' OR m_in.reference_id IS DISTINCT FROM e.id THEN
    RAISE EXCEPTION 'sale_exchanges: la entrada del cambio % no coincide con su movimiento', p_id;
  END IF;
  SELECT * INTO m_out FROM inventory_movements WHERE id = e.delivered_movement_id;
  IF NOT FOUND OR m_out.type <> 'EXCHANGE_OUT' OR m_out.variant_id <> e.delivered_variant_id
     OR m_out.quantity <> -e.quantity
     OR m_out.reference_type IS DISTINCT FROM 'EXCHANGE' OR m_out.reference_id IS DISTINCT FROM e.id THEN
    RAISE EXCEPTION 'sale_exchanges: la salida del cambio % no coincide con su movimiento', p_id;
  END IF;
END $$;

CREATE FUNCTION "sale_exchanges_integrity_check"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'sale_exchanges' THEN
    PERFORM sale_exchanges_assert_integrity(NEW.id);
  ELSE
    PERFORM sale_exchanges_assert_integrity(NEW.exchange_id);
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "sale_exchanges_integrity_check"
  AFTER INSERT ON "sale_exchanges" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "sale_exchanges_integrity_check"();
CREATE CONSTRAINT TRIGGER "sale_exchange_payments_integrity_check"
  AFTER INSERT ON "sale_exchange_payments" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "sale_exchanges_integrity_check"();

-- 7. El arqueo incluye los cobros en efectivo de los cambios --------------------------------------
-- Mismo cuerpo que en 20261111000000_sales_and_cash; cambia solo el recálculo: efectivo de las
-- ventas de la sesión + efectivo de la diferencia de los cambios registrados en la sesión.
CREATE OR REPLACE FUNCTION "cash_sessions_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
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
  SELECT COALESCE((
           SELECT sum(p.amount)
             FROM sale_payments p JOIN sales s ON s.id = p.sale_id
            WHERE s.cash_session_id = OLD.id AND p.method_is_cash
         ), 0)
       + COALESCE((
           SELECT sum(p.amount)
             FROM sale_exchange_payments p JOIN sale_exchanges x ON x.id = p.exchange_id
            WHERE x.cash_session_id = OLD.id AND p.method_is_cash
         ), 0)
    INTO recalculated;
  IF NEW.cash_sales_total IS DISTINCT FROM recalculated THEN
    RAISE EXCEPTION 'cash_sessions: los cobros en efectivo del cierre (%) no coinciden con las ventas y cambios de la sesión (%)',
      NEW.cash_sales_total, recalculated;
  END IF;
  RETURN NEW;
END $$;
