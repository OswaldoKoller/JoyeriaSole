import type { MovementType } from '../../src/generated/prisma/client.ts';
import type { PrismaClient } from '../../src/lib/prisma.ts';
import { applyStockChanges } from '../../src/modules/inventory/stock-ledger.ts';

/**
 * Deja el saldo de una variante en `quantity` registrando el movimiento correspondiente con el
 * libro real (`applyStockChanges`). Desde I-01 (migración `ledger_integrity`) la base rechaza un
 * saldo que no coincide con el libro, así que las pruebas ya no pueden insertar saldos sueltos.
 *
 * - Si el saldo ya es `quantity`, no registra nada (con `quantity` 0 y sin fila, crea la fila en
 *   cero, que es coherente con un libro vacío).
 * - `userId`: autor del movimiento; por defecto, el primer usuario existente.
 * - `type`: tipo del movimiento; por defecto `INITIAL_STOCK` si la variante no tiene movimientos
 *   y `ADJUSTMENT` si ya los tiene.
 */
export async function setStock(
  prisma: PrismaClient,
  variantId: string,
  quantity: number,
  options: { userId?: string; type?: MovementType } = {},
): Promise<void> {
  const userId =
    options.userId ??
    (await prisma.user.findFirstOrThrow({ select: { id: true }, orderBy: { createdAt: 'asc' } }))
      .id;
  await prisma.$transaction(async (tx) => {
    const balance = await tx.inventoryBalance.findUnique({ where: { variantId } });
    const before = balance?.quantity ?? 0;
    if (before === quantity) {
      if (!balance) await tx.inventoryBalance.create({ data: { variantId, quantity: 0 } });
      return;
    }
    const hasMovements = (await tx.inventoryMovement.count({ where: { variantId } })) > 0;
    await applyStockChanges(tx, [
      {
        variantId,
        type: options.type ?? (hasMovements ? 'ADJUSTMENT' : 'INITIAL_STOCK'),
        quantity: quantity - before,
        userId,
        reason: 'Stock de prueba',
      },
    ]);
  });
}
