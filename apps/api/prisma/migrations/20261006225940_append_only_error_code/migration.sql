-- Los triggers append-only usaban ERRCODE 'restrict_violation' (23001), que Prisma traduce como
-- "Foreign key constraint violated" ocultando el mensaje real. Se usa el código por defecto de
-- RAISE EXCEPTION (P0001) para que el error llegue con su mensaje descriptivo.

CREATE OR REPLACE FUNCTION "prevent_append_only_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo inserción (append-only): % no permitido', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "prevent_audit_log_change"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW."user_id" IS NULL
     AND (to_jsonb(NEW) - 'user_id') = (to_jsonb(OLD) - 'user_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'La tabla audit_logs es de solo inserción (append-only): % no permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;
