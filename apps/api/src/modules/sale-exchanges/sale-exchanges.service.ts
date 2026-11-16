import {
  ERROR_CODES,
  SALE_CURRENCY,
  dayRangeLaPaz,
  formatMoney,
  formatSaleNumber,
  isPaymentMethodCode,
  parseMoney,
  PERMISSIONS,
  REFERENCE_TYPES,
  saleExchangeDetailSchema,
  type CreateSaleExchangeInput,
  type SaleExchangeDetail,
  type SaleExchangeListQuery,
  type SaleExchangeLookup,
  type SaleExchangeReceipt,
  type SaleExchangeSummary,
} from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.ts';
import {
  BusinessRuleError,
  IdempotencyKeyReusedError,
  NotFoundError,
  ValidationError,
} from '../../lib/errors.ts';
import { idempotentTransaction, type IdempotencyContext } from '../../lib/idempotency.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { getAuth } from '../../plugins/auth.ts';
import { requiredIdempotencyOf } from '../../plugins/idempotency.ts';
import { recordAudit } from '../audit/audit.service.ts';
import { lockOpenCashSession } from '../cash/cash-locks.ts';
import { applyStockChanges } from '../inventory/stock-ledger.ts';
import { lockVariantsAndBalances } from '../inventory/stock-locks.ts';
import { planPayments, type PaymentMethodRow } from '../sales/sale-math.ts';
import { loadVariantSnapshots } from '../sales/variant-snapshots.ts';
import { businessInfoOf, readBusinessSettings } from '../settings/business-settings.service.ts';
import { computeHoldings, findHolding, planExchange } from './exchange-math.ts';

type Db = PrismaClient | Prisma.TransactionClient;

const summaryInclude = {
  sale: { select: { number: true } },
  cashSession: { select: { number: true } },
} satisfies Prisma.SaleExchangeInclude;
const detailInclude = {
  ...summaryInclude,
  payments: { include: { method: { select: { code: true, sortOrder: true } } } },
} satisfies Prisma.SaleExchangeInclude;
type SummaryRow = Prisma.SaleExchangeGetPayload<{ include: typeof summaryInclude }>;

const optionalMoney = (value: Prisma.Decimal | null) => (value === null ? null : value.toFixed(2));

/** Acción de auditoría de un cambio de pieza de una venta. */
export const SALE_EXCHANGE_AUDIT_ACTION = 'sale_exchange.created';

/** ¿Puede ver los cambios de todos? Sin `sales:read-all`, solo los suyos o de sus ventas. */
function canReadAll(request: FastifyRequest): boolean {
  return getAuth(request).user.permissions.includes(PERMISSIONS.SALES_READ_ALL);
}

/** Filtro de visibilidad: todo, o los cambios hechos por la persona o sobre ventas suyas. */
function visibleTo(request: FastifyRequest): Prisma.SaleExchangeWhereInput {
  if (canReadAll(request)) return {};
  const userId = getAuth(request).user.id;
  return { OR: [{ sellerId: userId }, { sale: { sellerId: userId } }] };
}

function toSummary(row: SummaryRow): SaleExchangeSummary {
  return {
    id: row.id,
    number: row.number,
    saleId: row.saleId,
    saleNumber: row.sale.number,
    createdAt: row.createdAt.toISOString(),
    sellerId: row.sellerId,
    sellerName: row.sellerName,
    cashSessionId: row.cashSessionId,
    cashSessionNumber: row.cashSession.number,
    returned: {
      variantId: row.returnedVariantId,
      sku: row.returnedSku,
      productName: row.returnedProductName,
      variantLabel: row.returnedVariantLabel,
    },
    delivered: {
      variantId: row.deliveredVariantId,
      sku: row.deliveredSku,
      productName: row.deliveredProductName,
      variantLabel: row.deliveredVariantLabel,
    },
    quantity: row.quantity,
    creditUnitPrice: row.creditUnitPrice.toFixed(2),
    deliveredUnitPrice: row.deliveredUnitPrice.toFixed(2),
    difference: row.difference.toFixed(2),
  };
}

