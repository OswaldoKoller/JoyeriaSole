import {
  allocateExtraCosts,
  formatMoney,
  formatUnitCost,
  parseMoney,
  parseUnitCost,
  unitsToCents,
  type AllocationLine,
  type CreateStockEntryInput,
  type ReplaceStockEntryItemsInput,
  type UpdateStockEntryInput,
} from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.ts';
import { BusinessRuleError, NotFoundError } from '../../lib/errors.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { getAuth } from '../../plugins/auth.ts';
import { recordAudit } from '../audit/audit.service.ts';

const MAX_BALANCE = 2_147_483_647; // límite de la columna entera de saldos

const withDetails = {
  supplier: true,
  createdBy: true,
  confirmedBy: true,
  items: {
    include: { variant: { include: { product: true } } },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.StockEntryInclude;
type EntryWithDetails = Prisma.StockEntryGetPayload<{ include: typeof withDetails }>;

const label = (number: number) => `ING-${number.toString().padStart(6, '0')}`;
const cents = (value: Prisma.Decimal) => parseMoney(value.toFixed(2));
const unit = (value: Prisma.Decimal) => parseUnitCost(value.toFixed(4));

/** Valores derivados del borrador: reparto de costos y motivos que impiden confirmar. */
function analyze(entry: EntryWithDetails) {
  const extras = cents(entry.freightCost) + cents(entry.packagingCost) + cents(entry.otherCosts);
  const allocation = allocateExtraCosts(
    entry.items.map((item) => ({
      key: item.variantId,
      receivedQty: item.receivedQty,
      unitCost: unit(item.unitCost),
    })),
    extras,
  );

  const blockers: string[] = [];
  if (entry.items.length === 0) blockers.push('Agregue al menos un ítem.');
  else if (entry.items.every((item) => item.receivedQty === 0)) {
    blockers.push('Registre al menos una pieza recibida.');
  }
  if (!allocation.ok) {
    blockers.push(
      'Hay costos adicionales pero el valor de compra es cero: indique el costo de al menos un ítem.',
    );
  }
  for (const item of entry.items) {
    if (item.variant.status !== 'ACTIVE' || item.variant.product.status !== 'ACTIVE') {
      blockers.push(`La variante ${item.variant.sku} está inactiva.`);
    }
  }

  const purchaseUnits = entry.items.reduce(
    (sum, item) => sum + BigInt(item.receivedQty) * unit(item.unitCost),
    0n,
  );
  return {
    extras,
    purchaseCents: unitsToCents(purchaseUnits),
    allocation,
    blockers,
    lines: new Map<string, AllocationLine>(
      allocation.ok ? allocation.lines.map((line) => [line.key, line]) : [],
    ),
  };
}

function toSummary(entry: EntryWithDetails) {
  const { extras, purchaseCents } = analyze(entry);
  return {
    id: entry.id,
    number: entry.number,
    status: entry.status,
    supplierId: entry.supplierId,
    supplierName: entry.supplier.name,
    documentType: entry.documentType,
    documentNumber: entry.documentNumber,
    documentDate: entry.documentDate ? entry.documentDate.toISOString().slice(0, 10) : null,
    itemsCount: entry.items.length,
    purchaseTotal: formatMoney(purchaseCents),
    extrasTotal: formatMoney(extras),
    createdAt: entry.createdAt.toISOString(),
    confirmedAt: entry.confirmedAt?.toISOString() ?? null,
  };
}

function toDetail(entry: EntryWithDetails) {
  const analysis = analyze(entry);
  const isDraft = entry.status === 'DRAFT';
  return {
    ...toSummary(entry),
    freightCost: entry.freightCost.toFixed(2),
    packagingCost: entry.packagingCost.toFixed(2),
    otherCosts: entry.otherCosts.toFixed(2),
    notes: entry.notes,
    createdByName: entry.createdBy.name,
    confirmedByName: entry.confirmedBy?.name ?? null,
    items: entry.items.map((item) => {
      // Borrador: vista previa del reparto. Confirmado: lo que quedó guardado.
      const extra = isDraft
        ? analysis.lines.get(item.variantId)?.unitExtra
        : item.unitExtraCost
          ? unit(item.unitExtraCost)
          : undefined;
      return {
        id: item.id,
        variantId: item.variantId,
        sku: item.variant.sku,
        productName: item.variant.product.name,
        variantLabel: item.variant.label,
        expectedQty: item.expectedQty,
        receivedQty: item.receivedQty,
        unitCost: item.unitCost.toFixed(4),
        unitExtraCost: extra === undefined ? null : formatUnitCost(extra),
        unitTotalCost: extra === undefined ? null : formatUnitCost(unit(item.unitCost) + extra),
        notes: item.notes,
      };
    }),
    blockers: isDraft ? analysis.blockers : [],
  };
}

export class StockEntriesService {
  constructor(private readonly prisma: PrismaClient) {}

  private async loadDetails(db: Prisma.TransactionClient | PrismaClient, id: string) {
    const entry = await db.stockEntry.findUnique({ where: { id }, include: withDetails });
    if (!entry) throw new NotFoundError('Ingreso no encontrado');
    return entry;
  }

  /** Bloquea la fila del ingreso: serializa ediciones, confirmación y cancelación concurrentes. */
  private async lockDraft(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM stock_entries WHERE id = ${id}::uuid FOR UPDATE`;
    const entry = await this.loadDetails(tx, id);
    if (entry.status !== 'DRAFT') {
      throw new BusinessRuleError(
        entry.status === 'CONFIRMED'
          ? 'El ingreso ya fue confirmado y no se puede modificar.'
          : 'El ingreso está cancelado.',
      );
    }
    return entry;
  }

  private async assertActiveSupplier(db: Prisma.TransactionClient, supplierId: string) {
    const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) throw new NotFoundError('Proveedor no encontrado');
    if (!supplier.isActive) throw new BusinessRuleError('El proveedor está inactivo.');
  }

  async list(input: {
    page: number;
    pageSize: number;
    status: string;
    supplierId?: string | undefined;
    q: string;
  }) {
    const where: Prisma.StockEntryWhereInput = {
      ...(input.status !== 'all' && {
        status: input.status as 'DRAFT' | 'CONFIRMED' | 'CANCELLED',
      }),
      ...(input.supplierId && { supplierId: input.supplierId }),
      ...(input.q && {
        OR: [
          { documentNumber: { contains: input.q, mode: 'insensitive' as const } },
          ...(/^\d{1,9}$/.test(input.q) ? [{ number: Number(input.q) }] : []),
        ],
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockEntry.findMany({
        where,
        include: withDetails,
        orderBy: [{ number: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.stockEntry.count({ where }),
    ]);
    return {
      data: rows.map(toSummary),
      meta: { page: input.page, pageSize: input.pageSize, total },
    };
  }

  async get(id: string) {
    return toDetail(await this.loadDetails(this.prisma, id));
  }

  async create(input: CreateStockEntryInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveSupplier(tx, input.supplierId);
      const created = await tx.stockEntry.create({
        data: {
          supplierId: input.supplierId,
          documentType: input.documentType ?? null,
          documentNumber: input.documentNumber ?? null,
          documentDate: input.documentDate ? new Date(`${input.documentDate}T00:00:00Z`) : null,
          freightCost: input.freightCost,
          packagingCost: input.packagingCost,
          otherCosts: input.otherCosts,
          notes: input.notes ?? null,
          createdById: getAuth(request).user.id,
        },
      });
      const entry = await this.loadDetails(tx, created.id);
      const after = toDetail(entry);
      await recordAudit(
        tx,
        {
          action: 'stock_entry.created',
          entityType: 'StockEntry',
          entityId: entry.id,
          after: { number: entry.number, supplierId: entry.supplierId, status: entry.status },
        },
        request,
      );
      return after;
    });
  }

  async update(id: string, input: UpdateStockEntryInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.lockDraft(tx, id);
      if (input.supplierId && input.supplierId !== previous.supplierId) {
        await this.assertActiveSupplier(tx, input.supplierId);
      }
      await tx.stockEntry.update({
        where: { id },
        data: {
          ...(input.supplierId && { supplierId: input.supplierId }),
          ...(input.documentType !== undefined && { documentType: input.documentType }),
          ...(input.documentNumber !== undefined && { documentNumber: input.documentNumber }),
          ...(input.documentDate !== undefined && {
            documentDate: input.documentDate ? new Date(`${input.documentDate}T00:00:00Z`) : null,
          }),
          ...(input.freightCost !== undefined && { freightCost: input.freightCost }),
          ...(input.packagingCost !== undefined && { packagingCost: input.packagingCost }),
          ...(input.otherCosts !== undefined && { otherCosts: input.otherCosts }),
          ...(input.notes !== undefined && { notes: input.notes }),
        },
      });
      const entry = await this.loadDetails(tx, id);
      const header = (value: EntryWithDetails) => ({
        supplierId: value.supplierId,
        documentType: value.documentType,
        documentNumber: value.documentNumber,
        documentDate: value.documentDate?.toISOString().slice(0, 10) ?? null,
        freightCost: value.freightCost.toFixed(2),
        packagingCost: value.packagingCost.toFixed(2),
        otherCosts: value.otherCosts.toFixed(2),
        notes: value.notes,
      });
      await recordAudit(
        tx,
        {
          action: 'stock_entry.updated',
          entityType: 'StockEntry',
          entityId: id,
          before: header(previous),
          after: header(entry),
        },
        request,
      );
      return toDetail(entry);
    });
  }

  async replaceItems(id: string, input: ReplaceStockEntryItemsInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.lockDraft(tx, id);

      const variants = await tx.productVariant.findMany({
        where: { id: { in: input.items.map((item) => item.variantId) } },
        include: { product: true },
      });
      const byId = new Map(variants.map((variant) => [variant.id, variant]));
      for (const item of input.items) {
        const variant = byId.get(item.variantId);
        if (!variant) throw new NotFoundError('Una de las variantes no existe');
        if (variant.status !== 'ACTIVE' || variant.product.status !== 'ACTIVE') {
          throw new BusinessRuleError(`La variante ${variant.sku} está inactiva.`);
        }
      }

      await tx.stockEntryItem.deleteMany({ where: { stockEntryId: id } });
      await tx.stockEntryItem.createMany({
        data: input.items.map((item) => ({
          stockEntryId: id,
          variantId: item.variantId,
          expectedQty: item.expectedQty ?? null,
          receivedQty: item.receivedQty,
          unitCost: item.unitCost,
          notes: item.notes ?? null,
        })),
      });

      const summarize = (items: { variantId: string; receivedQty: number; unitCost: string }[]) =>
        items.map(({ variantId, receivedQty, unitCost }) => ({ variantId, receivedQty, unitCost }));
      await recordAudit(
        tx,
        {
          action: 'stock_entry.items_replaced',
          entityType: 'StockEntry',
          entityId: id,
          before: summarize(
            previous.items.map((item) => ({
              variantId: item.variantId,
              receivedQty: item.receivedQty,
              unitCost: item.unitCost.toFixed(4),
            })),
          ),
          after: summarize(input.items),
        },
        request,
      );
      return toDetail(await this.loadDetails(tx, id));
    });
  }

  async cancel(id: string, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.lockDraft(tx, id);
      await tx.stockEntry.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      await recordAudit(
        tx,
        {
          action: 'stock_entry.cancelled',
          entityType: 'StockEntry',
          entityId: id,
          before: { status: previous.status },
          after: { status: 'CANCELLED', number: previous.number },
        },
        request,
      );
      return toDetail(await this.loadDetails(tx, id));
    });
  }

  /**
   * Confirmación única (ADR-008, ADR-013, ADR-015). En UNA transacción: reparte los costos
   * adicionales, registra un movimiento STOCK_ENTRY por línea, actualiza saldos y último costo,
   * y deja la auditoría. No modifica el precio de venta (P-25 pendiente).
   */
  async confirm(id: string, request: FastifyRequest) {
    const userId = getAuth(request).user.id;
    return this.prisma.$transaction(async (tx) => {
      const entry = await this.lockDraft(tx, id);
      const analysis = analyze(entry);
      if (analysis.blockers.length > 0 || !analysis.allocation.ok) {
        throw new BusinessRuleError('El ingreso no se puede confirmar todavía.', {
          blockers: analysis.blockers,
        });
      }

      // Orden fijo de bloqueo (por variante) para no interbloquear con otras operaciones de stock.
      const received = entry.items
        .filter((item) => item.receivedQty > 0)
        .sort((a, b) => (a.variantId < b.variantId ? -1 : 1));
      for (const item of received) {
        await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${item.variantId}::uuid FOR UPDATE`;
      }

      const audited: Record<string, string | number>[] = [];
      for (const item of received) {
        const line = analysis.lines.get(item.variantId);
        if (!line) throw new BusinessRuleError('No se pudo calcular el costo de una línea.');

        await tx.$executeRaw`
          INSERT INTO inventory_balances (variant_id, quantity, updated_at)
          VALUES (${item.variantId}::uuid, 0, now()) ON CONFLICT (variant_id) DO NOTHING`;
        const [balance] = await tx.$queryRaw<{ quantity: number }[]>`
          SELECT quantity FROM inventory_balances WHERE variant_id = ${item.variantId}::uuid FOR UPDATE`;
        if (!balance) throw new BusinessRuleError('No se pudo leer el saldo de una variante.');
        const after = balance.quantity + item.receivedQty;
        if (after > MAX_BALANCE) {
          throw new BusinessRuleError(
            `El saldo de ${item.variant.sku} superaría el máximo permitido.`,
          );
        }

        const unitTotal = formatUnitCost(line.unitTotal);
        await tx.inventoryMovement.create({
          data: {
            variantId: item.variantId,
            type: 'STOCK_ENTRY',
            quantity: item.receivedQty,
            balanceBefore: balance.quantity,
            balanceAfter: after,
            unitCost: unitTotal,
            referenceType: 'STOCK_ENTRY',
            referenceId: entry.id,
            reason: `Ingreso ${label(entry.number)}`,
            notes: item.notes,
            userId,
          },
        });
        await tx.inventoryBalance.update({
          where: { variantId: item.variantId },
          data: { quantity: after },
        });
        // Último costo (P-07): el costo unitario total del ingreso reemplaza al vigente.
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { costPrice: unitTotal },
        });
        audited.push({
          variantId: item.variantId,
          sku: item.variant.sku,
          receivedQty: item.receivedQty,
          unitCost: item.unitCost.toFixed(4),
          unitExtraCost: formatUnitCost(line.unitExtra),
          unitTotalCost: unitTotal,
          previousCost: item.variant.costPrice.toFixed(4),
          balanceBefore: balance.quantity,
          balanceAfter: after,
        });
      }

      for (const item of entry.items) {
        const line = analysis.lines.get(item.variantId);
        await tx.stockEntryItem.update({
          where: { id: item.id },
          data: { unitExtraCost: formatUnitCost(line?.unitExtra ?? 0n) },
        });
      }
      await tx.stockEntry.update({
        where: { id },
        data: { status: 'CONFIRMED', confirmedById: userId, confirmedAt: new Date() },
      });
      await recordAudit(
        tx,
        {
          action: 'stock_entry.confirmed',
          entityType: 'StockEntry',
          entityId: id,
          before: { status: 'DRAFT' },
          after: {
            status: 'CONFIRMED',
            number: entry.number,
            extrasTotal: formatMoney(analysis.extras),
            purchaseTotal: formatMoney(analysis.purchaseCents),
            items: audited,
          },
        },
        request,
      );
      return toDetail(await this.loadDetails(tx, id));
    });
  }
}
