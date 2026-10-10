import type { InitialStockInput, InventoryItem } from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import { BusinessRuleError, NotFoundError } from '../../lib/errors.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { getAuth } from '../../plugins/auth.ts';
import { recordAudit } from '../audit/audit.service.ts';

export class InventoryService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(input: { page: number; pageSize: number; q: string; level: string }) {
    const variants = await this.prisma.productVariant.findMany({
      where: {
        status: 'ACTIVE',
        product: { status: 'ACTIVE' },
        ...(input.q && {
          OR: [
            { sku: { contains: input.q, mode: 'insensitive' as const } },
            { barcode: { contains: input.q, mode: 'insensitive' as const } },
            { product: { name: { contains: input.q, mode: 'insensitive' as const } } },
          ],
        }),
      },
      include: { product: true, inventory: true, _count: { select: { movements: true } } },
      orderBy: [{ product: { name: 'asc' } }, { sku: 'asc' }],
    });
    const items = variants
      .map((variant) => {
        const quantity = variant.inventory?.quantity ?? 0;
        const level: InventoryItem['level'] =
          quantity === 0
            ? 'OUT'
            : variant.minStock > 0 && quantity <= variant.minStock
              ? 'LOW'
              : 'OK';
        return {
          variantId: variant.id,
          productName: variant.product.name,
          variantLabel: variant.label,
          sku: variant.sku,
          barcode: variant.barcode,
          quantity,
          minStock: variant.minStock,
          canInitialize: quantity === 0 && variant._count.movements === 0,
          level,
        };
      })
      .filter(
        (item) =>
          input.level === 'all' ||
          (input.level === 'LOW'
            ? item.minStock > 0 && item.quantity <= item.minStock
            : item.level === input.level),
      );
    return {
      data: items.slice((input.page - 1) * input.pageSize, input.page * input.pageSize),
      meta: { page: input.page, pageSize: input.pageSize, total: items.length },
    };
  }

  async movements(variantId: string, input: { page: number; pageSize: number }) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundError('Variante no encontrada');
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where: { variantId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.inventoryMovement.count({ where: { variantId } }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id.toString(),
        type: row.type,
        quantity: row.quantity,
        balanceBefore: row.balanceBefore,
        balanceAfter: row.balanceAfter,
        reason: row.reason,
        notes: row.notes,
        userId: row.userId,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: { page: input.page, pageSize: input.pageSize, total },
    };
  }

  async initialStock(variantId: string, input: InitialStockInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      // Bloquea la variante incluso cuando todavía no existe su fila de saldo.
      await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${variantId}::uuid FOR UPDATE`;
      const variant = await tx.productVariant.findUnique({
        where: { id: variantId },
        include: { product: true },
      });
      if (!variant) throw new NotFoundError('Variante no encontrada');
      if (variant.status !== 'ACTIVE' || variant.product.status !== 'ACTIVE') {
        throw new BusinessRuleError('Solo se puede cargar stock inicial en variantes activas');
      }
      const previousMovements = await tx.inventoryMovement.count({ where: { variantId } });
      if (previousMovements > 0) throw new BusinessRuleError('El stock inicial ya fue registrado');
      await tx.$executeRaw`
        INSERT INTO inventory_balances (variant_id, quantity, updated_at)
        VALUES (${variantId}::uuid, 0, now()) ON CONFLICT (variant_id) DO NOTHING`;
      const [balance] = await tx.$queryRaw<{ quantity: number }[]>`
        SELECT quantity FROM inventory_balances WHERE variant_id = ${variantId}::uuid FOR UPDATE`;
      if (!balance || balance.quantity !== 0) {
        throw new BusinessRuleError('El saldo inicial debe ser cero');
      }
      await tx.inventoryBalance.update({
        where: { variantId },
        data: { quantity: input.quantity },
      });
      const movement = await tx.inventoryMovement.create({
        data: {
          variantId,
          type: 'INITIAL_STOCK',
          quantity: input.quantity,
          balanceBefore: 0,
          balanceAfter: input.quantity,
          reason: input.reason,
          notes: input.notes || null,
          userId: getAuth(request).user.id,
        },
      });
      await recordAudit(
        tx,
        {
          action: 'inventory.initial_stock',
          entityType: 'ProductVariant',
          entityId: variantId,
          after: { quantity: input.quantity, movementId: movement.id.toString() },
        },
        request,
      );
      return { quantity: input.quantity };
    });
  }
}
