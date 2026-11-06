import { randomUUID } from 'node:crypto';
import {
  EXCHANGE_REFERENCE_TYPE,
  PERMISSIONS,
  type CreateExchangeInput,
  type Exchange,
  type ExchangeLine,
} from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.ts';
import { BusinessRuleError, NotFoundError } from '../../lib/errors.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { getAuth } from '../../plugins/auth.ts';
import { recordAudit } from '../audit/audit.service.ts';
import { applyStockChanges, type AppliedStockChange } from './stock-ledger.ts';

/** Acción de auditoría de un cambio de pieza. */
export const EXCHANGE_AUDIT_ACTION = 'inventory.exchange';

/**
 * Regla pura: la pieza devuelta y la entregada deben ser variantes distintas. Cambiar una variante
 * por sí misma no tiene sentido (el saldo no cambiaría) y casi siempre es un error de captura.
 */
export function assertDistinctVariants(input: Pick<CreateExchangeInput, 'returned' | 'delivered'>) {
  if (input.returned.variantId === input.delivered.variantId) {
    throw new BusinessRuleError(
      'La pieza devuelta y la pieza entregada no pueden ser la misma variante.',
      { variantId: input.returned.variantId },
    );
  }
}

type VariantWithProduct = Prisma.ProductVariantGetPayload<{ include: { product: true } }>;
type MovementWithVariant = Prisma.InventoryMovementGetPayload<{
  include: { variant: { include: { product: true } } };
}>;

function lineOf(movement: MovementWithVariant, canSeeCosts: boolean): ExchangeLine {
  return {
    movementId: movement.id.toString(),
    movementType: movement.type === 'EXCHANGE_IN' ? 'EXCHANGE_IN' : 'EXCHANGE_OUT',
    variantId: movement.variantId,
    sku: movement.variant.sku,
    productName: movement.variant.product.name,
    variantLabel: movement.variant.label,
    quantity: movement.quantity,
    balanceBefore: movement.balanceBefore,
    balanceAfter: movement.balanceAfter,
    unitCost: canSeeCosts && movement.unitCost ? movement.unitCost.toFixed(4) : null,
  };
}

function auditedLine(
  variant: VariantWithProduct,
  quantity: number,
  result: AppliedStockChange,
): Prisma.InputJsonObject {
  return {
    variantId: variant.id,
    sku: variant.sku,
    quantity,
    balanceBefore: result.balanceBefore,
    balanceAfter: result.balanceAfter,
    movementId: result.movementId.toString(),
  };
}

/**
 * Cambios de pieza (ADR-019). Es UNA operación de inventario con dos movimientos que se aplican en
 * la misma transacción mediante el libro de stock (ADR-007): entra la pieza devuelta
 * (`EXCHANGE_IN`) y sale la entregada (`EXCHANGE_OUT`). Si la salida dejara el saldo negativo,
 * todo se revierte. No es una devolución (C9): no hay reembolso ni salida sin pieza que la reemplace.
 */
export class ExchangesService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateExchangeInput, request: FastifyRequest): Promise<Exchange> {
    assertDistinctVariants(input);
    const { user } = getAuth(request);
    const referenceId = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      // Bloquea las dos variantes en orden de id (el mismo que usa el libro) antes de leerlas.
      const ids = [input.returned.variantId, input.delivered.variantId].sort();
      for (const id of ids) {
        await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${id}::uuid FOR UPDATE`;
      }
      const variants = await tx.productVariant.findMany({
        where: { id: { in: ids } },
        include: { product: true },
      });
      const byId = new Map<string, VariantWithProduct>(variants.map((v) => [v.id, v]));
      const returned = byId.get(input.returned.variantId);
      const delivered = byId.get(input.delivered.variantId);
      if (!returned) throw new NotFoundError('No se encontró la variante de la pieza devuelta.');
      if (!delivered) throw new NotFoundError('No se encontró la variante de la pieza entregada.');
      for (const variant of [returned, delivered]) {
        if (variant.status !== 'ACTIVE' || variant.product.status !== 'ACTIVE') {
          throw new BusinessRuleError(`La variante ${variant.sku} está inactiva.`);
        }
      }

      const [inResult, outResult] = await applyStockChanges(tx, [
        {
          variantId: returned.id,
          type: 'EXCHANGE_IN',
          quantity: input.returned.quantity,
          // Costo vigente de la variante, solo informativo: un cambio no recalcula costos (ADR-019).
          unitCost: returned.costPrice.toFixed(4),
          referenceType: EXCHANGE_REFERENCE_TYPE,
          referenceId,
          reason: input.reason,
          notes: input.notes,
          userId: user.id,
          label: returned.sku,
        },
        {
          variantId: delivered.id,
          type: 'EXCHANGE_OUT',
          quantity: -input.delivered.quantity,
          unitCost: delivered.costPrice.toFixed(4),
          referenceType: EXCHANGE_REFERENCE_TYPE,
          referenceId,
          reason: input.reason,
          notes: input.notes,
          userId: user.id,
          label: delivered.sku,
        },
      ]);
      if (!inResult || !outResult) throw new BusinessRuleError('No se pudo aplicar el cambio.');

      await recordAudit(
        tx,
        {
          action: EXCHANGE_AUDIT_ACTION,
          entityType: 'InventoryExchange',
          entityId: referenceId,
          after: {
            reason: input.reason,
            notes: input.notes ?? null,
            returned: auditedLine(returned, input.returned.quantity, inResult),
            delivered: auditedLine(delivered, -input.delivered.quantity, outResult),
          },
        },
        request,
      );
    });

    return this.load(referenceId, user.permissions);
  }

  async get(referenceId: string, request: FastifyRequest): Promise<Exchange> {
    return this.load(referenceId, getAuth(request).user.permissions);
  }

  private async load(referenceId: string, permissions: readonly string[]): Promise<Exchange> {
    const movements = await this.prisma.inventoryMovement.findMany({
      where: { referenceType: EXCHANGE_REFERENCE_TYPE, referenceId },
      include: { variant: { include: { product: true } } },
      orderBy: { id: 'asc' },
    });
    const incoming = movements.find((m) => m.type === 'EXCHANGE_IN');
    const outgoing = movements.find((m) => m.type === 'EXCHANGE_OUT');
    if (!incoming || !outgoing) throw new NotFoundError('Cambio de pieza no encontrado');

    const canSeeCosts = permissions.includes(PERMISSIONS.COSTS_READ);
    const canSeeAudit =
      permissions.includes(PERMISSIONS.INVENTORY_EXCHANGE) ||
      permissions.includes(PERMISSIONS.AUDIT_READ);
    const audit = canSeeAudit
      ? await this.prisma.auditLog.findFirst({
          where: { action: EXCHANGE_AUDIT_ACTION, entityId: referenceId },
          orderBy: { id: 'asc' },
        })
      : null;
    const after = audit?.after;

    return {
      referenceId,
      reason: incoming.reason ?? '',
      notes: incoming.notes,
      userId: incoming.userId,
      createdAt: incoming.createdAt.toISOString(),
      returned: lineOf(incoming, canSeeCosts),
      delivered: lineOf(outgoing, canSeeCosts),
      audit: audit
        ? {
            action: audit.action,
            userId: audit.userId,
            createdAt: audit.createdAt.toISOString(),
            after: after && typeof after === 'object' && !Array.isArray(after) ? after : null,
          }
        : null,
    };
  }
}
