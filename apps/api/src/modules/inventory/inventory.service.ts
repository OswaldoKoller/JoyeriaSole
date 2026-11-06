import type { InitialStockInput, InventoryItem } from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import { Prisma } from '../../generated/prisma/client.ts';
import { BusinessRuleError, NotFoundError } from '../../lib/errors.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { getAuth } from '../../plugins/auth.ts';
import { recordAudit } from '../audit/audit.service.ts';

export class InventoryService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Saldos y alertas. El filtro, el orden y la paginación se hacen en la base de datos (con ~2000
   * piezas, cargar todo y paginar en memoria tardaba ~2 s por consulta y el Inicio hace varias).
   * SQL con plantilla etiquetada: nada se concatena.
   */
  async list(input: {
    page: number;
    pageSize: number;
    q: string;
    level: string;
    initialOnly: boolean;
  }) {
    const like = `%${input.q.replace(/[\\%_]/g, '\\$&')}%`;
    const search = input.q
      ? Prisma.sql`AND (v.sku ILIKE ${like} OR v.barcode ILIKE ${like} OR p.name ILIKE ${like})`
      : Prisma.empty;
    const quantity = Prisma.sql`COALESCE(b.quantity, 0)`;
    const level =
      input.level === 'OUT'
        ? Prisma.sql`AND ${quantity} = 0`
        : input.level === 'LOW'
          ? Prisma.sql`AND v.min_stock > 0 AND ${quantity} <= v.min_stock`
          : input.level === 'OK'
            ? Prisma.sql`AND ${quantity} > 0 AND NOT (v.min_stock > 0 AND ${quantity} <= v.min_stock)`
            : Prisma.empty;
    const noMovements = Prisma.sql`NOT EXISTS (SELECT 1 FROM inventory_movements m WHERE m.variant_id = v.id)`;
    const initial = input.initialOnly
      ? Prisma.sql`AND ${quantity} = 0 AND ${noMovements}`
      : Prisma.empty;
    const from = Prisma.sql`
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      LEFT JOIN inventory_balances b ON b.variant_id = v.id
      WHERE v.status = 'ACTIVE' AND p.status = 'ACTIVE' ${search} ${level} ${initial}`;
    const offset = (input.page - 1) * input.pageSize;
    const [rows, counted] = await this.prisma.$transaction([
      this.prisma.$queryRaw<
        {
          id: string;
          product_name: string;
          label: string | null;
          sku: string;
          barcode: string | null;
          quantity: number;
          min_stock: number;
          can_initialize: boolean;
        }[]
      >(Prisma.sql`
        SELECT v.id, p.name AS product_name, v.label, v.sku, v.barcode,
               ${quantity}::int AS quantity, v.min_stock,
               (${quantity} = 0 AND ${noMovements}) AS can_initialize
        ${from}
        ORDER BY p.name ASC, v.sku ASC
        LIMIT ${input.pageSize} OFFSET ${offset}`),
      this.prisma.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT COUNT(*)::int AS total ${from}`),
    ]);
    const data = rows.map((row) => {
      const itemLevel: InventoryItem['level'] =
        row.quantity === 0
          ? 'OUT'
          : row.min_stock > 0 && row.quantity <= row.min_stock
            ? 'LOW'
            : 'OK';
      return {
        variantId: row.id,
        productName: row.product_name,
        variantLabel: row.label,
        sku: row.sku,
        barcode: row.barcode,
        quantity: row.quantity,
        minStock: row.min_stock,
        canInitialize: row.can_initialize,
        level: itemLevel,
      };
    });
    return {
      data,
      meta: { page: input.page, pageSize: input.pageSize, total: counted[0]?.total ?? 0 },
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

  async allMovements(input: { page: number; pageSize: number }) {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        include: { variant: { include: { product: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.inventoryMovement.count(),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id.toString(),
        variantId: row.variantId,
        sku: row.variant.sku,
        productName: row.variant.product.name,
        variantLabel: row.variant.label,
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
