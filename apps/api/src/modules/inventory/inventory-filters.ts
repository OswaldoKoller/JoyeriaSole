import { dayRangeLaPaz, type MovementFilters } from '@joyeria/shared';
import { Prisma } from '../../generated/prisma/client.ts';

/** Saldo de una variante que aún no tiene fila en `inventory_balances` (= 0). */
export const STOCK_QUANTITY = Prisma.sql`COALESCE(b.quantity, 0)`;

/** Búsqueda por SKU, código de barras o nombre. SQL con plantilla etiquetada: nada se concatena. */
export function searchFilter(q: string) {
  if (!q) return Prisma.empty;
  const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  return Prisma.sql`AND (v.sku ILIKE ${like} OR v.barcode ILIKE ${like} OR p.name ILIKE ${like})`;
}

/** Nivel de stock: sin stock, bajo el mínimo o disponible. */
export function levelFilter(level: string) {
  if (level === 'OUT') return Prisma.sql`AND ${STOCK_QUANTITY} = 0`;
  if (level === 'LOW') return Prisma.sql`AND v.min_stock > 0 AND ${STOCK_QUANTITY} <= v.min_stock`;
  if (level === 'OK') {
    return Prisma.sql`AND ${STOCK_QUANTITY} > 0 AND NOT (v.min_stock > 0 AND ${STOCK_QUANTITY} <= v.min_stock)`;
  }
  return Prisma.empty;
}

/** Nivel de una variante a partir de su saldo y su mínimo (misma regla que `levelFilter`). */
export function stockLevel(quantity: number, minStock: number): 'OUT' | 'LOW' | 'OK' {
  if (quantity === 0) return 'OUT';
  return minStock > 0 && quantity <= minStock ? 'LOW' : 'OK';
}

/**
 * Filtros del historial global de movimientos (listado y CSV usan el mismo, así que exportan las
 * mismas filas). Las fechas son días de La Paz, ambos extremos incluidos.
 */
export function movementWhere(filters: MovementFilters): Prisma.InventoryMovementWhereInput {
  const createdAt = {
    ...(filters.from && { gte: dayRangeLaPaz(filters.from).start }),
    ...(filters.to && { lte: dayRangeLaPaz(filters.to).end }),
  };
  return {
    ...(Object.keys(createdAt).length > 0 && { createdAt }),
    ...(filters.type && { type: filters.type }),
    ...(filters.variantId && { variantId: filters.variantId }),
    ...(filters.productId && { variant: { productId: filters.productId } }),
  };
}
