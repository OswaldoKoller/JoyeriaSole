-- =============================================================================
-- Garantías de integridad del libro de inventario (D3, aprobadas por el responsable; implementación
-- autorizada el 2026-11-10). Ver docs/database/DATABASE.md, «Garantías de integridad del libro».
--
--   I-01  El saldo coincide con el libro: para cada variante, inventory_balances.quantity (0 si no hay
--         fila) = balance_after de su último movimiento (0 si no hay movimientos), y la cadena de
--         movimientos es continua (cada balance_before = balance_after del movimiento anterior de la
--         variante; el primero parte de 0). Con el CHECK existente balance_after = balance_before +
--         quantity, eso implica saldo = Σ movimientos. Triggers de restricción DIFERIDOS: se evalúan
--         al COMMIT, cuando el movimiento y el saldo ya están escritos en la misma transacción.
--   I-02  Un movimiento por (documento, variante, tipo): índice único parcial sobre
--         (reference_type, reference_id, variant_id, type) para los movimientos con documento.
--         Incluye `type` (corrección del informe técnico 04 §4.6) para que una futura anulación de
--         venta pueda usar el mismo documento que la venta original.
--
-- ANTES de crear las garantías se verifican los datos existentes. Si hay incoherencias la migración
-- ABORTA con un mensaje (no corrige nada en silencio): corregir con movimientos de ajuste trazables y
-- volver a ejecutar `prisma migrate deploy`. Al correr en una transacción, un aborto no deja nada a
-- medias.
--
-- El tercer punto de D3 (quitar TRUNCATE al usuario de la aplicación en producción) NO va aquí:
-- rompería resetDatabase de las pruebas. Ver prisma/privileges/revoke-app-truncate.sql y el CMD del
-- Dockerfile.
-- =============================================================================

-- 1. Verificación previa de los datos existentes -------------------------------------------------
DO $$
DECLARE
  bad_count integer;
  sample text;
BEGIN
  -- (a)+(b) Saldo distinto del último balance_after (incluye variantes con movimientos y sin fila
  -- de saldo, y filas de saldo con stock pero sin movimientos).
  SELECT count(*), string_agg(format('%s (saldo %s, libro %s)', variant_id, saldo, libro), '; ')
    INTO bad_count, sample
  FROM (
    SELECT v.variant_id, COALESCE(b.quantity, 0) AS saldo, COALESCE(l.balance_after, 0) AS libro
    FROM (SELECT variant_id FROM inventory_balances
          UNION SELECT variant_id FROM inventory_movements) v
    LEFT JOIN inventory_balances b ON b.variant_id = v.variant_id
    LEFT JOIN LATERAL (
      SELECT m.balance_after FROM inventory_movements m
      WHERE m.variant_id = v.variant_id ORDER BY m.id DESC LIMIT 1
    ) l ON true
    WHERE COALESCE(b.quantity, 0) <> COALESCE(l.balance_after, 0)
    ORDER BY v.variant_id
    LIMIT 20
  ) t;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'I-01: hay variantes cuyo saldo no coincide con el libro de movimientos (se muestran hasta 20): %', sample
      USING HINT = 'Ejecutar la consulta de reconciliación de docs/database/DATABASE.md, corregir con movimientos de ajuste trazables y volver a migrar.';
  END IF;

  -- (c) Cadena rota: balance_before distinto del balance_after del movimiento anterior (o de 0).
  SELECT count(*), string_agg(format('movimiento %s de %s', id, variant_id), '; ')
    INTO bad_count, sample
  FROM (
    SELECT id, variant_id FROM (
      SELECT id, variant_id, balance_before,
             lag(balance_after) OVER (PARTITION BY variant_id ORDER BY id) AS previo
      FROM inventory_movements
    ) c
    WHERE balance_before <> COALESCE(previo, 0)
    ORDER BY id
    LIMIT 20
  ) t;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'I-01: la cadena de saldos del libro está rota (se muestran hasta 20): %', sample
      USING HINT = 'Revisar esos movimientos con la consulta de reconciliación de docs/database/DATABASE.md antes de volver a migrar.';
  END IF;

  -- I-02: documentos con más de un movimiento de la misma variante y del mismo tipo.
  SELECT count(*), string_agg(format('%s %s, variante %s, %s (%s movimientos)',
                                     reference_type, reference_id, variant_id, type, n), '; ')
    INTO bad_count, sample
  FROM (
    SELECT reference_type, reference_id, variant_id, type, count(*) AS n
    FROM inventory_movements
    WHERE reference_id IS NOT NULL
    GROUP BY reference_type, reference_id, variant_id, type
    HAVING count(*) > 1
    ORDER BY reference_type, reference_id, variant_id
    LIMIT 20
  ) t;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'I-02: hay documentos con movimientos repetidos de una misma variante (se muestran hasta 20): %', sample
      USING HINT = 'Revisar esos documentos antes de volver a migrar; el libro es append-only y no se corrige borrando movimientos.';
  END IF;
