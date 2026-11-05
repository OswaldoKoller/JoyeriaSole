-- P-08 (confirmada el 2026-11-05): no existe stock negativo.
-- Última línea de defensa en la base de datos: los servicios ya validan, pero si un bug intentara
-- dejar un saldo negativo, PostgreSQL lo rechaza y la transacción completa (movimiento + saldo +
-- auditoría) se revierte.
ALTER TABLE "inventory_balances"
  ADD CONSTRAINT "inventory_balances_quantity_check" CHECK ("quantity" >= 0);
