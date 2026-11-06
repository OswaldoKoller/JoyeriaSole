-- =============================================================================
-- Índices de rendimiento (auditoría de BD, 2026-11-06). SOLO índices: no agrega restricciones ni
-- cambia el comportamiento; las garantías de integridad nuevas (I-01..I-06) van en otra migración
-- y requieren aprobación. Ver docs/database/DATABASE.md ("Índices de rendimiento").
--
-- Notas:
--   * Prisma ejecuta cada migración en una transacción, así que no puede usarse CREATE INDEX
--     CONCURRENTLY: cada CREATE INDEX bloquea las escrituras de su tabla mientras se construye.
--     Con el volumen de una pyme son milisegundos. Si una tabla ya fuera grande, pueden crearse a
--     mano antes con CONCURRENTLY (mismos nombres): por eso cada CREATE INDEX lleva IF NOT EXISTS.
--   * pg_trgm es una extensión "de confianza" (PostgreSQL >= 13): la crea el dueño de la base de
--     datos sin ser superusuario. Ver docs/deployment/DEPLOYMENT.md.
-- =============================================================================

-- Búsqueda de texto con ILIKE '%q%' (Prisma `contains` + `mode: insensitive`): sin trigramas cada
-- consulta recorre toda la tabla. Los índices GIN sirven para ILIKE y LIKE con comodines a ambos
-- lados cuando el término tiene 3 o más caracteres (con menos, PostgreSQL recorre la tabla).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "products_name_trgm_idx"
  ON "products" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "product_variants_sku_trgm_idx"
  ON "product_variants" USING GIN ("sku" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "product_variants_barcode_trgm_idx"
  ON "product_variants" USING GIN ("barcode" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "product_variants_label_trgm_idx"
  ON "product_variants" USING GIN ("label" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "supplier_products_supplier_code_trgm_idx"
  ON "supplier_products" USING GIN ("supplier_code" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "stock_entries_document_number_trgm_idx"
  ON "stock_entries" USING GIN ("document_number" gin_trgm_ops);

-- Libro de movimientos: kardex global paginado (ORDER BY created_at DESC, id DESC).
CREATE INDEX IF NOT EXISTS "inventory_movements_created_at_id_idx"
  ON "inventory_movements" ("created_at" DESC, "id" DESC);

-- Historial/conciliación por variante (el cursor de conteo es el id del movimiento).
-- Sin INCLUDE (quantity): Prisma no expresa INCLUDE y `prisma migrate diff` lo vería como deriva,
-- de modo que el siguiente `migrate dev` intentaría recrear el índice sin la cláusula. Variante de
-- cobertura propuesta en docs/database/DATABASE.md.
CREATE INDEX IF NOT EXISTS "inventory_movements_variant_id_id_idx"
  ON "inventory_movements" ("variant_id", "id" DESC);

-- Auditoría: listado global ordenado por fecha e id. Cubre también las lecturas por created_at
-- (recorrido inverso), por lo que el índice solo por created_at queda redundante.
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_id_idx"
  ON "audit_logs" ("created_at" DESC, "id" DESC);
DROP INDEX IF EXISTS "audit_logs_created_at_idx";

-- Historial de precios global.
CREATE INDEX IF NOT EXISTS "price_changes_created_at_id_idx"
  ON "price_changes" ("created_at" DESC, "id" DESC);

-- Conteo físico: deshacer la última lectura vigente de una variante en la ronda.
CREATE INDEX IF NOT EXISTS "inventory_count_scans_count_variant_round_id_idx"
  ON "inventory_count_scans" ("inventory_count_id", "variant_id", "round", "id");
