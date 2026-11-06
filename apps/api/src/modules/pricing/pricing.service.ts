import { randomUUID } from 'node:crypto';
import {
  PERMISSIONS,
  formatUnitCost,
  hasSalePrice,
  parseUnitCost,
  type PriceChangesInput,
  type PriceChangesQuery,
  type PricingVariantsQuery,
} from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.ts';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../lib/errors.ts';
import { canSeeCosts, canSeeCostsWith } from '../../lib/permissions.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { getAuth } from '../../plugins/auth.ts';
import { recordAudit } from '../audit/audit.service.ts';

/**
 * Precios de venta (ADR-018). El precio de cada variante lo fija el cliente a mano; este módulo es
 * el ÚNICO camino que modifica `product_variants.sale_price` después de crear la pieza:
 *  - el Responsable SOLICITA (PENDING, `prices:propose`);
 *  - el Administrador aprueba o rechaza, uno a uno o en masa (`prices:approve`);
 *  - el Administrador también puede cambiar directamente (ADMIN_DIRECT), aunque sea quien lo modifica;
 *  - el precio inicial al crear la pieza se registra como INITIAL (`recordInitialPrice`).
 *
 * Todo cambio escribe `price_changes` (historial inmutable), `sale_price` y auditoría en la MISMA
 * transacción. Las operaciones en lote son atómicas: si un elemento falla no se aplica ninguno.
 * Los costos solo se devuelven con `costs:read`.
 *
 * Orden de bloqueos (evita interbloqueos): primero las variantes (por id), después los cambios.
 */

const changeInclude = {
  variant: { include: { product: true } },
  requestedBy: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
} satisfies Prisma.PriceChangeInclude;
type ChangeWithDetails = Prisma.PriceChangeGetPayload<{ include: typeof changeInclude }>;

const unit = (value: Prisma.Decimal) => parseUnitCost(value.toFixed(4));

function toChangeResponse(change: ChangeWithDetails, showCosts: boolean) {
  return {
    id: change.id,
    variantId: change.variantId,
    sku: change.variant.sku,
    productName: change.variant.product.name,
    variantLabel: change.variant.label,
    previousPrice: change.previousPrice.toFixed(2),
    newPrice: change.newPrice.toFixed(2),
    status: change.status,
    origin: change.origin,
    requestedBy: change.requestedBy,
    decidedBy: change.decidedBy,
    createdAt: change.createdAt.toISOString(),
    decidedAt: change.decidedAt?.toISOString() ?? null,
    reason: change.reason,
    decisionComment: change.decisionComment,
    costSnapshot: showCosts ? change.costSnapshot.toFixed(4) : null,
    batchId: change.batchId,
  };
}

/** Bloquea las variantes en orden de id y devuelve las que existen. */
async function lockVariants(tx: Prisma.TransactionClient, variantIds: string[]) {
  const sorted = [...new Set(variantIds)].sort();
  await tx.$queryRaw`
    SELECT id FROM product_variants WHERE id = ANY(${sorted}::uuid[]) ORDER BY id FOR UPDATE`;
  return tx.productVariant.findMany({ where: { id: { in: sorted } } });
}

/**
 * Registra el precio inicial de una pieza o variante recién creada (origen INITIAL). Quien llama
 * debe haber comprobado `prices:approve` y crear la variante con ese precio en la misma transacción.
 */
export async function recordInitialPrice(
  tx: Prisma.TransactionClient,
  variant: { id: string },
  price: string,
  request: FastifyRequest,
) {
  if (!hasSalePrice(price)) return;
  const userId = getAuth(request).user.id;
  const now = new Date();
  const change = await tx.priceChange.create({
    data: {
      variantId: variant.id,
      previousPrice: '0',
      newPrice: price,
      status: 'APPROVED',
      origin: 'INITIAL',
      requestedById: userId,
      decidedById: userId,
      decidedAt: now,
      costSnapshot: '0',
    },
  });
  await recordAudit(
    tx,
    {
      action: 'variant.price_changed',
      entityType: 'ProductVariant',
      entityId: variant.id,
      before: { salePrice: '0.00' },
      after: { salePrice: change.newPrice.toFixed(2) },
      metadata: { priceChangeId: change.id, origin: 'INITIAL' },
    },
    request,
  );
}

