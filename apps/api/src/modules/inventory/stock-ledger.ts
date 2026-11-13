import type { ReferenceType } from '@joyeria/shared';
import type { MovementType, Prisma } from '../../generated/prisma/client.ts';
import { BusinessRuleError, NotFoundError } from '../../lib/errors.ts';
import { lockVariants } from './stock-locks.ts';

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
  /** Tipo de documento que origina el movimiento (ver `REFERENCE_TYPES` en `@joyeria/shared`). */
  referenceType?: ReferenceType;
  referenceId?: string;
  /** Texto que identifica la variante en los mensajes de error (p. ej. su SKU). */
  label?: string;
}

export interface ApplyStockOptions {
  /**
   * Exige que la variante y su producto estén ACTIVE. Se comprueba DESPUÉS de bloquear las
   * variantes, leyendo el estado vigente: así una desactivación que se confirmó mientras esta
   * operación esperaba el bloqueo no deja stock en una variante inactiva. El conteo físico no lo
   * pide (ADR-021: incluye variantes inactivas con saldo).
   */
  requireActive?: boolean;
}

export interface AppliedStockChange {
  variantId: string;
  movementId: bigint;
  balanceBefore: number;
  balanceAfter: number;
}

/**
 * Aplica varios cambios de stock de forma atómica. Los bloqueos se toman en el orden global del
 * libro (`stock-locks.ts`: primero las variantes por id, luego sus saldos por id) para que
 * operaciones simultáneas sobre las mismas variantes se serialicen sin interbloqueos.
 * Si un solo cambio no es válido (variante inexistente o inactiva cuando se exige activa, saldo
 * negativo, desbordamiento) se lanza un error y el llamador debe dejar que su transacción se
 * revierta completa.
 *
 * Devuelve los resultados en el mismo orden de `changes`; el llamador los usa para actualizar sus
 * propias filas (ítems de ingresos, ajustes, conteos) y su auditoría.
 */
export async function applyStockChanges(
  tx: Prisma.TransactionClient,
  changes: readonly StockChange[],
  options: ApplyStockOptions = {},
): Promise<AppliedStockChange[]> {
  if (changes.length === 0) return [];

  const order = changes
    .map((change, index) => ({ change, index }))
    .sort((a, b) =>
      a.change.variantId === b.change.variantId
        ? a.index - b.index
        : a.change.variantId < b.change.variantId
          ? -1
          : 1,
    );

  await lockVariants(
    tx,
    changes.map((change) => change.variantId),
  );
  await assertVariantsUsable(tx, changes, options);

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

/**
 * Con las variantes ya bloqueadas: comprueba que existan (error de negocio claro en vez de una
 * violación cruda de clave foránea) y, si se pide, que estén activas junto con su producto. El
 * estado se lee en consultas posteriores al bloqueo, por lo que es el vigente.
 */
async function assertVariantsUsable(
  tx: Prisma.TransactionClient,
  changes: readonly StockChange[],
  options: ApplyStockOptions,
): Promise<void> {
  const ids = [...new Set(changes.map((change) => change.variantId))];
  const variants = await tx.productVariant.findMany({
    where: { id: { in: ids } },
    select: { id: true, sku: true, status: true, product: { select: { status: true } } },
  });
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  for (const change of changes) {
    const variant = byId.get(change.variantId);
    if (!variant) {
      throw new NotFoundError(`No se encontró la variante ${change.label ?? change.variantId}.`);
    }
    if (
      options.requireActive &&
      (variant.status !== 'ACTIVE' || variant.product.status !== 'ACTIVE')
    ) {
      throw new BusinessRuleError(`La variante ${change.label ?? variant.sku} está inactiva.`);
    }
  }
}