function sumPayments(payments: CreateSaleExchangeInput['payments']): bigint {
  return payments.reduce((sum, payment) => sum + parseMoney(payment.amount), 0n);
}

/**
 * Cambio de pieza de una venta (ADR-026). NO es una devolución ni una anulación (DEC-V07): la venta
 * original no se toca. Es un documento aparte, inmutable, que en UNA transacción:
 *  - mueve el stock con dos movimientos del libro (entra la devuelta, sale la entregada);
 *  - cobra la diferencia de precio en la caja abierta (si es efectivo, entra al arqueo);
 *  - queda auditado y atado a su venta, a la pieza de origen y a sus movimientos.
 * Las garantías finales están en la base de datos (migración 20261114000000): Σ pagos = diferencia,
 * nunca más unidades que las disponibles, la pieza nueva nunca más barata y cada lado con su
 * movimiento. Ninguna respuesta contiene costos.
 */
export class SaleExchangesService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * C1 · Qué se puede cambiar de una venta. Cualquier persona con `sales:exchange` puede buscar por
   * el número del comprobante (el cliente puede volver con otro turno); solo se devuelven las
   * piezas y los precios que ya figuran en ese comprobante, nunca pagos ni costos.
   */
  async lookup(number: number): Promise<SaleExchangeLookup> {
    const sale = await this.prisma.sale.findUnique({
      where: { number },
      select: { id: true, number: true, soldAt: true },
    });
    if (!sale) throw new NotFoundError(`No existe la venta ${formatSaleNumber(number)}.`);
    return {
      saleId: sale.id,
      number: sale.number,
      soldAt: sale.soldAt.toISOString(),
      holdings: await this.holdingsOf(this.prisma, sale.id),
    };
  }

  /**
   * C2 · Registrar el cambio, atómico e idempotente (clave obligatoria). Orden:
   *  1. repetición; 2. FOR SHARE de la caja abierta (422 CASH_SESSION_REQUIRED);
   *  3. FOR UPDATE de las dos variantes y sus saldos en el orden global del libro (serializa
   *     también dos cambios de la misma pieza); 4. repetición bajo bloqueo; 5. validaciones con
   *     datos vigentes; 6. cobro de la diferencia; 7. libro; 8. cambio, pagos y auditoría;
   *  9. COMMIT (triggers diferidos de integridad); 10. ante un error, se busca de nuevo la repetición.
   */
  async create(
    input: CreateSaleExchangeInput,
    request: FastifyRequest,
  ): Promise<SaleExchangeDetail> {
    const context = requiredIdempotencyOf(request);
    const { user } = getAuth(request);
    try {
      return await idempotentTransaction(
        this.prisma,
        { context, responseSchema: saleExchangeDetailSchema },
        async (tx) => {
          const replay = await this.domainReplay(tx, context, user.id);
          if (replay) return replay;

          const session = await lockOpenCashSession(tx);
          const returnedVariantId = await this.sourceVariantId(tx, input);
          await lockVariantsAndBalances(tx, [returnedVariantId, input.deliveredVariantId]);
          const lockedReplay = await this.domainReplay(tx, context, user.id);
          if (lockedReplay) return lockedReplay;

          const holding = findHolding(await this.holdingsOf(tx, input.saleId), input);
          if (!holding) {
            throw new BusinessRuleError(
              'Esta pieza ya no tiene unidades por cambiar en la venta.',
              { remaining: 0, requested: input.quantity },
              ERROR_CODES.EXCHANGE_QUANTITY_EXCEEDED,
            );
          }
          const snapshots = await loadVariantSnapshots(tx, [
            holding.variantId,
            input.deliveredVariantId,
          ]);
          const returned = snapshots.get(holding.variantId);
          if (!returned?.active) {
            throw new BusinessRuleError(
              'La pieza que se devuelve está inactiva. Pida al Administrador que la reactive para registrar el cambio.',
              { variantId: holding.variantId, sku: holding.sku },
            );
          }
          const delivered = snapshots.get(input.deliveredVariantId);
          const plan = planExchange(input, holding, delivered);
          if (!delivered) throw new Error('Falta la pieza entregada del cambio');

          if (plan.differenceCents === 0n && input.payments.length > 0) {
            throw new BusinessRuleError(
              'Este cambio no tiene diferencia de precio: no registre pagos.',
              { total: '0.00', paid: formatMoney(sumPayments(input.payments)) },
              ERROR_CODES.PAYMENT_MISMATCH,
            );
          }
          const methods = await tx.paymentMethod.findMany({
            where: { code: { in: input.payments.map((payment) => payment.methodCode) } },
          });
          const payments =
            plan.differenceCents === 0n
              ? []
              : planPayments(
                  input.payments,
                  plan.differenceCents,
                  new Map<string, PaymentMethodRow>(methods.map((method) => [method.code, method])),
                );

          const [generated] = await tx.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS id`;
          if (!generated) throw new Error('No se pudo generar el identificador del cambio');
          const exchangeId = generated.id;

          const saleNumber = await this.saleNumberOf(tx, input.saleId);
          const reason = `Cambio de pieza de la venta ${formatSaleNumber(saleNumber)}`;
          const [movementIn, movementOut] = await applyStockChanges(
            tx,
            [
              {
                variantId: holding.variantId,
                type: 'EXCHANGE_IN',
                quantity: input.quantity,
                // Costo vigente, solo informativo: un cambio no recalcula costos (ADR-019).
                unitCost: returned.costPrice,
                referenceType: REFERENCE_TYPES.EXCHANGE,
                referenceId: exchangeId,
                reason,
                userId: user.id,
                label: holding.sku,
              },
              {
                variantId: delivered.id,
                type: 'EXCHANGE_OUT',
                quantity: -input.quantity,
                unitCost: delivered.costPrice,
                referenceType: REFERENCE_TYPES.EXCHANGE,
                referenceId: exchangeId,
                reason,
                userId: user.id,
                label: delivered.sku,
              },
            ],
            { requireActive: true },
          );
          if (!movementIn || !movementOut) throw new Error('Faltan los movimientos del cambio');

          const exchange = await tx.saleExchange.create({
            data: {
              id: exchangeId,
              saleId: input.saleId,
              cashSessionId: session.id,
              sellerId: user.id,
              sellerName: user.name,
              sourceItemId: input.sourceItemId ?? null,
              sourceExchangeId: input.sourceExchangeId ?? null,
              returnedVariantId: holding.variantId,
              returnedSku: holding.sku,
              returnedProductName: holding.productName,
              returnedVariantLabel: holding.variantLabel,
              deliveredVariantId: delivered.id,
              deliveredSku: delivered.sku,
              deliveredProductName: delivered.productName,
              deliveredVariantLabel: delivered.label,
              quantity: input.quantity,
              creditUnitPrice: plan.creditUnitPrice,
              deliveredUnitPrice: plan.deliveredUnitPrice,
              difference: plan.difference,
              note: input.note ?? null,
              returnedMovementId: movementIn.movementId,
              deliveredMovementId: movementOut.movementId,
              clientRequestId: context.key,
              requestHash: context.requestHash,
            },
          });
          await tx.saleExchangePayment.createMany({
            data: payments.map((payment) => ({
              exchangeId,
              methodId: payment.methodId,
              methodIsCash: payment.isCash,
              methodName: payment.methodName,
              amount: formatMoney(payment.amountCents),
              tenderedAmount:
                payment.tenderedCents === null ? null : formatMoney(payment.tenderedCents),
              changeGiven: payment.changeCents === null ? null : formatMoney(payment.changeCents),
              reference: payment.reference,
            })),
          });
          await recordAudit(
            tx,
            {
              action: SALE_EXCHANGE_AUDIT_ACTION,
              entityType: 'SaleExchange',
              entityId: exchangeId,
              after: {
                number: exchange.number,
                saleId: input.saleId,
                saleNumber,
                cashSessionId: session.id,
                cashSessionNumber: session.number,
                quantity: input.quantity,
                returned: {
                  variantId: holding.variantId,
                  sku: holding.sku,
                  unitPrice: plan.creditUnitPrice,
                  movementId: movementIn.movementId.toString(),
                  balanceBefore: movementIn.balanceBefore,
                  balanceAfter: movementIn.balanceAfter,
                },
                delivered: {
                  variantId: delivered.id,
                  sku: delivered.sku,
                  unitPrice: plan.deliveredUnitPrice,
                  movementId: movementOut.movementId.toString(),
                  balanceBefore: movementOut.balanceBefore,
                  balanceAfter: movementOut.balanceAfter,
                },
                difference: plan.difference,
                payments: payments.map((payment) => ({
                  methodCode: payment.methodCode,
                  amount: formatMoney(payment.amountCents),
                  tendered:
                    payment.tenderedCents === null ? null : formatMoney(payment.tenderedCents),
                  changeGiven:
                    payment.changeCents === null ? null : formatMoney(payment.changeCents),
                })),
                note: input.note ?? null,
              },
            },
            request,
          );
          return this.loadDetail(tx, exchangeId);
        },
      );
    } catch (error) {
      if (error instanceof IdempotencyKeyReusedError) throw error;
      const replay = await this.domainReplay(this.prisma, context, user.id);
      if (replay) return replay;
      throw error;
    }
  }

  /** C3 · Listado paginado (más recientes primero). */
  async list(
    query: SaleExchangeListQuery,
    request: FastifyRequest,
  ): Promise<{
    data: SaleExchangeSummary[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const where: Prisma.SaleExchangeWhereInput = {
      AND: [
        visibleTo(request),
        {
          ...(query.number && { number: query.number }),
          ...(query.saleId && { saleId: query.saleId }),
          ...(query.cashSessionId && { cashSessionId: query.cashSessionId }),
          ...((query.from || query.to) && {
            createdAt: {
              ...(query.from && { gte: dayRangeLaPaz(query.from).start }),
              ...(query.to && { lte: dayRangeLaPaz(query.to).end }),
            },
          }),
        },
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.saleExchange.findMany({
        where,
        include: summaryInclude,
        orderBy: [{ createdAt: 'desc' }, { number: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.saleExchange.count({ where }),
    ]);
    return {
      data: rows.map((row) => toSummary(row)),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  /** C4 · Detalle. Inexistente o no visible → 404 (no revela existencia). */
  async get(id: string, request: FastifyRequest): Promise<SaleExchangeDetail> {
    const visible = await this.prisma.saleExchange.findFirst({
      where: { AND: [{ id }, visibleTo(request)] },
      select: { id: true },
    });
    if (!visible) throw new NotFoundError('Cambio de pieza no encontrado');
    return this.loadDetail(this.prisma, id);
  }

  /** C5 · Comprobante del cambio (proyección de filas inmutables; sin costos ni referencias). */
  async receipt(id: string, request: FastifyRequest): Promise<SaleExchangeReceipt> {
    const row = await this.prisma.saleExchange.findFirst({
      where: { AND: [{ id }, visibleTo(request)] },
      include: detailInclude,
    });
    if (!row) throw new NotFoundError('Cambio de pieza no encontrado');
    const business = await readBusinessSettings(this.prisma);
    const summary = toSummary(row);
    return {
      exchangeId: row.id,
      number: row.number,
      saleNumber: row.sale.number,
      createdAt: summary.createdAt,
      currency: SALE_CURRENCY,
      returned: summary.returned,
      delivered: summary.delivered,
      quantity: row.quantity,
      creditUnitPrice: summary.creditUnitPrice,
      deliveredUnitPrice: summary.deliveredUnitPrice,
      difference: summary.difference,
      payments: [...row.payments]
        .sort((a, b) => a.method.sortOrder - b.method.sortOrder)
        .map((payment) => ({
          methodName: payment.methodName,
          amount: payment.amount.toFixed(2),
          tendered: optionalMoney(payment.tenderedAmount),
          changeGiven: optionalMoney(payment.changeGiven),
        })),
      seller: business.receiptShowSeller ? { name: row.sellerName } : null,
      business: businessInfoOf(business),
    };
  }

  private async loadDetail(db: Db, id: string): Promise<SaleExchangeDetail> {
    const row = await db.saleExchange.findUnique({ where: { id }, include: detailInclude });
    if (!row) throw new NotFoundError('Cambio de pieza no encontrado');
    const payments = [...row.payments].sort((a, b) => a.method.sortOrder - b.method.sortOrder);
    const change = payments.reduce(
      (sum, payment) =>
        sum + (payment.changeGiven ? parseMoney(payment.changeGiven.toFixed(2)) : 0n),
      0n,
    );
    return {
      ...toSummary(row),
      payments: payments.flatMap((payment) =>
        isPaymentMethodCode(payment.method.code)
          ? [
              {
                methodCode: payment.method.code,
                methodName: payment.methodName,
                amount: payment.amount.toFixed(2),
                tendered: optionalMoney(payment.tenderedAmount),
                changeGiven: optionalMoney(payment.changeGiven),
                reference: payment.reference,
              },
            ]
          : [],
      ),
      changeGiven: formatMoney(change),
      note: row.note,
    };
  }

  /** Variante de la pieza que se devuelve; 404 si el origen no pertenece a la venta indicada. */
  private async sourceVariantId(
    tx: Prisma.TransactionClient,
    input: CreateSaleExchangeInput,
  ): Promise<string> {
    if (input.sourceItemId) {
      const item = await tx.saleItem.findUnique({
        where: { id: input.sourceItemId },
        select: { saleId: true, variantId: true },
      });
      if (item?.saleId !== input.saleId) {
        throw new NotFoundError('La pieza que se devuelve no pertenece a esta venta.');
      }
      return item.variantId;
    }
    if (input.sourceExchangeId) {
      const exchange = await tx.saleExchange.findUnique({
        where: { id: input.sourceExchangeId },
        select: { saleId: true, deliveredVariantId: true },
      });
      if (exchange?.saleId !== input.saleId) {
        throw new NotFoundError('La pieza que se devuelve no pertenece a esta venta.');
      }
      return exchange.deliveredVariantId;
    }
    throw new ValidationError('Indique la pieza que se devuelve.');
  }

  private async saleNumberOf(tx: Prisma.TransactionClient, saleId: string): Promise<number> {
    const sale = await tx.sale.findUnique({ where: { id: saleId }, select: { number: true } });
    if (!sale) throw new NotFoundError('Venta no encontrada');
    return sale.number;
  }

  /** Lo que el cliente conserva de la venta: líneas y piezas de cambios anteriores con saldo. */
  private async holdingsOf(db: Db, saleId: string) {
    const items = await db.saleItem.findMany({ where: { saleId }, orderBy: { id: 'asc' } });
    const exchanges = await db.saleExchange.findMany({ where: { saleId } });
    return computeHoldings(
      items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        sku: item.sku,
        productName: item.productName,
        variantLabel: item.variantLabel,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
      })),
      exchanges.map((exchange) => ({
        id: exchange.id,
        number: exchange.number,
        sourceItemId: exchange.sourceItemId,
        sourceExchangeId: exchange.sourceExchangeId,
        quantity: exchange.quantity,
        deliveredVariantId: exchange.deliveredVariantId,
        deliveredSku: exchange.deliveredSku,
        deliveredProductName: exchange.deliveredProductName,
        deliveredVariantLabel: exchange.deliveredVariantLabel,
        deliveredUnitPrice: exchange.deliveredUnitPrice.toFixed(2),
      })),
    );
  }

  /**
   * Repetición por la columna de dominio `sale_exchanges.client_request_id`. Misma clave con otro
   * cuerpo u otro vendedor → 409 IDEMPOTENCY_KEY_REUSED.
   */
  private async domainReplay(
    db: Db,
    context: IdempotencyContext,
    userId: string,
  ): Promise<SaleExchangeDetail | null> {
    const exchange = await db.saleExchange.findUnique({
      where: { clientRequestId: context.key },
      select: { id: true, requestHash: true, sellerId: true },
    });
    if (!exchange) return null;
    if (exchange.requestHash !== context.requestHash || exchange.sellerId !== userId) {
      throw new IdempotencyKeyReusedError();
    }
    context.onReplay?.();
    return this.loadDetail(db, exchange.id);
  }
}
