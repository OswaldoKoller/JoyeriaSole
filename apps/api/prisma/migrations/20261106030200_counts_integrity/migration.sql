-- =============================================================================
-- Restricciones de integridad del conteo físico a ciegas (ADR-021). Última línea de defensa si un
-- servicio tuviera un bug. Va aparte de la migración que agrega el valor RECOUNT al enum, porque un
-- valor nuevo de un enum no se puede usar en la misma transacción que lo crea.
-- =============================================================================

ALTER TABLE "inventory_counts"
  -- Mientras se captura (primer conteo o recuento) siempre hay un único operador asignado.
  ADD CONSTRAINT "inventory_counts_operator_check" CHECK (
    "status" NOT IN ('IN_PROGRESS', 'RECOUNT') OR "operator_id" IS NOT NULL
  ),
  ADD CONSTRAINT "inventory_counts_approval_check" CHECK (
    ("status" = 'APPROVED') = ("approved_by_id" IS NOT NULL AND "approved_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "inventory_counts_cancelled_check" CHECK (
    ("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL)
  );

ALTER TABLE "inventory_count_items"
  ADD CONSTRAINT "inventory_count_items_quantities_check" CHECK (
    "system_qty" >= 0 AND "snapshot_cursor" >= 0
    AND ("counted_qty" IS NULL OR "counted_qty" >= 0)
    AND ("recount_qty" IS NULL OR "recount_qty" >= 0)
  ),
  -- Solo se recuentan las variantes marcadas al cerrar el primer conteo.
  ADD CONSTRAINT "inventory_count_items_recount_check" CHECK (
    "recount_qty" IS NULL OR "needs_recount"
  ),
  -- Resultado de la aprobación: o ninguno o todos los datos, y deben cuadrar con el libro.
  ADD CONSTRAINT "inventory_count_items_result_check" CHECK (
    ("expected_qty" IS NULL AND "final_qty" IS NULL AND "reconciled_movements" IS NULL
      AND "difference" IS NULL AND "balance_before" IS NULL AND "balance_after" IS NULL
      AND "movement_id" IS NULL)
    OR ("expected_qty" IS NOT NULL AND "final_qty" IS NOT NULL AND "reconciled_movements" IS NOT NULL
      AND "difference" IS NOT NULL AND "balance_before" IS NOT NULL AND "balance_after" IS NOT NULL
      AND "difference" = "final_qty" - "expected_qty"
      AND "balance_after" = "balance_before" + "difference"
      AND "balance_after" >= 0
      AND ("movement_id" IS NOT NULL) = ("difference" <> 0))
  ),
  ADD CONSTRAINT "inventory_count_items_unit_cost_check" CHECK ("unit_cost" IS NULL OR "unit_cost" >= 0);

ALTER TABLE "inventory_count_scans"
  ADD CONSTRAINT "inventory_count_scans_round_check" CHECK ("round" IN (1, 2)),
  ADD CONSTRAINT "inventory_count_scans_delta_check" CHECK ("delta" <> 0 AND "quantity_after" >= 0),
  -- Cada lectura es de una variante del conteo o de un hallazgo, nunca de ambos ni de ninguno.
  ADD CONSTRAINT "inventory_count_scans_target_check" CHECK (
    ("variant_id" IS NOT NULL) <> ("finding_id" IS NOT NULL)
  );

ALTER TABLE "inventory_count_findings"
  ADD CONSTRAINT "inventory_count_findings_round_check" CHECK ("round" IN (1, 2)),
  ADD CONSTRAINT "inventory_count_findings_quantity_check" CHECK ("quantity" >= 0),
  ADD CONSTRAINT "inventory_count_findings_type_check" CHECK (
    ("type" = 'OUT_OF_SCOPE') = ("variant_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "inventory_count_findings_regularized_check" CHECK (
    ("regularized_at" IS NULL) = ("regularized_by_id" IS NULL)
    AND ("regularized_at" IS NULL OR length(btrim(coalesce("regularization_note", ''))) > 0)
  );

-- =============================================================================
-- Un conteo aprobado o cancelado es historia: no se modifica ni se borra. Los conteos tampoco se
-- eliminan nunca (se cancelan).
-- =============================================================================
CREATE OR REPLACE FUNCTION "prevent_closed_count_change"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los conteos de inventario no se eliminan: use la cancelación';
  END IF;
  IF OLD."status" IN ('APPROVED', 'CANCELLED') THEN
    RAISE EXCEPTION 'El conteo ya terminó (%) y no se puede modificar', OLD."status";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "inventory_counts_immutable"
  BEFORE UPDATE OR DELETE ON "inventory_counts"
  FOR EACH ROW EXECUTE FUNCTION "prevent_closed_count_change"();

CREATE OR REPLACE FUNCTION "prevent_closed_count_item_change"() RETURNS trigger AS $$
DECLARE
  parent_status "inventory_count_status";
BEGIN
  SELECT "status" INTO parent_status FROM "inventory_counts" WHERE "id" = OLD."inventory_count_id";
  IF parent_status IN ('APPROVED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Las líneas de un conteo terminado no se pueden modificar ni eliminar';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "inventory_count_items_immutable"
  BEFORE UPDATE OR DELETE ON "inventory_count_items"
  FOR EACH ROW EXECUTE FUNCTION "prevent_closed_count_item_change"();

-- =============================================================================
-- El registro de lecturas es trazabilidad: no se borra; lo único que cambia es `undone_at` (al
-- deshacer una lectura, una sola vez).
-- =============================================================================
CREATE OR REPLACE FUNCTION "prevent_count_scan_change"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las lecturas de un conteo no se eliminan: use deshacer';
  END IF;
  IF OLD."undone_at" IS NOT NULL
     OR NEW."undone_at" IS NULL
     OR NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."inventory_count_id" IS DISTINCT FROM OLD."inventory_count_id"
     OR NEW."round" IS DISTINCT FROM OLD."round"
     OR NEW."variant_id" IS DISTINCT FROM OLD."variant_id"
     OR NEW."finding_id" IS DISTINCT FROM OLD."finding_id"
     OR NEW."code" IS DISTINCT FROM OLD."code"
     OR NEW."source" IS DISTINCT FROM OLD."source"
     OR NEW."delta" IS DISTINCT FROM OLD."delta"
     OR NEW."quantity_after" IS DISTINCT FROM OLD."quantity_after"
     OR NEW."movement_cursor" IS DISTINCT FROM OLD."movement_cursor"
     OR NEW."user_id" IS DISTINCT FROM OLD."user_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Una lectura de conteo solo puede marcarse como deshecha, una vez';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "inventory_count_scans_immutable"
  BEFORE UPDATE OR DELETE ON "inventory_count_scans"
  FOR EACH ROW EXECUTE FUNCTION "prevent_count_scan_change"();