export class PricingService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Variantes con su panel de costos, precio vigente y solicitud pendiente. */
  async listVariants(query: PricingVariantsQuery, request: FastifyRequest) {
    const permissions = getAuth(request).user.permissions;
    const showCosts = canSeeCostsWith(permissions);
    const showStock = permissions.includes(PERMISSIONS.INVENTORY_READ);
    const where: Prisma.ProductVariantWhereInput = {
      status: 'ACTIVE',
      ...(query.noPrice && { salePrice: 0 }),
      ...(query.withPending && { priceChanges: { some: { status: 'PENDING' } } }),
      ...(query.categoryId && {
        product: {
          category: { OR: [{ id: query.categoryId }, { parentId: query.categoryId }] },
        },
      }),
      ...(query.q && {
        OR: [
          { sku: { contains: query.q, mode: 'insensitive' } },
          { barcode: { contains: query.q, mode: 'insensitive' } },
          { label: { contains: query.q, mode: 'insensitive' } },
          { product: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      }),
    };
    const [variants, total] = await this.prisma.$transaction([
      this.prisma.productVariant.findMany({
        where,
        include: {
          product: { include: { category: true } },
          inventory: true,
          priceChanges: {
            where: { status: 'PENDING' },
            include: { requestedBy: { select: { name: true } } },
          },
        },
        orderBy: [{ product: { name: 'asc' } }, { label: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.productVariant.count({ where }),
    ]);

    // Último ingreso CONFIRMADO de cada variante de la página (solo si se pueden ver costos).
    const lastItems = new Map<
      string,
      Prisma.StockEntryItemGetPayload<{ include: { stockEntry: true } }>
    >();
    if (showCosts && variants.length > 0) {
      // DISTINCT ON: una sola fila por variante (la del ingreso confirmado más reciente) en vez de
      // traer todo el historial de ingresos de las variantes de la página y descartar en memoria.
      const latest = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT ON (i.variant_id) i.id
        FROM stock_entry_items i
        JOIN stock_entries e ON e.id = i.stock_entry_id
        WHERE i.variant_id = ANY(${variants.map((variant) => variant.id)}::uuid[])
          AND i.received_qty > 0
          AND e.status = 'CONFIRMED'
        ORDER BY i.variant_id, e.confirmed_at DESC, i.id DESC`;
      const items = await this.prisma.stockEntryItem.findMany({
        where: { id: { in: latest.map((row) => row.id) } },
        include: { stockEntry: true },
      });
      for (const item of items) lastItems.set(item.variantId, item);
    }

    return {
      data: variants.map((variant) => {
        const last = lastItems.get(variant.id);
        const pending = variant.priceChanges[0];
        return {
          variantId: variant.id,
          sku: variant.sku,
          barcode: variant.barcode,
          productId: variant.productId,
          productName: variant.product.name,
          variantLabel: variant.label,
          categoryId: variant.product.categoryId,
          categoryName: variant.product.category.name,
          salePrice: variant.salePrice.toFixed(2),
          stockQuantity: showStock ? (variant.inventory?.quantity ?? 0) : null,
          costs: showCosts
            ? {
                purchaseUnitCost: last ? last.unitCost.toFixed(4) : null,
                purchaseQty: last ? last.receivedQty : null,
                purchaseSubtotal: last
                  ? formatUnitCost(unit(last.unitCost) * BigInt(last.receivedQty))
                  : null,
                extraUnitCost: last?.unitExtraCost ? last.unitExtraCost.toFixed(4) : null,
                totalUnitCost: variant.costPrice.toFixed(4),
                lastEntryId: last?.stockEntryId ?? null,
                lastEntryNumber: last?.stockEntry.number ?? null,
                lastEntryAt: last?.stockEntry.confirmedAt?.toISOString() ?? null,
              }
            : null,
          pending: pending
            ? {
                id: pending.id,
                newPrice: pending.newPrice.toFixed(2),
                requestedByName: pending.requestedBy.name,
                createdAt: pending.createdAt.toISOString(),
                reason: pending.reason,
              }
            : null,
        };
      }),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  /** Historial global (o de una variante con `variantId`), del más reciente al más antiguo. */
  async listChanges(query: PriceChangesQuery, request: FastifyRequest) {
    const showCosts = canSeeCosts(request);
    const where: Prisma.PriceChangeWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.variantId && { variantId: query.variantId }),
      ...(query.q && {
        variant: {
          OR: [
            { sku: { contains: query.q, mode: 'insensitive' } },
            { label: { contains: query.q, mode: 'insensitive' } },
            { product: { name: { contains: query.q, mode: 'insensitive' } } },
          ],
        },
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.priceChange.findMany({
        where,
        include: changeInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.priceChange.count({ where }),
    ]);
    return {
      data: rows.map((row) => toChangeResponse(row, showCosts)),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async variantHistory(
    variantId: string,
    query: Pick<PriceChangesQuery, 'page' | 'pageSize'>,
    request: FastifyRequest,
  ) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundError('Variante no encontrada');
    return this.listChanges({ ...query, q: '', variantId }, request);
  }

  async pendingCount() {
    return { count: await this.prisma.priceChange.count({ where: { status: 'PENDING' } }) };
  }

  /** Valida y devuelve las variantes de un lote de cambios (todas deben existir, activas y distintas). */
  private async loadBatchVariants(tx: Prisma.TransactionClient, input: PriceChangesInput) {
    const variants = await lockVariants(
      tx,
      input.items.map((item) => item.variantId),
    );
    const byId = new Map(variants.map((variant) => [variant.id, variant]));
    const missing = input.items.filter((item) => !byId.has(item.variantId));
    if (missing.length > 0) {
      throw new NotFoundError('Alguna de las variantes indicadas no existe');
    }
    const inactive = variants.filter((variant) => variant.status !== 'ACTIVE');
    if (inactive.length > 0) {
      throw new BusinessRuleError('Solo se cambian precios de variantes activas', {
        variantIds: inactive.map((variant) => variant.id),
      });
    }
    const unchanged = input.items.filter(
      (item) => byId.get(item.variantId)?.salePrice.toFixed(2) === Number(item.newPrice).toFixed(2),
    );
    if (unchanged.length > 0) {
      throw new BusinessRuleError('El precio nuevo es igual al precio vigente', {
        variantIds: unchanged.map((item) => item.variantId),
      });
    }
    const pending = await tx.priceChange.findMany({
      where: { variantId: { in: [...byId.keys()] }, status: 'PENDING' },
      select: { variantId: true },
    });
    if (pending.length > 0) {
      throw new ConflictError(
        'Ya existe una solicitud de precio pendiente para esta variante: apruébela, recházela o cancélela primero',
        { variantIds: pending.map((row) => row.variantId) },
      );
    }
    return byId;
  }

  /** Responsable (o quien tenga `prices:propose`): crea solicitudes PENDING en un solo lote. */
  async createRequests(input: PriceChangesInput, request: FastifyRequest) {
    const userId = getAuth(request).user.id;
    const showCosts = canSeeCosts(request);
    return this.prisma.$transaction(async (tx) => {
      const variants = await this.loadBatchVariants(tx, input);
      const created: ChangeWithDetails[] = [];
      for (const item of input.items) {
        const variant = variants.get(item.variantId);
        if (!variant) continue;
        const change = await tx.priceChange.create({
          data: {
            variantId: variant.id,
            previousPrice: variant.salePrice,
            newPrice: item.newPrice,
            origin: 'REQUEST',
            requestedById: userId,
            reason: input.reason ?? null,
            costSnapshot: variant.costPrice,
          },
          include: changeInclude,
        });
        created.push(change);
        await recordAudit(
          tx,
          {
            action: 'price.requested',
            entityType: 'PriceChange',
            entityId: change.id,
            after: toChangeResponse(change, true),
            metadata: { variantId: variant.id },
          },
          request,
        );
      }
      return created.map((change) => toChangeResponse(change, showCosts));
    });
  }

  /** Administrador: cambia precios directamente; queda aprobado por él mismo (ADMIN_DIRECT). */
  async applyDirect(input: PriceChangesInput, request: FastifyRequest) {
    const userId = getAuth(request).user.id;
    const showCosts = canSeeCosts(request);
    const batchId = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const variants = await this.loadBatchVariants(tx, input);
      const applied: ChangeWithDetails[] = [];
      for (const item of input.items) {
        const variant = variants.get(item.variantId);
        if (!variant) continue;
        const change = await tx.priceChange.create({
          data: {
            variantId: variant.id,
            previousPrice: variant.salePrice,
            newPrice: item.newPrice,
            status: 'APPROVED',
            origin: 'ADMIN_DIRECT',
            requestedById: userId,
            decidedById: userId,
            decidedAt: new Date(),
            reason: input.reason ?? null,
            costSnapshot: variant.costPrice,
            batchId,
          },
          include: changeInclude,
        });
        await tx.productVariant.update({
          where: { id: variant.id },
          data: { salePrice: item.newPrice },
        });
        applied.push(change);
        await recordAudit(
          tx,
          {
            action: 'variant.price_changed',
            entityType: 'ProductVariant',
            entityId: variant.id,
            before: { salePrice: change.previousPrice.toFixed(2) },
            after: { salePrice: change.newPrice.toFixed(2) },
            metadata: { priceChangeId: change.id, origin: 'ADMIN_DIRECT', batchId },
          },
          request,
        );
      }
      return applied.map((change) => toChangeResponse(change, showCosts));
    });
  }

  /**
   * Bloquea y valida un lote de solicitudes pendientes. Todas deben existir y seguir PENDING; el
   * llamador comprueba además el precio vigente al aprobar.
   */
  private async loadPending(tx: Prisma.TransactionClient, ids: string[]) {
    const sorted = [...new Set(ids)].sort();
    const found = await tx.priceChange.findMany({
      where: { id: { in: sorted } },
      select: { id: true, variantId: true },
    });
    const missing = sorted.filter((id) => !found.some((row) => row.id === id));
    if (missing.length > 0)
      throw new NotFoundError('Alguna de las solicitudes indicadas no existe');
    // Variantes primero, luego las solicitudes (orden de bloqueo común a todo el módulo).
    const variants = await lockVariants(
      tx,
      found.map((row) => row.variantId),
    );
    await tx.$queryRaw`
      SELECT id FROM price_changes WHERE id = ANY(${sorted}::uuid[]) ORDER BY id FOR UPDATE`;
    const changes = await tx.priceChange.findMany({
      where: { id: { in: sorted } },
      include: changeInclude,
      orderBy: { id: 'asc' },
    });
    const resolved = changes.filter((change) => change.status !== 'PENDING');
    if (resolved.length > 0) {
      throw new BusinessRuleError('Hay solicitudes que ya fueron resueltas', {
        ids: resolved.map((change) => change.id),
      });
    }
    return { changes, variants: new Map(variants.map((variant) => [variant.id, variant])) };
  }

  /** Administrador: aprueba solicitudes (una o en masa). Atómico; vigencia inmediata. */
  async approve(ids: string[], request: FastifyRequest) {
    const userId = getAuth(request).user.id;
    const showCosts = canSeeCosts(request);
    const batchId = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const { changes, variants } = await this.loadPending(tx, ids);
      const stale = changes.filter(
        (change) => !variants.get(change.variantId)?.salePrice.equals(change.previousPrice),
      );
      if (stale.length > 0) {
        throw new ConflictError(
          'El precio vigente cambió después de la solicitud: rechácela o pida una nueva',
          { ids: stale.map((change) => change.id) },
        );
      }
      const approved: ChangeWithDetails[] = [];
      for (const change of changes) {
        const decided = await tx.priceChange.update({
          where: { id: change.id },
          data: { status: 'APPROVED', decidedById: userId, decidedAt: new Date(), batchId },
          include: changeInclude,
        });
        await tx.productVariant.update({
          where: { id: change.variantId },
          data: { salePrice: change.newPrice },
        });
        approved.push(decided);
        await recordAudit(
          tx,
          {
            action: 'variant.price_changed',
            entityType: 'ProductVariant',
            entityId: change.variantId,
            before: { salePrice: change.previousPrice.toFixed(2) },
            after: { salePrice: change.newPrice.toFixed(2) },
            metadata: { priceChangeId: change.id, origin: 'REQUEST', batchId },
          },
          request,
        );
        await recordAudit(
          tx,
          {
            action: 'price.approved',
            entityType: 'PriceChange',
            entityId: change.id,
            before: { status: 'PENDING' },
            after: {
              status: 'APPROVED',
              previousPrice: change.previousPrice.toFixed(2),
              newPrice: change.newPrice.toFixed(2),
            },
            metadata: { variantId: change.variantId, batchId },
          },
          request,
        );
      }
      return { batchId, changes: approved.map((change) => toChangeResponse(change, showCosts)) };
    });
  }

  /** Administrador: rechaza solicitudes (una o en masa) con un comentario obligatorio. */
  async reject(ids: string[], comment: string, request: FastifyRequest) {
    const userId = getAuth(request).user.id;
    const showCosts = canSeeCosts(request);
    const batchId = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const { changes } = await this.loadPending(tx, ids);
      const rejected: ChangeWithDetails[] = [];
      for (const change of changes) {
        const decided = await tx.priceChange.update({
          where: { id: change.id },
          data: {
            status: 'REJECTED',
            decidedById: userId,
            decidedAt: new Date(),
            decisionComment: comment,
            batchId,
          },
          include: changeInclude,
        });
        rejected.push(decided);
        await recordAudit(
          tx,
          {
            action: 'price.rejected',
            entityType: 'PriceChange',
            entityId: change.id,
            before: { status: 'PENDING' },
            after: { status: 'REJECTED', comment },
            metadata: { variantId: change.variantId, batchId },
          },
          request,
        );
      }
      return { batchId, changes: rejected.map((change) => toChangeResponse(change, showCosts)) };
    });
  }

  /** El solicitante cancela su propia solicitud mientras esté pendiente. */
  async cancel(id: string, request: FastifyRequest) {
    const userId = getAuth(request).user.id;
    const showCosts = canSeeCosts(request);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.priceChange.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Solicitud de precio no encontrada');
      if (existing.requestedById !== userId) {
        throw new ForbiddenError('Solo quien hizo la solicitud puede cancelarla');
      }
      await lockVariants(tx, [existing.variantId]);
      await tx.$queryRaw`SELECT id FROM price_changes WHERE id = ${id}::uuid FOR UPDATE`;
      const change = await tx.priceChange.findUniqueOrThrow({ where: { id } });
      if (change.status !== 'PENDING') {
        throw new BusinessRuleError('La solicitud ya fue resuelta y no se puede cancelar');
      }
      const cancelled = await tx.priceChange.update({
        where: { id },
        data: { status: 'CANCELLED', decidedById: userId, decidedAt: new Date() },
        include: changeInclude,
      });
      await recordAudit(
        tx,
        {
          action: 'price.cancelled',
          entityType: 'PriceChange',
          entityId: id,
          before: { status: 'PENDING' },
          after: { status: 'CANCELLED' },
          metadata: { variantId: change.variantId },
        },
        request,
      );
      return toChangeResponse(cancelled, showCosts);
    });
  }
}
