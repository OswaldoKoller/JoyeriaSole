-- Búsqueda unificada por código del proveedor (Q-10): el lector consulta supplier_code.
-- CreateIndex
CREATE INDEX "supplier_products_supplier_code_idx" ON "supplier_products"("supplier_code");