END $$;

-- 2. I-01 · Saldo == libro ------------------------------------------------------------------------

-- Comprueba UNA variante con el estado vigente. El mensaje usa el código por defecto (P0001) para que
-- llegue intacto (ver la migración append_only_error_code).
CREATE FUNCTION inventory_assert_balance_matches_ledger(p_variant_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  saldo integer;
  libro integer;
BEGIN
  SELECT quantity INTO saldo FROM inventory_balances WHERE variant_id = p_variant_id;
  SELECT balance_after INTO libro FROM inventory_movements
   WHERE variant_id = p_variant_id ORDER BY id DESC LIMIT 1;
  IF COALESCE(saldo, 0) <> COALESCE(libro, 0) THEN
    RAISE EXCEPTION 'I-01: el saldo de la variante % (%) no coincide con el libro de movimientos (%)',
      p_variant_id, COALESCE(saldo, 0), COALESCE(libro, 0);
  END IF;
END $$;

-- Saldos: alta, cambio o borrado de una fila (el borrado solo es válido si el libro también da 0).
CREATE FUNCTION inventory_balances_match_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM inventory_assert_balance_matches_ledger(NEW.variant_id);
  END IF;
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.variant_id <> NEW.variant_id) THEN
    PERFORM inventory_assert_balance_matches_ledger(OLD.variant_id);
  END IF;
  RETURN NULL;
END $$;

-- Movimientos (solo INSERT: el libro es append-only): cadena continua y saldo actualizado.
CREATE FUNCTION inventory_movements_match_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  previo integer;
BEGIN
  SELECT balance_after INTO previo FROM inventory_movements
   WHERE variant_id = NEW.variant_id AND id < NEW.id ORDER BY id DESC LIMIT 1;
  IF NEW.balance_before <> COALESCE(previo, 0) THEN
    RAISE EXCEPTION 'I-01: el movimiento % de la variante % parte de % pero el libro estaba en %',
      NEW.id, NEW.variant_id, NEW.balance_before, COALESCE(previo, 0);
  END IF;
  PERFORM inventory_assert_balance_matches_ledger(NEW.variant_id);
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER inventory_balances_match_ledger
  AFTER INSERT OR UPDATE OR DELETE ON inventory_balances
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION inventory_balances_match_ledger();

CREATE CONSTRAINT TRIGGER inventory_movements_match_balance
  AFTER INSERT ON inventory_movements
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION inventory_movements_match_balance();

-- 3. I-02 · Un movimiento por (documento, variante, tipo) -----------------------------------------
-- Índice único parcial: Prisma no lo expresa en schema.prisma (igual que
-- product_photos_one_cover_per_product y price_changes_one_pending_per_variant_idx).
CREATE UNIQUE INDEX "inventory_movements_reference_variant_type_key"
  ON "inventory_movements" ("reference_type", "reference_id", "variant_id", "type")
  WHERE "reference_id" IS NOT NULL;
