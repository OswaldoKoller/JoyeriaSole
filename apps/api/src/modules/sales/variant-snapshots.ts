import type { Prisma } from '../../generated/prisma/client.ts';
import type { VariantSnapshot } from './sale-math.ts';

/**
 * Datos vigentes de las variantes (YA bloqueadas por el llamador): estado, precio, costo y saldo.
 * Los usan la venta y el cambio de pieza; el costo solo viaja al libro, nunca a una respuesta.
 */
export async function loadVariantSnapshots(
  tx: Prisma.TransactionClient,
  ids: readonly string[],
): Promise<Map<string, VariantSnapshot>> {
  const variants = await tx.productVariant.findMany({
    where: { id: { in: [...ids] } },
    include: {
      product: { select: { name: true, status: true } },
      inventory: { select: { quantity: true } },
    },
  });
  return new Map(
    variants.map((variant) => [
      variant.id,
      {
        id: variant.id,
        sku: variant.sku,
        label: variant.label,
        productName: variant.product.name,
        active: variant.status === 'ACTIVE' && variant.product.status === 'ACTIVE',
        salePrice: variant.salePrice.toFixed(2),
        costPrice: variant.costPrice.toFixed(4),
        available: variant.inventory?.quantity ?? 0,
      },
    ]),
  );
}
