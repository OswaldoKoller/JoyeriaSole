import {
  cashCorrectionResultSchema,
  cashSessionDetailSchema,
  currentCashFigures,
  dayRangeLaPaz,
  ERROR_CODES,
  formatMoney,
  isPaymentMethodCode,
  parseMoney,
  type CashCorrection,
  type CashCorrectionResult,
  type CashSessionDetail,
  type CashSessionListQuery,
  type CashSessionSummary,
  type CashStatus,
  type CloseCashSessionInput,
  type CreateCashCorrectionInput,
  type OpenCashSessionInput,
} from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import { Prisma } from '../../generated/prisma/client.ts';
import {
  BusinessRuleError,
  ConflictError,
  IdempotencyKeyReusedError,
  NotFoundError,
  ValidationError,
} from '../../lib/errors.ts';
import { idempotentTransaction, type IdempotencyContext } from '../../lib/idempotency.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { getAuth } from '../../plugins/auth.ts';
import { requiredIdempotencyOf } from '../../plugins/idempotency.ts';
import { recordAudit } from '../audit/audit.service.ts';
import { lockCashSessionForUpdate } from './cash-locks.ts';
import { planClosing } from './cash-math.ts';

type Db = PrismaClient | Prisma.TransactionClient;

/** Espera máxima del cierre por las ventas en curso (plan 11 §3.12); al vencer, 503 + Retry-After. */
const CLOSE_LOCK_TIMEOUT = '5s';

const money = (value: Prisma.Decimal) => value.toFixed(2);
const optionalMoney = (value: Prisma.Decimal | null) => (value === null ? null : value.toFixed(2));
/** Texto numérico de PostgreSQL («300.00», «0») → «300.00». */
const normalizeMoney = (value: string) => formatMoney(parseMoney(value));

const sessionInclude = {
  openedBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  corrections: {
    orderBy: { sequence: 'asc' },
    select: { kind: true, newValue: true, correctedAt: true },
  },
} satisfies Prisma.CashSessionInclude;
type SessionWithRelations = Prisma.CashSessionGetPayload<{ include: typeof sessionInclude }>;

const correctionInclude = {
  correctedBy: { select: { id: true, name: true } },
} satisfies Prisma.CashSessionCorrectionInclude;
type CorrectionWithUser = Prisma.CashSessionCorrectionGetPayload<{
  include: typeof correctionInclude;
}>;

function toCorrection(row: CorrectionWithUser): CashCorrection {
  return {
    id: row.id,
    sequence: row.sequence,
    kind: row.kind,
    previousValue: optionalMoney(row.previousValue),
    newValue: optionalMoney(row.newValue),
    expectedCashAfter: money(row.expectedCashAfter),
    countedCashAfter: money(row.countedCashAfter),
    differenceAfter: money(row.differenceAfter),
    reason: row.reason,
    correctedBy: row.correctedBy,
    correctedAt: row.correctedAt.toISOString(),
  };
}

function correctionChain(session: SessionWithRelations) {
  return session.corrections.map((c) => ({
    kind: c.kind,
    newValue: optionalMoney(c.newValue),
  }));
}

/** Cifras de cierre ORIGINALES de una sesión cerrada (para recalcular las vigentes). */
function closedOriginal(session: SessionWithRelations) {
  if (session.status !== 'CLOSED' || !session.cashSalesTotal || !session.countedCash) return null;
  return {
    openingAmount: money(session.openingAmount),
    cashSalesTotal: money(session.cashSalesTotal),
    cashMovementsNet: optionalMoney(session.cashMovementsNet) ?? '0.00',
    countedCash: money(session.countedCash),
  };
}

