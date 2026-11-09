import type { Prisma } from '../../generated/prisma/client.ts';
import { BusinessRuleError } from '../../lib/errors.ts';

/**
 * Bloqueos del libro de inventario (ADR-007), en un único orden global para que operaciones
 * simultáneas sobre las mismas variantes se serialicen sin interbloqueos:
 *
 *   1. las variantes (`product_variants`), ordenadas por id;
 *   2. luego los saldos (`inventory_balances`), ordenados por id de variante.
 *
 * Cualquier código que bloquee variantes y saldos (confirmar ingresos, ajustes, conteos, desactivar
 * o eliminar fichas) debe usar estas funciones y respetar ese orden. Las escrituras sobre el libro
 * y los saldos viven solo en este módulo (`modules/inventory`).
 */

function sortedUnique(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

/** Bloquea (FOR UPDATE) las variantes indicadas, en orden de id. Sin ids no hace nada. */
export async function lockVariants(
  tx: Prisma.TransactionClient,
  variantIds: readonly string[],
): Promise<void> {
  const ids = sortedUnique(variantIds);
  if (ids.length === 0) return;
  await tx.$queryRaw`
    SELECT id FROM product_variants WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
}

/**
 * Bloquea todas las variantes de un producto, en orden de id, y devuelve sus ids. Una variante
 * creada después de este bloqueo no se ve afectada: crear variantes exige bloquear antes el producto.
 */
export async function lockVariantsOfProduct(
  tx: Prisma.TransactionClient,
  productId: string,
): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM product_variants
    WHERE product_id = ${productId}::uuid
    ORDER BY id
    FOR UPDATE`;
  return rows.map((row) => row.id);
}

/**
 * Bloquea las variantes y después sus saldos existentes (mismo orden que `applyStockChanges`).
 * Quien la use ya tiene una vista estable: nadie mueve el stock de esas variantes hasta el final de
 * la transacción.
 */
export async function lockVariantsAndBalances(
  tx: Prisma.TransactionClient,
  variantIds: readonly string[],
): Promise<void> {
  const ids = sortedUnique(variantIds);
  if (ids.length === 0) return;
  await lockVariants(tx, ids);
  await tx.$queryRaw`
    SELECT variant_id FROM inventory_balances
    WHERE variant_id = ANY(${ids}::uuid[])
    ORDER BY variant_id
    FOR UPDATE`;
}

/**
 * Elimina las filas de saldo en cero de las variantes indicadas (paso previo a borrar una ficha sin
 * historial). Nunca borra un saldo con stock: si alguna variante conserva saldo distinto de cero,
 * lanza un error de negocio y el llamador revierte. Debe llamarse con los bloqueos ya tomados
 * (`lockVariantsAndBalances`).
 */
export async function dropEmptyBalances(
  tx: Prisma.TransactionClient,
  variantIds: readonly string[],
): Promise<number> {
  const ids = sortedUnique(variantIds);
  if (ids.length === 0) return 0;
  const withStock = await tx.inventoryBalance.count({
    where: { variantId: { in: ids }, quantity: { not: 0 } },
  });
  if (withStock > 0) {
    throw new BusinessRuleError('No se pueden eliminar saldos de stock distintos de cero.');
  }
  const removed = await tx.inventoryBalance.deleteMany({ where: { variantId: { in: ids } } });
  return removed.count;
}
