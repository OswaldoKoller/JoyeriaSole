/**
 * Tipos de documento que originan un movimiento de inventario (`inventory_movements.reference_type`).
 * Fuente única: la API los escribe y la web puede enlazar el movimiento con su documento.
 */
export const REFERENCE_TYPES = {
  STOCK_ENTRY: 'STOCK_ENTRY',
  INVENTORY_ADJUSTMENT: 'INVENTORY_ADJUSTMENT',
  INVENTORY_COUNT: 'INVENTORY_COUNT',
  EXCHANGE: 'EXCHANGE',
  /** Venta de mostrador (movimientos `SALE`, plan 11 de fase-2-ventas). */
  SALE: 'SALE',
} as const;

export type ReferenceType = (typeof REFERENCE_TYPES)[keyof typeof REFERENCE_TYPES];
