import {
  PERMISSIONS,
  REFERENCE_TYPES,
  checkDocumentDate,
  computeEntryCosts,
  convertToBob,
  formatMoney,
  formatUnitCost,
  MAX_UNIT_COST_UNITS,
  parseExchangeRate,
  parseMoney,
  parseUnitCost,
  stockEntryDetailSchema,
  unitsToCents,
  type CreateStockEntryInput,
  type EntryCostLine,
  type QuickCreateStockEntryItemInput,
  type ReplaceStockEntryCostsInput,
  type ReplaceStockEntryItemsInput,
  type UpdateStockEntryInput,
} from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.ts';
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../lib/errors.ts';
import { idempotentTransaction } from '../../lib/idempotency.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { getAuth } from '../../plugins/auth.ts';
import { idempotencyOf } from '../../plugins/idempotency.ts';
import { recordAudit } from '../audit/audit.service.ts';
import { ProductsService } from '../catalog/products.service.ts';
import { applyStockChanges } from '../inventory/stock-ledger.ts';

const MAX_ITEMS = 200;

const withDetails = {
  supplier: true,
  createdBy: true,
  confirmedBy: true,
  costs: { include: { costType: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  items: {
    include: { variant: { include: { product: true } } },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.StockEntryInclude;
type EntryWithDetails = Prisma.StockEntryGetPayload<{ include: typeof withDetails }>;
type Db = Prisma.TransactionClient | PrismaClient;

const label = (number: number) => `ING-${number.toString().padStart(6, '0')}`;
const cents = (value: Prisma.Decimal) => parseMoney(value.toFixed(2));
const unit = (value: Prisma.Decimal) => parseUnitCost(value.toFixed(4));
const dateOnly = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const rateOf = (entry: { exchangeRate: Prisma.Decimal | null }) =>
  entry.exchangeRate ? parseExchangeRate(entry.exchangeRate.toFixed(4)) : null;
/** Los costos son información reservada: solo con `costs:read` (el Vendedor nunca los recibe). */
const seesCosts = (request: FastifyRequest) =>
  getAuth(request).user.permissions.includes(PERMISSIONS.COSTS_READ);

/** Fecha del documento: no futura y hasta 30 días atrás, en America/La_Paz (C6). */
function assertDocumentDate(date: string | null | undefined) {
  if (!date) return;
  const problem = checkDocumentDate(date);
  if (problem === 'FUTURE')
    throw new ValidationError('La fecha del documento no puede ser futura.');
  if (problem === 'TOO_OLD') {
    throw new ValidationError('La fecha del documento no puede ser anterior a 30 días.');
  }
}

/** Costo unitario en Bs de un precio digitado (ADR-016). Rechaza lo que no cabe en la columna. */
function toBobUnits(
  entry: { currency: 'BOB' | 'USD'; exchangeRate: Prisma.Decimal | null },
  price: string,
) {
  const units = parseUnitCost(price);
  const rate = rateOf(entry);
  const bob = entry.currency === 'USD' && rate !== null ? convertToBob(units, rate) : units;
  if (bob > MAX_UNIT_COST_UNITS) {
    throw new ValidationError('El precio, convertido a bolivianos, supera el máximo permitido.');
  }
  return bob;
}

/** Valores derivados del borrador: reparto de costos y motivos que impiden confirmar. */
function analyze(entry: EntryWithDetails) {
  const extras = entry.costs.reduce((sum, cost) => sum + cents(cost.amount), 0n);
  const result = computeEntryCosts({
    currency: entry.currency,
    exchangeRate: rateOf(entry),
    items: entry.items.map((item) => ({
      key: item.variantId,
      receivedQty: item.receivedQty,
      unitPrice: unit(item.unitPrice),
    })),
    extrasCents: extras,
  });

  const blockers: string[] = [];
  if (entry.items.length === 0) blockers.push('Agregue al menos un ítem.');
  else if (entry.items.every((item) => item.receivedQty === 0)) {
    blockers.push('Registre al menos una pieza recibida.');
  }
  if (!result.ok) {
    blockers.push(
      result.reason === 'ZERO_VALUE'
        ? 'Hay costos adicionales pero el valor de compra es cero: indique el costo de al menos un ítem.'
        : result.reason === 'MISSING_RATE'
          ? 'Indique el tipo de cambio del ingreso.'
          : 'Un precio, convertido a bolivianos, supera el máximo permitido.',
    );
  }
  for (const item of entry.items) {
    if (item.variant.status !== 'ACTIVE' || item.variant.product.status !== 'ACTIVE') {
      blockers.push(`La variante ${item.variant.sku} está inactiva.`);
    }
    // C2: si lo recibido difiere de lo esperado, hay que justificarlo.
    if (
      item.expectedQty !== null &&
      item.expectedQty !== item.receivedQty &&
      !item.differenceReason?.trim()
    ) {
      blockers.push(
        `Justifique la diferencia de ${item.variant.sku}: esperadas ${item.expectedQty}, recibidas ${item.receivedQty}.`,
      );
    }
  }

  // Totales a partir de lo guardado (los costos en Bs se mantienen sincronizados con precio × cambio).
  const purchaseBob = entry.items.reduce(
    (sum, item) => sum + BigInt(item.receivedQty) * unit(item.unitCost),
    0n,
  );
  const purchaseOriginal = entry.items.reduce(
    (sum, item) => sum + BigInt(item.receivedQty) * unit(item.unitPrice),
    0n,
  );
  return {
    extras,
    purchaseBob,
    purchaseOriginal,
    result,
    blockers,
    lines: new Map<string, EntryCostLine>(
      result.ok ? result.lines.map((line) => [line.key, line]) : [],
    ),
  };
}

function toSummary(entry: EntryWithDetails, withCosts: boolean) {
  const { extras, purchaseBob } = analyze(entry);
  return {
    id: entry.id,
    number: entry.number,
    status: entry.status,
    supplierId: entry.supplierId,
    supplierName: entry.supplier.name,
    documentType: entry.documentType,
    documentNumber: entry.documentNumber,
    documentDate: dateOnly(entry.documentDate),
    currency: entry.currency,
    itemsCount: entry.items.length,
    purchaseTotal: withCosts ? formatMoney(unitsToCents(purchaseBob)) : null,
    extrasTotal: withCosts ? formatMoney(extras) : null,
    createdAt: entry.createdAt.toISOString(),
    confirmedAt: entry.confirmedAt?.toISOString() ?? null,
  };
}

function itemCost(
  item: EntryWithDetails['items'][number],
  line: EntryCostLine | undefined,
  confirmed: boolean,
) {
  const quantity = BigInt(item.receivedQty);
  const price = unit(item.unitPrice);
  const bob = unit(item.unitCost);
  let allocation: {
    extraAllocated: string | null;
    totalCost: string | null;
    unitExtraCost: string | null;
    unitTotalCost: string | null;
  } = { extraAllocated: null, totalCost: null, unitExtraCost: null, unitTotalCost: null };
  if (confirmed) {
    // Confirmado: lo que quedó guardado al confirmar (inmutable).
    allocation = {
      extraAllocated: item.extraCostAllocated?.toFixed(2) ?? null,
      totalCost: item.totalCost?.toFixed(4) ?? null,
      unitExtraCost: item.unitExtraCost?.toFixed(4) ?? null,
      unitTotalCost: item.unitExtraCost ? formatUnitCost(bob + unit(item.unitExtraCost)) : null,
    };
  } else if (line) {
    // Borrador: vista previa del reparto, con el mismo algoritmo que la confirmación.
    allocation = {
      extraAllocated: formatMoney(line.extraCents),
      totalCost: formatUnitCost(line.totalCost),
      unitExtraCost: formatUnitCost(line.unitExtra),
      unitTotalCost: formatUnitCost(line.unitTotal),
    };
  }
  return {
    unitPrice: formatUnitCost(price),
    unitCostBob: formatUnitCost(bob),
    subtotalOriginal: formatUnitCost(quantity * price),
    subtotalBob: formatUnitCost(quantity * bob),
    ...allocation,
  };
}

interface RelatedEntry {
  id: string;
  number: number;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  documentDate: Date | null;
}

function toDetail(entry: EntryWithDetails, related: RelatedEntry[], withCosts: boolean) {
  const analysis = analyze(entry);
  const isDraft = entry.status === 'DRAFT';
  const confirmed = entry.status === 'CONFIRMED';
  return {
    ...toSummary(entry, withCosts),
    exchangeRate: withCosts ? (entry.exchangeRate?.toFixed(4) ?? null) : null,
    notes: entry.notes,
    createdByName: entry.createdBy.name,
    confirmedByName: entry.confirmedBy?.name ?? null,
    items: entry.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      sku: item.variant.sku,
      productName: item.variant.product.name,
      variantLabel: item.variant.label,
      profileIncomplete: item.variant.product.profileIncomplete,
      expectedQty: item.expectedQty,
      receivedQty: item.receivedQty,
      differenceReason: item.differenceReason,
      notes: item.notes,
      cost: withCosts ? itemCost(item, analysis.lines.get(item.variantId), confirmed) : null,
    })),
    costs: withCosts
      ? entry.costs.map((cost) => ({
          id: cost.id,
          costTypeId: cost.costTypeId,
          costTypeName: cost.costType.name,
          amount: cost.amount.toFixed(2),
          note: cost.note,
        }))
      : null,
    totals: withCosts
      ? {
          purchaseOriginal: formatMoney(unitsToCents(analysis.purchaseOriginal)),
          purchaseBob: formatMoney(unitsToCents(analysis.purchaseBob)),
          extras: formatMoney(analysis.extras),
          grand: formatMoney(unitsToCents(analysis.purchaseBob + analysis.extras * 100n)),
        }
      : null,
    relatedEntries: related.map((other) => ({
      id: other.id,
      number: other.number,
      status: other.status,
      documentDate: dateOnly(other.documentDate),
    })),
    blockers: isDraft ? analysis.blockers : [],
  };
}

export class StockEntriesService {
  private readonly products: ProductsService;

  constructor(private readonly prisma: PrismaClient) {
    this.products = new ProductsService(prisma);
  }

  private async loadDetails(db: Db, id: string) {
    const entry = await db.stockEntry.findUnique({ where: { id }, include: withDetails });
    if (!entry) throw new NotFoundError('Ingreso no encontrado');
    return entry;
  }

  /** Otras entregas del mismo proveedor con el mismo comprobante (C5). */
  private async relatedOf(db: Db, entry: EntryWithDetails): Promise<RelatedEntry[]> {
    if (!entry.documentNumber) return [];
    return db.stockEntry.findMany({
      where: {
        supplierId: entry.supplierId,
        documentNumber: { equals: entry.documentNumber, mode: 'insensitive' },
        id: { not: entry.id },
      },
      select: { id: true, number: true, status: true, documentDate: true },
      orderBy: { number: 'asc' },
      take: 20,
    });
  }

  private async detailOf(db: Db, id: string, request: FastifyRequest) {
    const entry = await this.loadDetails(db, id);
    return toDetail(entry, await this.relatedOf(db, entry), seesCosts(request));
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

  async list(
    input: {
      page: number;
      pageSize: number;
      status: string;
      supplierId?: string | undefined;
      q: string;
    },
    request: FastifyRequest,
  ) {
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
    const withCosts = seesCosts(request);
    return {
      data: rows.map((row) => toSummary(row, withCosts)),
      meta: { page: input.page, pageSize: input.pageSize, total },
    };
  }

  async get(id: string, request: FastifyRequest) {
    return this.detailOf(this.prisma, id, request);
  }

  async create(input: CreateStockEntryInput, request: FastifyRequest) {
    if (!seesCosts(request) && (input.currency === 'USD' || input.exchangeRate)) {
      throw new ForbiddenError('No tiene permiso para registrar compras en dólares');
    }
    assertDocumentDate(input.documentDate);
    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveSupplier(tx, input.supplierId);
      const created = await tx.stockEntry.create({
        data: {
          supplierId: input.supplierId,
          documentType: input.documentType ?? null,
          documentNumber: input.documentNumber ?? null,
          documentDate: input.documentDate ? new Date(`${input.documentDate}T00:00:00Z`) : null,
          currency: input.currency,
          exchangeRate: input.currency === 'USD' ? (input.exchangeRate ?? null) : null,
          notes: input.notes ?? null,
          createdById: getAuth(request).user.id,
        },
      });
      const entry = await this.loadDetails(tx, created.id);
      await recordAudit(
        tx,
        {
          action: 'stock_entry.created',
          entityType: 'StockEntry',
          entityId: entry.id,
          after: {
            number: entry.number,
            supplierId: entry.supplierId,
            status: entry.status,
            currency: entry.currency,
            exchangeRate: entry.exchangeRate?.toFixed(4) ?? null,
          },
        },
        request,
      );
      return toDetail(entry, [], seesCosts(request));
    });
  }

  async update(id: string, input: UpdateStockEntryInput, request: FastifyRequest) {
    const withCosts = seesCosts(request);
    if (!withCosts && (input.currency === 'USD' || input.exchangeRate)) {
      throw new ForbiddenError('No tiene permiso para registrar compras en dólares');
    }
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.lockDraft(tx, id);
      if (input.supplierId && input.supplierId !== previous.supplierId) {
        await this.assertActiveSupplier(tx, input.supplierId);
      }
      // La fecha solo se vuelve a validar si cambia: un borrador antiguo no queda atrapado.
      if (
        input.documentDate !== undefined &&
        input.documentDate !== dateOnly(previous.documentDate)
      ) {
        assertDocumentDate(input.documentDate);
      }

      // Moneda y tipo de cambio se validan combinados con lo guardado.
      const currency = input.currency ?? previous.currency;
      let exchangeRate: string | null = null;
      if (currency === 'USD') {
        exchangeRate =
          input.exchangeRate !== undefined
            ? input.exchangeRate
            : (previous.exchangeRate?.toFixed(4) ?? null);
        if (!exchangeRate) {
          throw new ValidationError('Indique el tipo de cambio de este ingreso.');
        }
      } else if (input.exchangeRate) {
        throw new ValidationError('El tipo de cambio solo se indica en ingresos en dólares.');
      }
      const priceBasisChanged =
        currency !== previous.currency ||
        exchangeRate !== (previous.exchangeRate?.toFixed(4) ?? null);

      await tx.stockEntry.update({
        where: { id },
        data: {
          ...(input.supplierId && { supplierId: input.supplierId }),
          ...(input.documentType !== undefined && { documentType: input.documentType }),
          ...(input.documentNumber !== undefined && { documentNumber: input.documentNumber }),
          ...(input.documentDate !== undefined && {
            documentDate: input.documentDate ? new Date(`${input.documentDate}T00:00:00Z`) : null,
          }),
          currency,
          exchangeRate,
          ...(input.notes !== undefined && { notes: input.notes }),
        },
      });
      let entry = await this.loadDetails(tx, id);
      if (priceBasisChanged) {
        // El costo en Bs de cada ítem depende de la moneda y del tipo de cambio: se recalcula.
        for (const item of entry.items) {
          const bob = toBobUnits(entry, item.unitPrice.toFixed(4));
          await tx.stockEntryItem.update({
            where: { id: item.id },
            data: { unitCost: formatUnitCost(bob) },
          });
        }
        entry = await this.loadDetails(tx, id);
      }
      await recordAudit(
        tx,
        {
          action: 'stock_entry.updated',
          entityType: 'StockEntry',
          entityId: id,
          before: this.headerOf(previous),
          after: this.headerOf(entry),
        },
        request,
      );
      return toDetail(entry, await this.relatedOf(tx, entry), withCosts);
    });
  }

  private headerOf(value: EntryWithDetails) {
    return {
      supplierId: value.supplierId,
      documentType: value.documentType,
      documentNumber: value.documentNumber,
      documentDate: dateOnly(value.documentDate),
      currency: value.currency,
      exchangeRate: value.exchangeRate?.toFixed(4) ?? null,
      notes: value.notes,
    };
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
          differenceReason: item.differenceReason ?? null,
          unitPrice: item.unitPrice,
          unitCost: formatUnitCost(toBobUnits(previous, item.unitPrice)),
          notes: item.notes ?? null,
        })),
      });

      const summarize = (items: { variantId: string; receivedQty: number; unitPrice: string }[]) =>
        items.map(({ variantId, receivedQty, unitPrice }) => ({
          variantId,
          receivedQty,
          unitPrice,
        }));
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
              unitPrice: item.unitPrice.toFixed(4),
            })),
          ),
          after: summarize(input.items),
        },
        request,
      );
      return this.detailOf(tx, id, request);
    });
  }

  /** Reemplaza la lista de costos adicionales del borrador (Q-08). Montos en Bs. */
  async replaceCosts(id: string, input: ReplaceStockEntryCostsInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.lockDraft(tx, id);

      const types = await tx.stockEntryCostType.findMany({
        where: { id: { in: input.costs.map((cost) => cost.costTypeId) } },
      });
      const byId = new Map(types.map((type) => [type.id, type]));
      const alreadyUsed = new Set(previous.costs.map((cost) => cost.costTypeId));
      for (const cost of input.costs) {
        const type = byId.get(cost.costTypeId);
        if (!type) throw new NotFoundError('Uno de los tipos de costo no existe');
        // Un tipo desactivado no se puede usar en líneas nuevas; si ya estaba en el ingreso, se conserva.
        if (!type.isActive && !alreadyUsed.has(type.id)) {
          throw new BusinessRuleError(`El tipo de costo «${type.name}» está desactivado.`);
        }
      }

      await tx.stockEntryCost.deleteMany({ where: { stockEntryId: id } });
      await tx.stockEntryCost.createMany({
        data: input.costs.map((cost) => ({
          stockEntryId: id,
          costTypeId: cost.costTypeId,
          amount: cost.amount,
          note: cost.note ?? null,
        })),
      });

      await recordAudit(
        tx,
        {
          action: 'stock_entry.costs_replaced',
          entityType: 'StockEntry',
          entityId: id,
          before: previous.costs.map((cost) => ({
            type: cost.costType.name,
            amount: cost.amount.toFixed(2),
            note: cost.note,
          })),
          after: input.costs.map((cost) => ({
            type: byId.get(cost.costTypeId)?.name ?? cost.costTypeId,
            amount: cost.amount,
            note: cost.note ?? null,
          })),
        },
        request,
      );
      return this.detailOf(tx, id, request);
    });
  }

  /**
   * Alta rápida de una pieza nueva dentro del borrador (C1/P-24), todo en una transacción:
   * producto ACTIVO con ficha incompleta y precio de venta 0 (SKU correlativo del catálogo),
   * relación proveedor-pieza con el código del proveedor y el ítem del ingreso.
   *
   * Código del proveedor: se guarda como código de barras solo si no choca con otro código ni SKU
   * (Q-10b); si choca no se guarda como barcode y se avisa. La pieza se identifica por su SKU.
   */
  async quickCreateItem(
    id: string,
    input: QuickCreateStockEntryItemInput,
    request: FastifyRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await this.lockDraft(tx, id);
      if (entry.items.length >= MAX_ITEMS) {
        throw new BusinessRuleError(`Un ingreso admite hasta ${MAX_ITEMS} ítems.`);
      }
      const unitCost = formatUnitCost(toBobUnits(entry, input.unitPrice));

      const warnings: string[] = [];
      let barcode: string | null = null;
      let supplierCode: string | null = input.supplierCode ?? null;
      if (supplierCode) {
        const clash = await tx.productVariant.findFirst({
          where: { OR: [{ barcode: supplierCode }, { sku: supplierCode }] },
          select: { sku: true },
        });
        if (clash) {
          warnings.push(
            `El código del proveedor «${supplierCode}» ya identifica a otra pieza (${clash.sku}): no se guardó como código de barras. La nueva pieza se identifica por su SKU.`,
          );
        } else {
          barcode = supplierCode;
        }
        const sameSupplier = await tx.supplierProduct.findFirst({
          where: { supplierId: entry.supplierId, supplierCode },
        });
        if (sameSupplier) {
          warnings.push(
            'Ese código ya está asignado a otra pieza de este proveedor: no se guardó en la relación proveedor-pieza.',
          );
          supplierCode = null;
        }
      }

      const { product } = await this.products.createWithin(
        tx,
        { categoryId: input.categoryId, name: input.name, barcode, minStock: 0, attributes: [] },
        request,
        {
          profileIncomplete: true,
          metadata: { source: 'stock_entry_quick_create', stockEntryId: id },
        },
      );
      const variant = product.variants[0];
      if (!variant) throw new BusinessRuleError('No se pudo crear la variante de la pieza.');

      await tx.supplierProduct.create({
        data: { supplierId: entry.supplierId, variantId: variant.id, supplierCode },
      });
      await tx.stockEntryItem.create({
        data: {
          stockEntryId: id,
          variantId: variant.id,
          receivedQty: input.receivedQty,
          unitPrice: input.unitPrice,
          unitCost,
        },
      });
      await recordAudit(
        tx,
        {
          action: 'stock_entry.item_quick_created',
          entityType: 'StockEntry',
          entityId: id,
          after: {
            productId: product.id,
            variantId: variant.id,
            sku: variant.sku,
            name: product.name,
            receivedQty: input.receivedQty,
            unitPrice: input.unitPrice,
            supplierCode,
            barcodeSaved: barcode !== null,
          },
        },
        request,
      );
      return {
        detail: await this.detailOf(tx, id, request),
        variantId: variant.id,
        productId: product.id,
        warnings,
      };
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
      return this.detailOf(tx, id, request);
    });
  }

  /**
   * Confirmación única (ADR-008, ADR-013, ADR-015, ADR-016). En UNA transacción: convierte a Bs,
   * reparte los costos adicionales, registra un movimiento STOCK_ENTRY por línea, actualiza saldos
   * y último costo, fija en cada ítem el costo en Bs, el adicional asignado y el costo total, y deja
   * la auditoría. No modifica el precio de venta.
   */
  async confirm(id: string, request: FastifyRequest) {
    const userId = getAuth(request).user.id;
    // Idempotente: un reintento con la misma Idempotency-Key devuelve el detalle ya confirmado.
    const idempotency = { context: idempotencyOf(request), responseSchema: stockEntryDetailSchema };
    return idempotentTransaction(this.prisma, idempotency, async (tx) => {
      const entry = await this.lockDraft(tx, id);
      const analysis = analyze(entry);
      if (analysis.blockers.length > 0 || !analysis.result.ok) {
        throw new BusinessRuleError('El ingreso no se puede confirmar todavía.', {
          blockers: analysis.blockers,
        });
      }

      // Una sola operación del libro con todas las líneas recibidas: bloquea las variantes y sus
      // saldos en el orden global, exige variante y producto activos bajo el bloqueo, valida el
      // máximo de saldo y registra un movimiento STOCK_ENTRY por línea.
      // Ordenadas por variante, como siempre, para que la auditoría conserve el mismo orden.
      const received = entry.items
        .filter((item) => item.receivedQty > 0)
        .sort((a, b) => (a.variantId < b.variantId ? -1 : 1));
      const lines = received.map((item) => {
        const line = analysis.lines.get(item.variantId);
        if (!line) throw new BusinessRuleError('No se pudo calcular el costo de una línea.');
        return { item, line, unitTotal: formatUnitCost(line.unitTotal) };
      });
      const applied = await applyStockChanges(
        tx,
        lines.map(({ item, unitTotal }) => ({
          variantId: item.variantId,
          type: 'STOCK_ENTRY' as const,
          quantity: item.receivedQty,
          unitCost: unitTotal,
          referenceType: REFERENCE_TYPES.STOCK_ENTRY,
          referenceId: entry.id,
          reason: `Ingreso ${label(entry.number)}`,
          notes: item.notes,
          userId,
          label: item.variant.sku,
        })),
        { requireActive: true },
      );

      const audited: Record<string, string | number>[] = [];
      for (const [index, { item, line, unitTotal }] of lines.entries()) {
        const result = applied[index];
        if (!result) throw new BusinessRuleError('No se pudo aplicar una de las líneas.');
        // Último costo (P-07): el costo unitario total del ingreso reemplaza al vigente.
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { costPrice: unitTotal },
        });
        audited.push({
          variantId: item.variantId,
          sku: item.variant.sku,
          receivedQty: item.receivedQty,
          unitPrice: item.unitPrice.toFixed(4),
          unitCostBob: formatUnitCost(line.unitCostBob),
          unitExtraCost: formatUnitCost(line.unitExtra),
          extraCostAllocated: formatMoney(line.extraCents),
          unitTotalCost: unitTotal,
          totalCost: formatUnitCost(line.totalCost),
          previousCost: item.variant.costPrice.toFixed(4),
          balanceBefore: result.balanceBefore,
          balanceAfter: result.balanceAfter,
        });
      }

      for (const item of entry.items) {
        const line = analysis.lines.get(item.variantId);
        if (!line) throw new BusinessRuleError('No se pudo calcular el costo de una línea.');
        await tx.stockEntryItem.update({
          where: { id: item.id },
          data: {
            unitCost: formatUnitCost(line.unitCostBob),
            unitExtraCost: formatUnitCost(line.unitExtra),
            extraCostAllocated: formatMoney(line.extraCents),
            totalCost: formatUnitCost(line.totalCost),
          },
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
            currency: entry.currency,
            exchangeRate: entry.exchangeRate?.toFixed(4) ?? null,
            costs: entry.costs.map((cost) => ({
              type: cost.costType.name,
              amount: cost.amount.toFixed(2),
              note: cost.note,
            })),
            extrasTotal: formatMoney(analysis.extras),
            purchaseTotal: formatMoney(unitsToCents(analysis.purchaseBob)),
            items: audited,
          },
        },
        request,
      );
      return this.detailOf(tx, id, request);
    });
  }

  /** Historial de costos de una variante (C10): compras confirmadas, la más reciente primero. */
  async costHistory(variantId: string, page: number, pageSize: number) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundError('Variante no encontrada');
    const where: Prisma.StockEntryItemWhereInput = {
      variantId,
      receivedQty: { gt: 0 },
      stockEntry: { status: 'CONFIRMED' },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockEntryItem.findMany({
        where,
        include: { stockEntry: { include: { supplier: true } } },
        orderBy: [{ stockEntry: { confirmedAt: 'desc' } }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.stockEntryItem.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        entryId: row.stockEntryId,
        entryNumber: row.stockEntry.number,
        confirmedAt: (row.stockEntry.confirmedAt ?? row.stockEntry.createdAt).toISOString(),
        supplierName: row.stockEntry.supplier.name,
        currency: row.stockEntry.currency,
        exchangeRate: row.stockEntry.exchangeRate?.toFixed(4) ?? null,
        quantity: row.receivedQty,
        unitPrice: row.unitPrice.toFixed(4),
        unitCostBob: row.unitCost.toFixed(4),
        unitExtraCost: row.unitExtraCost?.toFixed(4) ?? null,
        unitTotalCost: row.unitExtraCost
          ? formatUnitCost(unit(row.unitCost) + unit(row.unitExtraCost))
          : null,
      })),
      meta: { page, pageSize, total },
    };
  }
}
