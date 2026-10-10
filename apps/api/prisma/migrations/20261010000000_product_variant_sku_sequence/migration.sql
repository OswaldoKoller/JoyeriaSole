-- Correlativo interno de SKU. No se reutiliza al cancelar una transacción.
CREATE SEQUENCE product_variant_sku_seq AS bigint START WITH 1 INCREMENT BY 1 NO CYCLE;

-- Conservar correlativos si ya se registraron variantes manualmente en un entorno.
SELECT setval(
  'product_variant_sku_seq',
  COALESCE(MAX(substring(sku FROM '^SKU-([0-9]+)$')::bigint), 1),
  COUNT(substring(sku FROM '^SKU-([0-9]+)$')) > 0
)
FROM product_variants;
