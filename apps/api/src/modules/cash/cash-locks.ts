import { ERROR_CODES } from '@joyeria/shared';
import type { Prisma } from '../../generated/prisma/client.ts';
import { BusinessRuleError, NotFoundError } from '../../lib/errors.ts';

/**
 * Bloqueos de la caja (plan 11 §3.12). La sesión es el PRIMER recurso del orden global de bloqueos,
 * antes de las variantes y los saldos del libro (`modules/inventory/stock-locks.ts`):
 *
 *   1. fila de `cash_sessions`: la venta toma FOR SHARE sobre la sesión OPEN; el cierre y la
 *      corrección toman FOR UPDATE por id (y NUNCA bloquean variantes ni saldos);
 *   2. variantes por id; 3. saldos por id de variante (solo la venta).
 *
 * Ingresos, ajustes, conteos y cambios nunca bloquean la sesión: no hay ciclo posible.
 * Bloquear no es modificar: los triggers de inmutabilidad no se disparan.
 */

export interface OpenCashSessionLock {
  id: string;
  number: number;
}

/**
 * Bloquea en modo compartido la sesión ABIERTA (varias ventas a la vez; el cierre espera a que
 * terminen). Sin sesión abierta: 422 `CASH_SESSION_REQUIRED`. Lo usa el módulo de ventas, que NO
 * escribe tablas de caja.
 */
export async function lockOpenCashSession(
  tx: Prisma.TransactionClient,
): Promise<OpenCashSessionLock> {
  const [row] = await tx.$queryRaw<OpenCashSessionLock[]>`
    SELECT id::text AS id, number FROM cash_sessions WHERE status = 'OPEN' FOR SHARE`;
  if (!row) {
    throw new BusinessRuleError(
      'No hay una caja abierta: no se puede registrar la venta. Pida que abran la caja.',
      undefined,
      ERROR_CODES.CASH_SESSION_REQUIRED,
    );
  }
  return row;
}

export interface LockedCashSession {
  id: string;
  number: number;
  status: 'OPEN' | 'CLOSED';
  opening_amount: string;
}

/** Bloquea en modo exclusivo una sesión por id (cierre y correcciones). Inexistente: 404. */
export async function lockCashSessionForUpdate(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<LockedCashSession> {
  const [row] = await tx.$queryRaw<LockedCashSession[]>`
    SELECT id::text AS id, number, status::text AS status, opening_amount::text AS opening_amount
    FROM cash_sessions WHERE id = ${id}::uuid FOR UPDATE`;
  if (!row) throw new NotFoundError('Sesión de caja no encontrada');
  return row;
}
