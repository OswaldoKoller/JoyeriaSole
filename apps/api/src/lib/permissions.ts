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
