import {
  dayRangeLaPaz,
  formatMoney,
  isPaymentMethodCode,
  parseMoney,
  PERMISSIONS,
  REFERENCE_TYPES,
  saleDetailSchema,
  type CreateSaleInput,
  type PaymentMethod,
  type SaleDetail,
  type SaleListQuery,
  type SaleSummary,
} from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.ts';
import { IdempotencyKeyReusedError, NotFoundError } from '../../lib/errors.ts';
import { idempotentTransaction, type IdempotencyContext } from '../../lib/idempotency.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { getAuth } from '../../plugins/auth.ts';
import { requiredIdempotencyOf } from '../../plugins/idempotency.ts';
import { recordAudit } from '../audit/audit.service.ts';
import { lockOpenCashSession } from '../cash/cash-locks.ts';
import { applyStockChanges } from '../inventory/stock-ledger.ts';
import { lockVariantsAndBalances } from '../inventory/stock-locks.ts';
import { planPayments, planSale, type PaymentMethodRow } from './sale-math.ts';
import { loadVariantSnapshots } from './variant-snapshots.ts';

type Db = PrismaClient | Prisma.TransactionClient;

const saleInclude = {
  cashSession: { select: { number: true } },
  items: { orderBy: { id: 'asc' } },
  payments: { include: { method: { select: { code: true, sortOrder: true } } } },
  _count: { select: { prints: true } },
} satisfies Prisma.SaleInclude;
type SaleWithRelations = Prisma.SaleGetPayload<{ include: typeof saleInclude }>;

const optionalMoney = (value: Prisma.Decimal | null) => (value === null ? null : value.toFixed(2));

/** Códigos de medio de una venta, en el orden del catálogo (solo los conocidos). */
function methodCodes(payments: { method: { code: string; sortOrder: number } }[]) {
  return [...payments]
    .sort((a, b) => a.method.sortOrder - b.method.sortOrder)
    .flatMap(({ method }) => (isPaymentMethodCode(method.code) ? [method.code] : []));
}

/** ¿Puede ver las ventas de todos? Sin `sales:read-all`, solo las propias (D-02). */
export function canReadAllSales(request: FastifyRequest): boolean {
  return getAuth(request).user.permissions.includes(PERMISSIONS.SALES_READ_ALL);
}

/**
 * Venta de mostrador (E1; ADR-022). Una venta confirmada es INMUTABLE: este servicio solo crea y
 * consulta; no existe edición, borrado ni reversión (DEC-V07). El stock se descuenta SOLO con
 * `applyStockChanges` del módulo de inventario (movimiento SALE). Ninguna respuesta contiene costos.
 */
export class SalesService {
  constructor(private readonly prisma: PrismaClient) {}

  /** V1 · Medios de pago activos. */
  async paymentMethods(): Promise<PaymentMethod[]> {
    const rows = await this.prisma.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return rows.flatMap((row) =>
      isPaymentMethodCode(row.code) ? [{ code: row.code, name: row.name, isCash: row.isCash }] : [],
    );
  }

