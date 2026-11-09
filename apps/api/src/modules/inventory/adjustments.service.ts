import {
  REFERENCE_TYPES,
  adjustmentLabel,
  dayRangeLaPaz,
  formatMoney,
  parseUnitCost,
  unitsToCents,
  valueOfDelta,
  type AdjustmentStatus,
  type CreateAdjustmentInput,
  type RejectAdjustmentInput,
} from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.ts';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../lib/errors.ts';
import { canSeeCosts } from '../../lib/permissions.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { getAuth } from '../../plugins/auth.ts';
import { recordAudit } from '../audit/audit.service.ts';
import { applyStockChanges, planBalanceChange } from './stock-ledger.ts';

const withDetails = {
  reason: true,
  requestedBy: true,
  resolvedBy: true,
  items: {
    include: { variant: { include: { product: true, inventory: true } } },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.InventoryAdjustmentInclude;
type AdjustmentWithDetails = Prisma.InventoryAdjustmentGetPayload<{ include: typeof withDetails }>;
type ItemWithVariant = AdjustmentWithDetails['items'][number];

function unitCostOf(item: ItemWithVariant, status: AdjustmentWithDetails['status']) {
  // Pendiente: costo vigente de la variante. Aprobado: el registrado al aprobar. Otros: ninguno.
  if (status === 'PENDING') return item.variant.costPrice.toFixed(4);
  return item.unitCost ? item.unitCost.toFixed(4) : null;
}

/** Motivos por los que hoy no se podría aprobar un ajuste pendiente. */
function blockersOf(adjustment: AdjustmentWithDetails): string[] {
  if (adjustment.status !== 'PENDING') return [];
  const blockers: string[] = [];
  for (const item of adjustment.items) {
    const { variant } = item;
    if (variant.status !== 'ACTIVE' || variant.product.status !== 'ACTIVE') {
      blockers.push(`La variante ${variant.sku} está inactiva.`);
      continue;
    }
    const current = variant.inventory?.quantity ?? 0;
    const plan = planBalanceChange(current, item.quantityDelta);
    if (!plan.ok) {
      blockers.push(
        plan.reason === 'NEGATIVE'
          ? `El saldo actual de ${variant.sku} es ${current}: no alcanza para una diferencia de ${item.quantityDelta}.`
          : `El saldo de ${variant.sku} superaría el máximo permitido.`,
      );
    }
  }
  return blockers;
}

function toSummary(adjustment: AdjustmentWithDetails, showCosts: boolean) {
  let value = 0n;
  let hasCost = true;
  for (const item of adjustment.items) {
    const cost = unitCostOf(item, adjustment.status);
    if (cost === null) {
      hasCost = false;
      continue;
    }
    const magnitude = unitsToCents(BigInt(Math.abs(item.quantityDelta)) * parseUnitCost(cost));
    value += item.quantityDelta < 0 ? -magnitude : magnitude;
  }
  return {
    id: adjustment.id,
    number: adjustment.number,
    status: adjustment.status,
    reasonId: adjustment.reasonId,
    reasonName: adjustment.reason.name,
    notes: adjustment.notes,
    requestedById: adjustment.requestedById,
    requestedByName: adjustment.requestedBy.name,
    createdAt: adjustment.createdAt.toISOString(),
    resolvedByName: adjustment.resolvedBy?.name ?? null,
    resolvedAt: adjustment.resolvedAt?.toISOString() ?? null,
    itemsCount: adjustment.items.length,
    netUnits: adjustment.items.reduce((sum, item) => sum + item.quantityDelta, 0),
    valueImpact: showCosts && hasCost ? formatMoney(value) : null,
  };
}

function toDetail(adjustment: AdjustmentWithDetails, showCosts: boolean) {
  const pending = adjustment.status === 'PENDING';
  return {
    ...toSummary(adjustment, showCosts),
    resolutionNotes: adjustment.resolutionNotes,
    cancelledAt: adjustment.cancelledAt?.toISOString() ?? null,
    items: adjustment.items.map((item) => {
      const cost = unitCostOf(item, adjustment.status);
      return {
        id: item.id,
        variantId: item.variantId,
        sku: item.variant.sku,
        productName: item.variant.product.name,
        variantLabel: item.variant.label,
        quantityDelta: item.quantityDelta,
        quantityAtRequest: item.quantityAtRequest,
        currentQuantity: pending ? (item.variant.inventory?.quantity ?? 0) : null,
        balanceBefore: item.balanceBefore,
        balanceAfter: item.balanceAfter,
        unitCost: showCosts ? cost : null,
        valueImpact: showCosts && cost !== null ? valueOfDelta(item.quantityDelta, cost) : null,
      };
    }),
    blockers: blockersOf(adjustment),
  };
}

export class AdjustmentsService {
  constructor(private readonly prisma: PrismaClient) {}

  private async load(db: Prisma.TransactionClient | PrismaClient, id: string) {
    const adjustment = await db.inventoryAdjustment.findUnique({
      where: { id },
      include: withDetails,
    });
    if (!adjustment) throw new NotFoundError('Ajuste no encontrado');
    return adjustment;
  }

  /** Bloquea la fila del documento: serializa aprobaciones, rechazos y cancelaciones simultáneas. */
  private async lockPending(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM inventory_adjustments WHERE id = ${id}::uuid FOR UPDATE`;
    const adjustment = await this.load(tx, id);
    if (adjustment.status !== 'PENDING') {
      const done: Record<string, string> = {
        APPROVED: 'ya fue aprobado',
        REJECTED: 'ya fue rechazado',
        CANCELLED: 'fue cancelado',
      };
      throw new BusinessRuleError(`El ajuste ${done[adjustment.status] ?? 'ya fue resuelto'}.`, {
        status: adjustment.status,
      });
    }
    return adjustment;
  }

  async reasons() {
    const reasons = await this.prisma.adjustmentReason.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return reasons.map(({ id, code, name, requiresNotes }) => ({ id, code, name, requiresNotes }));
  }

  async pendingCount() {
    return { count: await this.prisma.inventoryAdjustment.count({ where: { status: 'PENDING' } }) };
  }

  async list(
    input: {
      page: number;
      pageSize: number;
      status: string;
      variantId?: string | undefined;
      from?: string | undefined;
      to?: string | undefined;
    },
    request: FastifyRequest,
  ) {
    const where: Prisma.InventoryAdjustmentWhereInput = {
      ...(input.status !== 'all' && {
        status: input.status as AdjustmentStatus,
      }),
      ...(input.variantId && { items: { some: { variantId: input.variantId } } }),
      ...((input.from || input.to) && {
        createdAt: {
          ...(input.from && { gte: dayRangeLaPaz(input.from).start }),
          ...(input.to && { lte: dayRangeLaPaz(input.to).end }),
        },
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inventoryAdjustment.findMany({
        where,
        include: withDetails,
        orderBy: [{ number: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.inventoryAdjustment.count({ where }),
    ]);
    const showCosts = canSeeCosts(request);
    return {
      data: rows.map((row) => toSummary(row, showCosts)),
      meta: { page: input.page, pageSize: input.pageSize, total },
    };
  }

  async get(id: string, request: FastifyRequest) {
    return toDetail(await this.load(this.prisma, id), canSeeCosts(request));
  }

  /** Solicitud: NO toca el stock. Valida lo que ya se puede saber (saldo no negativo). */
  async create(input: CreateAdjustmentInput, request: FastifyRequest) {
    const userId = getAuth(request).user.id;
    const showCosts = canSeeCosts(request);
    return this.prisma.$transaction(async (tx) => {
      const reason = await tx.adjustmentReason.findUnique({ where: { id: input.reasonId } });
      if (!reason || !reason.isActive) throw new NotFoundError('Motivo de ajuste no encontrado');
      const notes = input.notes ?? null;
      if (reason.requiresNotes && !notes) {
        throw new BusinessRuleError(`El motivo «${reason.name}» exige una observación.`);
      }

      const variants = await tx.productVariant.findMany({
        where: { id: { in: input.items.map((item) => item.variantId) } },
        include: { product: true, inventory: true },
      });
      const byId = new Map(variants.map((variant) => [variant.id, variant]));
      const lines = input.items.map((item) => {
        const variant = byId.get(item.variantId);
        if (!variant) throw new NotFoundError('Una de las variantes no existe');
        if (variant.status !== 'ACTIVE' || variant.product.status !== 'ACTIVE') {
          throw new BusinessRuleError(`La variante ${variant.sku} está inactiva.`);
        }
        const current = variant.inventory?.quantity ?? 0;
        const plan = planBalanceChange(current, item.quantityDelta);
        if (!plan.ok) {
          throw new BusinessRuleError(
            plan.reason === 'NEGATIVE'
              ? `El saldo de ${variant.sku} es ${current}: no se puede solicitar una diferencia de ${item.quantityDelta} (quedaría negativo).`
              : `El saldo de ${variant.sku} superaría el máximo permitido.`,
            { variantId: variant.id, balance: current, quantityDelta: item.quantityDelta },
          );
        }
        return {
          variantId: variant.id,
          quantityDelta: item.quantityDelta,
          quantityAtRequest: current,
        };
      });

      const created = await tx.inventoryAdjustment.create({
        data: {
          reasonId: reason.id,
          notes,
          requestedById: userId,
          items: { create: lines },
        },
      });
      const adjustment = await this.load(tx, created.id);
      await recordAudit(
        tx,
        {
          action: 'inventory_adjustment.requested',
          entityType: 'InventoryAdjustment',
          entityId: adjustment.id,
          after: {
            number: adjustment.number,
            status: 'PENDING',
            reason: reason.name,
            notes,
            items: adjustment.items.map((item) => ({
              variantId: item.variantId,
              sku: item.variant.sku,
              quantityDelta: item.quantityDelta,
              quantityAtRequest: item.quantityAtRequest,
            })),
          },
        },
        request,
      );
      return toDetail(adjustment, showCosts);
    });
  }

  /** Solo quien solicitó puede cancelar, y solo mientras esté pendiente. No toca el stock. */
  async cancel(id: string, request: FastifyRequest) {
    const userId = getAuth(request).user.id;
    const showCosts = canSeeCosts(request);
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.lockPending(tx, id);
      if (previous.requestedById !== userId) {
        throw new ForbiddenError('Solo quien solicitó el ajuste puede cancelarlo.');
      }
      await tx.inventoryAdjustment.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      await recordAudit(
        tx,
        {
          action: 'inventory_adjustment.cancelled',
          entityType: 'InventoryAdjustment',
          entityId: id,
          before: { status: 'PENDING' },
          after: { status: 'CANCELLED', number: previous.number },
        },
        request,
      );
      return toDetail(await this.load(tx, id), showCosts);
    });
  }

  /** El Administrador rechaza con un comentario obligatorio. No toca el stock. */
  async reject(id: string, input: RejectAdjustmentInput, request: FastifyRequest) {
    const userId = getAuth(request).user.id;
    const showCosts = canSeeCosts(request);
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.lockPending(tx, id);
      await tx.inventoryAdjustment.update({
        where: { id },
        data: {
          status: 'REJECTED',
          resolvedById: userId,
          resolvedAt: new Date(),
          resolutionNotes: input.notes,
        },
      });
      await recordAudit(
        tx,
        {
          action: 'inventory_adjustment.rejected',
          entityType: 'InventoryAdjustment',
          entityId: id,
          before: { status: 'PENDING' },
          after: { status: 'REJECTED', number: previous.number, resolutionNotes: input.notes },
        },
        request,
      );
      return toDetail(await this.load(tx, id), showCosts);
    });
  }

  /**
   * Aprobación (ADR-017). En UNA transacción: bloquea el documento, VUELVE A VALIDAR cada línea con
   * el saldo vigente (pudo cambiar desde la solicitud), registra un movimiento ADJUSTMENT por línea
   * a través del libro de stock, fija cantidad anterior/nueva y costo, cierra el documento y audita.
   * Si cualquier línea dejara el saldo negativo, todo se revierte y el ajuste sigue pendiente.
   */
  async approve(id: string, request: FastifyRequest) {
    const userId = getAuth(request).user.id;
    const showCosts = canSeeCosts(request);
    return this.prisma.$transaction(async (tx) => {
      const adjustment = await this.lockPending(tx, id);

      // La variante (y su producto) deben seguir activos: el libro lo comprueba bajo el bloqueo.
      const applied = await applyStockChanges(
        tx,
        adjustment.items.map((item) => ({
          variantId: item.variantId,
          type: 'ADJUSTMENT' as const,
          quantity: item.quantityDelta,
          unitCost: item.variant.costPrice.toFixed(4),
          referenceType: REFERENCE_TYPES.INVENTORY_ADJUSTMENT,
          referenceId: adjustment.id,
          reason: `Ajuste ${adjustmentLabel(adjustment.number)} · ${adjustment.reason.name}`,
          notes: adjustment.notes,
          userId,
          label: item.variant.sku,
        })),
        { requireActive: true },
      );

      const audited: Record<string, string | number>[] = [];
      for (const [index, item] of adjustment.items.entries()) {
        const result = applied[index];
        if (!result) throw new BusinessRuleError('No se pudo aplicar una de las líneas.');
        await tx.inventoryAdjustmentItem.update({
          where: { id: item.id },
          data: {
            balanceBefore: result.balanceBefore,
            balanceAfter: result.balanceAfter,
            unitCost: item.variant.costPrice.toFixed(4),
            movementId: result.movementId,
          },
        });
        audited.push({
          variantId: item.variantId,
          sku: item.variant.sku,
          quantityDelta: item.quantityDelta,
          quantityAtRequest: item.quantityAtRequest,
          balanceBefore: result.balanceBefore,
          balanceAfter: result.balanceAfter,
          movementId: result.movementId.toString(),
        });
      }

      await tx.inventoryAdjustment.update({
        where: { id },
        data: { status: 'APPROVED', resolvedById: userId, resolvedAt: new Date() },
      });
      await recordAudit(
        tx,
        {
          action: 'inventory_adjustment.approved',
          entityType: 'InventoryAdjustment',
          entityId: id,
          before: { status: 'PENDING' },
          after: {
            status: 'APPROVED',
            number: adjustment.number,
            requestedById: adjustment.requestedById,
            reason: adjustment.reason.name,
            notes: adjustment.notes,
            items: audited,
          },
        },
        request,
      );
      return toDetail(await this.load(tx, id), showCosts);
    });
  }
}
