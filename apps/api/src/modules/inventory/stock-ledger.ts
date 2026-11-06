import type { MovementType, Prisma } from '../../generated/prisma/client.ts';
import { BusinessRuleError } from '../../lib/errors.ts';

/**
 * Operación genérica «aplicar movimientos de stock» (ADR-007).
 *
 * Es la forma de cambiar el saldo de una variante: bloquea la variante y su saldo, valida que el
 * resultado no sea negativo, inserta el movimiento en el libro (append-only) y actualiza
 * `inventory_balances`, todo en la transacción del llamador. Quien la use debe grabar su propia
 * auditoría en esa misma transacción (`recordAudit(tx, ...)`).
 */

/** Límite de la columna entera de saldos. */
export const MAX_BALANCE = 2_147_483_647;

export type BalancePlan =
  { ok: true; after: number } | { ok: false; reason: 'INVALID_DELTA' | 'NEGATIVE' | 'OVERFLOW' };

/** Lógica pura: resultado de aplicar `delta` (con signo) a un saldo, sin stock negativo. */
export function planBalanceChange(before: number, delta: number): BalancePlan {
  if (!Number.isInteger(before) || !Number.isInteger(delta) || delta === 0) {
    return { ok: false, reason: 'INVALID_DELTA' };
  }
  const after = before + delta;
  if (after < 0) return { ok: false, reason: 'NEGATIVE' };
  if (after > MAX_BALANCE) return { ok: false, reason: 'OVERFLOW' };
  return { ok: true, after };
}

export interface StockChange {
  variantId: string;
  type: MovementType;
  /** Con signo: positivo = entrada, negativo = salida. Nunca 0. */
  quantity: number;
  userId: string;
  reason?: string | null;
  notes?: string | null;
  /** Costo unitario al momento del movimiento (4 decimales, como texto). */
  unitCost?: string | null;
  referenceType?: string;
  referenceId?: string;
  /** Texto que identifica la variante en los mensajes de error (p. ej. su SKU). */
  label?: string;
}

export interface AppliedStockChange {
  variantId: string;
  movementId: bigint;
  balanceBefore: number;
  balanceAfter: number;
}

/**
 * Aplica varios cambios de stock de forma atómica. Los bloqueos se toman en orden de variante
 * (primero la variante, luego su saldo), el mismo orden que usan los ingresos y el stock inicial,
 * para que operaciones simultáneas sobre las mismas variantes se serialicen sin interbloqueos.
 * Si un solo cambio no es válido (p. ej. dejaría el saldo negativo) se lanza un error y el
 * llamador debe dejar que su transacción se revierta completa.
 *
 * Devuelve los resultados en el mismo orden de `changes`.
 */
export async function applyStockChanges(
  tx: Prisma.TransactionClient,
  changes: readonly StockChange[],
): Promise<AppliedStockChange[]> {
  const order = changes
    .map((change, index) => ({ change, index }))
    .sort((a, b) =>
      a.change.variantId === b.change.variantId
        ? a.index - b.index
        : a.change.variantId < b.change.variantId
          ? -1
          : 1,
    );

  const lockedVariants = new Set<string>();
  for (const { change } of order) {
    if (lockedVariants.has(change.variantId)) continue;
    lockedVariants.add(change.variantId);
    await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${change.variantId}::uuid FOR UPDATE`;
  }

  const results = new Array<AppliedStockChange>(changes.length);
  for (const { change, index } of order) {
    await tx.$executeRaw`
      INSERT INTO inventory_balances (variant_id, quantity, updated_at)
      VALUES (${change.variantId}::uuid, 0, now()) ON CONFLICT (variant_id) DO NOTHING`;
    const [balance] = await tx.$queryRaw<{ quantity: number }[]>`
      SELECT quantity FROM inventory_balances WHERE variant_id = ${change.variantId}::uuid FOR UPDATE`;
    if (!balance) throw new BusinessRuleError('No se pudo leer el saldo de una variante.');

    const plan = planBalanceChange(balance.quantity, change.quantity);
    const name = change.label ?? 'la variante';
    if (!plan.ok) {
      if (plan.reason === 'NEGATIVE') {
        throw new BusinessRuleError(
          `El saldo de ${name} quedaría negativo (hay ${balance.quantity} y se pide ${change.quantity}).`,
          { variantId: change.variantId, balance: balance.quantity, quantity: change.quantity },
        );
      }
      throw new BusinessRuleError(
        plan.reason === 'OVERFLOW'
          ? `El saldo de ${name} superaría el máximo permitido.`
          : 'La cantidad de un movimiento no puede ser cero.',
      );
    }

    const movement = await tx.inventoryMovement.create({
      data: {
        variantId: change.variantId,
        type: change.type,
        quantity: change.quantity,
        balanceBefore: balance.quantity,
        balanceAfter: plan.after,
        unitCost: change.unitCost ?? null,
        referenceType: change.referenceType ?? null,
        referenceId: change.referenceId ?? null,
        reason: change.reason ?? null,
        notes: change.notes ?? null,
        userId: change.userId,
      },
    });
    await tx.inventoryBalance.update({
      where: { variantId: change.variantId },
      data: { quantity: plan.after },
    });
    results[index] = {
      variantId: change.variantId,
      movementId: movement.id,
      balanceBefore: balance.quantity,
      balanceAfter: plan.after,
    };
  }
  return results;
}