  /**
   * V2 · Confirmación atómica e idempotente (clave obligatoria). Orden (plan 11 §4.5 y §3.12):
   *  1. repetición (clave genérica y columna `client_request_id`), antes de exigir caja;
   *  2. FOR SHARE de la sesión abierta (422 CASH_SESSION_REQUIRED);
   *  3. FOR UPDATE de variantes y saldos en el orden global del libro;
   *  4. repetición bajo bloqueo; 5. validaciones con datos vigentes; 6. pagos;
   *  7. libro (`applyStockChanges`, SALE); 8. venta, líneas, pagos y auditoría; 9. COMMIT
   *     (triggers diferidos de integridad); 10. ante cualquier error, se vuelve a buscar la repetición.
   */
  async create(input: CreateSaleInput, request: FastifyRequest): Promise<SaleDetail> {
    const context = requiredIdempotencyOf(request);
    const { user } = getAuth(request);
    try {
      return await idempotentTransaction(
        this.prisma,
        { context, responseSchema: saleDetailSchema },
        async (tx) => {
          const replay = await this.domainReplay(tx, context, user.id);
          if (replay) return replay;

          const session = await lockOpenCashSession(tx);
          const variantIds = input.items.map((item) => item.variantId);
          await lockVariantsAndBalances(tx, variantIds);
          const lockedReplay = await this.domainReplay(tx, context, user.id);
          if (lockedReplay) return lockedReplay;

          const plan = planSale(
            input.items,
            input.expectedTotal,
            await loadVariantSnapshots(tx, variantIds),
          );
          const methods = await tx.paymentMethod.findMany({
            where: { code: { in: input.payments.map((payment) => payment.methodCode) } },
          });
          const payments = planPayments(
            input.payments,
            plan.totalCents,
            new Map<string, PaymentMethodRow>(methods.map((method) => [method.code, method])),
          );

          const [generated] = await tx.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS id`;
          if (!generated) throw new Error('No se pudo generar el identificador de la venta');
          const saleId = generated.id;

          const applied = await applyStockChanges(
            tx,
            plan.lines.map((line) => ({
              variantId: line.variantId,
              type: 'SALE' as const,
              quantity: -line.quantity,
              unitCost: line.unitCost,
              referenceType: REFERENCE_TYPES.SALE,
              referenceId: saleId,
              userId: user.id,
              label: line.sku,
            })),
            { requireActive: true },
          );

          const sale = await tx.sale.create({
            data: {
              id: saleId,
              cashSessionId: session.id,
              sellerId: user.id,
              sellerName: user.name,
              total: plan.total,
              clientRequestId: context.key,
              requestHash: context.requestHash,
            },
          });
          await tx.saleItem.createMany({
            data: plan.lines.map((line, index) => {
              const movement = applied[index];
              if (!movement) throw new Error('Falta el movimiento de una línea de la venta');
              return {
                saleId,
                variantId: line.variantId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                lineTotal: line.lineTotal,
                unitCostSnapshot: line.unitCost,
                sku: line.sku,
                productName: line.productName,
                variantLabel: line.variantLabel,
                movementId: movement.movementId,
              };
            }),
          });
          await tx.salePayment.createMany({
            data: payments.map((payment) => ({
              saleId,
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
              action: 'sale.created',
              entityType: 'Sale',
              entityId: saleId,
              after: {
                number: sale.number,
                cashSessionId: session.id,
                cashSessionNumber: session.number,
                total: plan.total,
                items: plan.lines.map((line, index) => ({
                  variantId: line.variantId,
                  sku: line.sku,
                  quantity: line.quantity,
                  unitPrice: line.unitPrice,
                  lineTotal: line.lineTotal,
                  movementId: applied[index]?.movementId.toString() ?? null,
                  balanceAfter: applied[index]?.balanceAfter ?? null,
                })),
                payments: payments.map((payment) => ({
                  methodCode: payment.methodCode,
                  amount: formatMoney(payment.amountCents),
                  tendered:
                    payment.tenderedCents === null ? null : formatMoney(payment.tenderedCents),
                  changeGiven:
                    payment.changeCents === null ? null : formatMoney(payment.changeCents),
                })),
              },
            },
            request,
          );
          return this.loadDetail(tx, saleId);
        },
      );
    } catch (error) {
      // Paso 10: si la venta de esta clave ya existe (p. ej. la respuesta se perdió y el reintento
      // chocó con el índice único), se responde la repetición en vez del error.
      if (error instanceof IdempotencyKeyReusedError) throw error;
      const replay = await this.domainReplay(this.prisma, context, user.id);
      if (replay) return replay;
      throw error;
    }
  }

  /** V3 · Listado paginado (más recientes primero). Sin `sales:read-all`, solo las propias. */
  async list(
    query: SaleListQuery,
    request: FastifyRequest,
  ): Promise<{ data: SaleSummary[]; meta: { page: number; pageSize: number; total: number } }> {
    const { user } = getAuth(request);
    const meta = { page: query.page, pageSize: query.pageSize };
    const readAll = canReadAllSales(request);
    if (!readAll && query.sellerId && query.sellerId !== user.id) {
      return { data: [], meta: { ...meta, total: 0 } };
    }
    const sellerId = readAll ? query.sellerId : user.id;
    const where: Prisma.SaleWhereInput = {
      ...(sellerId && { sellerId }),
      ...(query.number && { number: query.number }),
      ...(query.cashSessionId && { cashSessionId: query.cashSessionId }),
      ...(query.methodCode && { payments: { some: { method: { code: query.methodCode } } } }),
      ...((query.from || query.to) && {
        soldAt: {
          ...(query.from && { gte: dayRangeLaPaz(query.from).start }),
          ...(query.to && { lte: dayRangeLaPaz(query.to).end }),
        },
      }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: saleInclude,
        orderBy: [{ soldAt: 'desc' }, { number: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.sale.count({ where }),
    ]);
    return { data: rows.map((row) => this.toSummary(row)), meta: { ...meta, total } };
  }

  /** V4 · Detalle. Inexistente o ajena sin `sales:read-all` → 404 (no revela existencia). */
  async get(id: string, request: FastifyRequest): Promise<SaleDetail> {
    await this.assertVisible(this.prisma, id, request);
    return this.loadDetail(this.prisma, id);
  }

  /** 404 si la venta no existe o es ajena y la persona solo ve las suyas. */
  async assertVisible(db: Db, id: string, request: FastifyRequest): Promise<void> {
    const sale = await db.sale.findUnique({ where: { id }, select: { sellerId: true } });
    if (!sale || (!canReadAllSales(request) && sale.sellerId !== getAuth(request).user.id)) {
      throw new NotFoundError('Venta no encontrada');
    }
  }

  async loadDetail(db: Db, id: string): Promise<SaleDetail> {
    const sale = await db.sale.findUnique({ where: { id }, include: saleInclude });
    if (!sale) throw new NotFoundError('Venta no encontrada');
    const payments = [...sale.payments].sort((a, b) => a.method.sortOrder - b.method.sortOrder);
    const change = payments.reduce(
      (sum, payment) =>
        sum + (payment.changeGiven ? parseMoney(payment.changeGiven.toFixed(2)) : 0n),
      0n,
    );
    return {
      ...this.toSummary(sale),
      // Sin unit_cost_snapshot: ninguna respuesta de ventas contiene costos (R-25).
      items: sale.items.map((item) => ({
        variantId: item.variantId,
        sku: item.sku,
        productName: item.productName,
        variantLabel: item.variantLabel,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        lineTotal: item.lineTotal.toFixed(2),
      })),
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
      receiptPrints: sale._count.prints,
    };
  }

  private toSummary(sale: SaleWithRelations): SaleSummary {
    return {
      id: sale.id,
      number: sale.number,
      soldAt: sale.soldAt.toISOString(),
      sellerId: sale.sellerId,
      sellerName: sale.sellerName,
      total: sale.total.toFixed(2),
      itemsCount: sale.items.length,
      paymentMethods: methodCodes(sale.payments),
      cashSessionId: sale.cashSessionId,
      cashSessionNumber: sale.cashSession.number,
    };
  }

  /**
   * Repetición por la columna de dominio `sales.client_request_id` (cubre una clave genérica vencida
   * y el paso 10). Misma clave con otro cuerpo u otro vendedor → 409 IDEMPOTENCY_KEY_REUSED.
   * El hash no incluye la sesión de caja, la hora ni el usuario (I-4): el usuario se compara aparte.
   */
  private async domainReplay(
    db: Db,
    context: IdempotencyContext,
    userId: string,
  ): Promise<SaleDetail | null> {
    const sale = await db.sale.findUnique({
      where: { clientRequestId: context.key },
      select: { id: true, requestHash: true, sellerId: true },
    });
    if (!sale) return null;
    if (sale.requestHash !== context.requestHash || sale.sellerId !== userId) {
      throw new IdempotencyKeyReusedError();
    }
    context.onReplay?.();
    return this.loadDetail(db, sale.id);
  }
}