function alreadyOpen(session: { id: string; number: number }) {
  return new ConflictError(
    `Ya hay una caja abierta (sesión ${String(session.number)}). Ciérrela antes de abrir otra.`,
    { sessionId: session.id, number: session.number },
    ERROR_CODES.CASH_SESSION_ALREADY_OPEN,
  );
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Caja lógica única (E3; ADR-023): apertura con fondo, cierre con arqueo y correcciones append-only.
 * El módulo NO llama al libro de inventario ni escribe tablas de ventas (AE-5, AE-6). No existen
 * reapertura, gastos, retiros ni movimientos de caja (B6, B7).
 */
export class CashService {
  constructor(private readonly prisma: PrismaClient) {}

  /** C1 · ¿Hay caja abierta? Sin cifras (lo consulta también quien solo vende). */
  async status(): Promise<CashStatus> {
    const session = await this.prisma.cashSession.findFirst({
      where: { status: 'OPEN' },
      include: { openedBy: { select: { name: true } } },
    });
    return {
      open: session !== null,
      session: session
        ? {
            id: session.id,
            number: session.number,
            openedAt: session.openedAt.toISOString(),
            openedByName: session.openedBy.name,
          }
        : null,
    };
  }

  /** C2 · Apertura (idempotente, clave obligatoria). Una sola sesión abierta (índice parcial). */
  async open(input: OpenCashSessionInput, request: FastifyRequest): Promise<CashSessionDetail> {
    const context = requiredIdempotencyOf(request);
    const { user } = getAuth(request);
    const openingAmount = normalizeMoney(input.openingAmount);
    try {
      return await idempotentTransaction(
        this.prisma,
        { context, responseSchema: cashSessionDetailSchema },
        async (tx) => {
          // Repetición después de vencida la clave genérica: la garantía es la columna de dominio.
          const previous = await tx.cashSession.findUnique({
            where: { openRequestId: context.key },
          });
          if (previous) {
            if (
              previous.openedById !== user.id ||
              money(previous.openingAmount) !== openingAmount
            ) {
              throw new IdempotencyKeyReusedError();
            }
            context.onReplay?.();
            return this.loadDetail(tx, previous.id);
          }

          const open = await tx.cashSession.findFirst({ where: { status: 'OPEN' } });
          if (open) throw alreadyOpen(open);

          const session = await tx.cashSession.create({
            data: { openedById: user.id, openingAmount, openRequestId: context.key },
          });
          await recordAudit(
            tx,
            {
              action: 'cash_session.opened',
              entityType: 'CashSession',
              entityId: session.id,
              after: { number: session.number, openingAmount },
            },
            request,
          );
          return this.loadDetail(tx, session.id);
        },
      );
    } catch (error) {
      // Dos aperturas simultáneas: la segunda choca con el índice único parcial al confirmar la
      // primera. Se traduce a 409 con la sesión que quedó abierta.
      if (isUniqueViolation(error)) {
        const open = await this.prisma.cashSession.findFirst({ where: { status: 'OPEN' } });
        if (open) throw alreadyOpen(open);
      }
      throw error;
    }
  }

  /** C3 · Sesión abierta con cifras en vivo; 404 si no hay. */
  async current(): Promise<CashSessionDetail> {
    const open = await this.prisma.cashSession.findFirst({
      where: { status: 'OPEN' },
      select: { id: true },
    });
    if (!open) throw new NotFoundError('No hay una caja abierta');
    return this.loadDetail(this.prisma, open.id);
  }

  async get(id: string): Promise<CashSessionDetail> {
    return this.loadDetail(this.prisma, id);
  }

  /** C4 · Historial de sesiones (más recientes primero). */
  async list(query: CashSessionListQuery): Promise<{
    data: CashSessionSummary[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const where: Prisma.CashSessionWhereInput = {
      ...(query.status !== 'all' && { status: query.status }),
      ...((query.from || query.to) && {
        openedAt: {
          ...(query.from && { gte: dayRangeLaPaz(query.from).start }),
          ...(query.to && { lte: dayRangeLaPaz(query.to).end }),
        },
      }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.cashSession.findMany({
        where,
        include: sessionInclude,
        orderBy: [{ openedAt: 'desc' }, { number: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.cashSession.count({ where }),
    ]);
    const ids = rows.map((row) => row.id);
    const salesBySession = await this.prisma.sale.groupBy({
      by: ['cashSessionId'],
      where: { cashSessionId: { in: ids } },
      _count: { _all: true },
      _sum: { total: true },
    });
    const sales = new Map(salesBySession.map((row) => [row.cashSessionId, row]));
    const data: CashSessionSummary[] = [];
    for (const row of rows) {
      const stats = sales.get(row.id);
      data.push({
        id: row.id,
        number: row.number,
        status: row.status,
        openedAt: row.openedAt.toISOString(),
        openedByName: row.openedBy.name,
        closedAt: row.closedAt?.toISOString() ?? null,
        closedByName: row.closedBy?.name ?? null,
        openingAmount: money(row.openingAmount),
        expectedCash: optionalMoney(row.expectedCash),
        countedCash: optionalMoney(row.countedCash),
        difference: optionalMoney(row.difference),
        salesCount: stats?._count._all ?? 0,
        salesTotal: stats?._sum.total ? money(stats._sum.total) : '0.00',
        current: await this.currentFigures(this.prisma, row),
        correctionsCount: row.corrections.length,
      });
    }
    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /**
   * C6 · Cierre con arqueo (idempotente, clave obligatoria). Orden: repetición → lock_timeout →
   * FOR UPDATE de la sesión (espera a las ventas en curso, que tienen FOR SHARE) → sumas en
   * sentencias POSTERIORES al bloqueo → diferencia → observación obligatoria si ≠ 0 → UPDATE →
   * auditoría. Una venta que llega después ya no encuentra la sesión abierta (422).
   */
  async close(
    id: string,
    input: CloseCashSessionInput,
    request: FastifyRequest,
  ): Promise<CashSessionDetail> {
    const context = requiredIdempotencyOf(request);
    const { user } = getAuth(request);
    return idempotentTransaction(
      this.prisma,
      { context, responseSchema: cashSessionDetailSchema },
      async (tx) => {
        const replay = await this.closeReplay(tx, context, user.id);
        if (replay) return replay;

        // Equivale a SET LOCAL lock_timeout (solo esta transacción), con el valor como parámetro.
        await tx.$queryRaw`SELECT set_config('lock_timeout', ${CLOSE_LOCK_TIMEOUT}, true)`;
        const locked = await lockCashSessionForUpdate(tx, id);
        if (locked.status === 'CLOSED') {
          throw new ConflictError(
            `La caja (sesión ${String(locked.number)}) ya está cerrada.`,
            { sessionId: locked.id, number: locked.number },
            ERROR_CODES.CASH_SESSION_CLOSED,
          );
        }

        const cashSalesTotal = await this.cashSalesTotal(tx, id);
        const plan = planClosing({
          openingAmount: locked.opening_amount,
          cashSalesTotal,
          countedCash: input.countedCash,
          notes: input.notes,
        });
        if (!plan.ok) {
          throw new BusinessRuleError(
            'Hay una diferencia entre el efectivo contado y el esperado: escriba una observación.',
            {
              expectedCash: plan.figures.expectedCash,
              countedCash: plan.figures.countedCash,
              difference: plan.figures.difference,
            },
            ERROR_CODES.CASH_DIFFERENCE_NOTE_REQUIRED,
          );
        }

        const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
        const notes = input.notes ?? null;
        await tx.cashSession.update({
          where: { id },
          data: {
            status: 'CLOSED',
            closedById: user.id,
            closedAt: clock?.now ?? new Date(),
            ...plan.figures,
            notes,
            closeRequestId: context.key,
            closeRequestHash: context.requestHash,
          },
        });
        await recordAudit(
          tx,
          {
            action: 'cash_session.closed',
            entityType: 'CashSession',
            entityId: id,
            before: {
              number: locked.number,
              status: 'OPEN',
              openingAmount: normalizeMoney(locked.opening_amount),
            },
            after: { number: locked.number, status: 'CLOSED', ...plan.figures, notes },
          },
          request,
        );
        return this.loadDetail(tx, id);
      },
    );
  }

  /** C7 · Corrección append-only de un cierre (solo `cash:correct`). No toca la sesión ni ventas. */
  async correct(
    id: string,
    input: CreateCashCorrectionInput,
    request: FastifyRequest,
  ): Promise<CashCorrectionResult> {
    const context = requiredIdempotencyOf(request);
    const { user } = getAuth(request);
    return idempotentTransaction(
      this.prisma,
      { context, responseSchema: cashCorrectionResultSchema },
      async (tx) => {
        const previous = await tx.cashSessionCorrection.findUnique({
          where: { clientRequestId: context.key },
          include: correctionInclude,
        });
        if (previous) {
          if (previous.requestHash !== context.requestHash || previous.correctedById !== user.id) {
            throw new IdempotencyKeyReusedError();
          }
          context.onReplay?.();
          return {
            correction: toCorrection(previous),
            session: await this.loadDetail(tx, previous.cashSessionId),
          };
        }

        // Dos administradores a la vez: el segundo espera aquí y luego ve el valor ya corregido.
        const locked = await lockCashSessionForUpdate(tx, id);
        if (locked.status !== 'CLOSED') {
          throw new ConflictError(
            'Solo se corrige el cierre de una caja ya cerrada.',
            { sessionId: locked.id, number: locked.number },
            ERROR_CODES.CASH_SESSION_NOT_CLOSED,
          );
        }
        const session = await tx.cashSession.findUniqueOrThrow({
          where: { id },
          include: sessionInclude,
        });
        const original = closedOriginal(session);
        if (!original) throw new NotFoundError('Sesión de caja no encontrada');
        const chain = correctionChain(session);
        const before = currentCashFigures(original, chain);

        let previousValue: string | null = null;
        let newValue: string | null = null;
        if (input.kind !== 'NOTE') {
          const current = input.kind === 'COUNTED_CASH' ? before.countedCash : before.openingAmount;
          if (parseMoney(input.expectedPreviousValue) !== parseMoney(current)) {
            throw new ConflictError(
              'El valor cambió mientras corregía (otra persona lo corrigió). Revise el valor vigente.',
              { currentValue: current },
              ERROR_CODES.CASH_CORRECTION_CONFLICT,
            );
          }
          if (parseMoney(input.newValue) === parseMoney(current)) {
            throw new ValidationError('Los datos enviados no son válidos', [
              { field: 'body.newValue', message: 'El valor nuevo es igual al vigente' },
            ]);
          }
          previousValue = current;
          newValue = normalizeMoney(input.newValue);
        }
        const after = currentCashFigures(original, [...chain, { kind: input.kind, newValue }]);

        const correction = await tx.cashSessionCorrection.create({
          data: {
            cashSessionId: id,
            sequence: chain.length + 1,
            kind: input.kind,
            previousValue,
            newValue,
            expectedCashAfter: after.expectedCash,
            countedCashAfter: after.countedCash,
            differenceAfter: after.difference,
            reason: input.reason,
            correctedById: user.id,
            clientRequestId: context.key,
            requestHash: context.requestHash,
          },
          include: correctionInclude,
        });
        await recordAudit(
          tx,
          {
            action: 'cash_session.corrected',
            entityType: 'CashSession',
            entityId: id,
            before: {
              value: previousValue,
              expectedCash: before.expectedCash,
              countedCash: before.countedCash,
              difference: before.difference,
            },
            after: {
              value: newValue,
              expectedCash: after.expectedCash,
              countedCash: after.countedCash,
              difference: after.difference,
            },
            metadata: { kind: input.kind, reason: input.reason, sequence: correction.sequence },
          },
          request,
        );
        return { correction: toCorrection(correction), session: await this.loadDetail(tx, id) };
      },
    );
  }

  /** C8 · Correcciones de una sesión, en orden de secuencia. */
  async corrections(id: string): Promise<CashCorrection[]> {
    const exists = await this.prisma.cashSession.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundError('Sesión de caja no encontrada');
    const rows = await this.prisma.cashSessionCorrection.findMany({
      where: { cashSessionId: id },
      include: correctionInclude,
      orderBy: { sequence: 'asc' },
    });
    return rows.map(toCorrection);
  }

  /** Repetición del cierre por la columna de dominio (cubre una clave genérica ya vencida). */
  private async closeReplay(
    tx: Prisma.TransactionClient,
    context: IdempotencyContext,
    userId: string,
  ): Promise<CashSessionDetail | null> {
    const previous = await tx.cashSession.findUnique({ where: { closeRequestId: context.key } });
    if (!previous) return null;
    if (previous.closeRequestHash !== context.requestHash || previous.closedById !== userId) {
      throw new IdempotencyKeyReusedError();
    }
    context.onReplay?.();
    return this.loadDetail(tx, previous.id);
  }

  /** Σ pagos en efectivo de las ventas de la sesión (mismo cálculo que exige el trigger). */
  private async cashSalesTotal(db: Db, sessionId: string): Promise<string> {
    const [row] = await db.$queryRaw<{ total: string }[]>`
      SELECT COALESCE(sum(p.amount), 0)::text AS total
      FROM sale_payments p JOIN sales s ON s.id = p.sale_id
      WHERE s.cash_session_id = ${sessionId}::uuid AND p.method_is_cash`;
    return normalizeMoney(row?.total ?? '0');
  }

  private async currentFigures(db: Db, session: SessionWithRelations) {
    const original = closedOriginal(session);
    if (original) return currentCashFigures(original, correctionChain(session));
    const live = await this.liveExpectedCash(db, session);
    return {
      openingAmount: money(session.openingAmount),
      expectedCash: live,
      countedCash: null,
      difference: null,
    };
  }

  private async liveExpectedCash(db: Db, session: SessionWithRelations): Promise<string> {
    const cash = await this.cashSalesTotal(db, session.id);
    return formatMoney(parseMoney(money(session.openingAmount)) + parseMoney(cash));
  }

  /** Detalle con cifras originales, vigentes y totales por medio de pago. */
  async loadDetail(db: Db, id: string): Promise<CashSessionDetail> {
    const session = await db.cashSession.findUnique({ where: { id }, include: sessionInclude });
    if (!session) throw new NotFoundError('Sesión de caja no encontrada');

    const methods = await db.$queryRaw<
      { code: string; name: string; isCash: boolean; amount: string; paymentsCount: number }[]
    >`
      SELECT pm.code, pm.name, pm.is_cash AS "isCash",
             COALESCE(sum(p.amount), 0)::text AS amount, count(p.id)::int AS "paymentsCount"
      FROM payment_methods pm
      LEFT JOIN (sale_payments p JOIN sales s ON s.id = p.sale_id AND s.cash_session_id = ${id}::uuid)
        ON p.method_id = pm.id
      GROUP BY pm.id, pm.code, pm.name, pm.is_cash, pm.sort_order, pm.is_active
      HAVING pm.is_active OR count(p.id) > 0
      ORDER BY pm.sort_order, pm.code`;
    const [sales] = await db.$queryRaw<
      { count: number; total: string; mixedCount: number; mixedTotal: string }[]
    >`
      SELECT count(*)::int AS count, COALESCE(sum(s.total), 0)::text AS total,
             count(*) FILTER (WHERE pc.n > 1)::int AS "mixedCount",
             COALESCE(sum(s.total) FILTER (WHERE pc.n > 1), 0)::text AS "mixedTotal"
      FROM sales s
      JOIN LATERAL (SELECT count(*) AS n FROM sale_payments p WHERE p.sale_id = s.id) pc ON true
      WHERE s.cash_session_id = ${id}::uuid`;

    const isOpen = session.status === 'OPEN';
    const lastCorrection = session.corrections.at(-1);
    return {
      id: session.id,
      number: session.number,
      status: session.status,
      openedAt: session.openedAt.toISOString(),
      openedBy: session.openedBy,
      openingAmount: money(session.openingAmount),
      closedAt: session.closedAt?.toISOString() ?? null,
      closedBy: session.closedBy,
      cashSalesTotal: optionalMoney(session.cashSalesTotal),
      expectedCash: optionalMoney(session.expectedCash),
      countedCash: optionalMoney(session.countedCash),
      difference: optionalMoney(session.difference),
      notes: session.notes,
      liveExpectedCash: isOpen ? await this.liveExpectedCash(db, session) : null,
      totalsByMethod: methods.flatMap((method) =>
        isPaymentMethodCode(method.code)
          ? [
              {
                methodCode: method.code,
                methodName: method.name,
                isCash: method.isCash,
                amount: normalizeMoney(method.amount),
                paymentsCount: method.paymentsCount,
              },
            ]
          : [],
      ),
      salesCount: sales?.count ?? 0,
      salesTotal: normalizeMoney(sales?.total ?? '0'),
      mixedSales: {
        count: sales?.mixedCount ?? 0,
        amount: normalizeMoney(sales?.mixedTotal ?? '0'),
      },
      current: await this.currentFigures(db, session),
      corrections: {
        count: session.corrections.length,
        lastAt: lastCorrection?.correctedAt.toISOString() ?? null,
      },
    };
  }
}
