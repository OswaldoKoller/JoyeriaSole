import { PERMISSIONS } from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import { getAuth } from '../plugins/auth.ts';

/** Costos y valorizaciones: solo con `costs:read` (el Vendedor nunca los recibe). */
export function canSeeCostsWith(permissions: readonly string[]): boolean {
  return permissions.includes(PERMISSIONS.COSTS_READ);
}

/** Único punto que decide si la persona de la petición puede ver costos. */
export function canSeeCosts(request: FastifyRequest): boolean {
  return canSeeCostsWith(getAuth(request).user.permissions);
}

/**
 * Autor visible de un movimiento de inventario (M-1, sigue a D-02). Quien no tiene `sales:read-all`
 * solo ve sus propias ventas: en los movimientos `SALE` de otro vendedor el autor se oculta (`null`)
 * para que el kardex no permita reconstruir ventas ajenas. El movimiento y los saldos siguen visibles
 * (el libro debe cuadrar). Los demás tipos de movimiento no cambian.
 */
export function movementAuthorFor(request: FastifyRequest) {
  const { user } = getAuth(request);
  const readAllSales = user.permissions.includes(PERMISSIONS.SALES_READ_ALL);
  return (movement: { type: string; userId: string }): string | null =>
    movement.type === 'SALE' && !readAllSales && movement.userId !== user.id
      ? null
      : movement.userId;
}

/**
 * Las notas de los movimientos de inventario (observaciones libres, a veces con costos o
 * faltantes) solo se muestran a quien administra stock o audita; el resto recibe `null` (S-03).
 */
export function canSeeMovementNotes(request: FastifyRequest): boolean {
  const { permissions } = getAuth(request).user;
  return (
    permissions.includes(PERMISSIONS.INVENTORY_ADJUST) ||
    permissions.includes(PERMISSIONS.STOCK_ENTRIES_READ) ||
    permissions.includes(PERMISSIONS.AUDIT_READ)
  );
}
