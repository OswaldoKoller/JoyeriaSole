import {
  dayRangeLaPaz,
  PERMISSIONS,
  saleIncidentSchema,
  type CloseSaleIncidentInput,
  type CreateSaleIncidentInput,
  type SaleIncident,
  type SaleIncidentListQuery,
} from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.ts';
import { ConflictError, IdempotencyKeyReusedError, NotFoundError } from '../../lib/errors.ts';
import { idempotentTransaction } from '../../lib/idempotency.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { getAuth } from '../../plugins/auth.ts';
import { requiredIdempotencyOf } from '../../plugins/idempotency.ts';
import { recordAudit } from '../audit/audit.service.ts';

type Db = PrismaClient | Prisma.TransactionClient;

const incidentInclude = {
  sale: { select: { id: true, number: true } },
  reportedBy: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
} satisfies Prisma.SaleIncidentInclude;
type IncidentWithRelations = Prisma.SaleIncidentGetPayload<{ include: typeof incidentInclude }>;

function toIncident(row: IncidentWithRelations): SaleIncident {
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    description: row.description,
    status: row.status,
    sale: row.sale,
    reportedBy: row.reportedBy,
    reportedAt: row.reportedAt.toISOString(),
    resolution: row.resolution,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

/**
 * Incidencias de venta (C5, C6; D-10 y D-11 por defecto, ver X-1): SOLO trazabilidad. Este servicio
 * no importa el módulo de inventario ni el de caja y no escribe ventas: solo `sale_incidents` y la
 * auditoría. La incidencia NO modifica la venta, el stock, los pagos ni la caja (DEC-V07).
 */
export class SaleIncidentsService {
  constructor(private readonly prisma: PrismaClient) {}

  /** N1 · Reportar (Vendedor, Responsable y Administrador). Clave de idempotencia obligatoria. */
  async report(input: CreateSaleIncidentInput, request: FastifyRequest): Promise<SaleIncident> {
    const context = requiredIdempotencyOf(request);
    const { user } = getAuth(request);
    return idempotentTransaction(
      this.prisma,
      { context, responseSchema: saleIncidentSchema },
      async (tx) => {
        const saleId = await this.visibleSaleId(tx, input.saleNumber, request);
        const previous = await tx.saleIncident.findUnique({
          where: { clientRequestId: context.key },
          include: incidentInclude,
        });
        if (previous) {
          const same =
            previous.reportedById === user.id &&
            previous.kind === input.kind &&
            previous.description === input.description &&
            previous.saleId === saleId;
          if (!same) throw new IdempotencyKeyReusedError();
          context.onReplay?.();
          return toIncident(previous);
        }
        const incident = await tx.saleIncident.create({
          data: {
            kind: input.kind,
            description: input.description,
            saleId,
            reportedById: user.id,
            clientRequestId: context.key,
          },
          include: incidentInclude,
        });
        await recordAudit(
          tx,
          {
            action: 'sale_incident.reported',
            entityType: 'SaleIncident',
            entityId: incident.id,
            after: {
              number: incident.number,
              kind: incident.kind,
              description: incident.description,
              saleId,
              saleNumber: incident.sale?.number ?? null,
            },
          },
          request,
        );
        return toIncident(incident);
      },
    );
  }

  /** N2 · Listado (solo `sales-incidents:manage`), más recientes primero. */
  async list(
    query: SaleIncidentListQuery,
  ): Promise<{ data: SaleIncident[]; meta: { page: number; pageSize: number; total: number } }> {
    const where: Prisma.SaleIncidentWhereInput = {
      ...(query.status !== 'all' && { status: query.status }),
      ...((query.from || query.to) && {
        reportedAt: {
          ...(query.from && { gte: dayRangeLaPaz(query.from).start }),
          ...(query.to && { lte: dayRangeLaPaz(query.to).end }),
        },
      }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.saleIncident.findMany({
        where,
        include: incidentInclude,
        orderBy: [{ reportedAt: 'desc' }, { number: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.saleIncident.count({ where }),
    ]);
    return {
      data: rows.map(toIncident),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async get(id: string): Promise<SaleIncident> {
    return this.load(this.prisma, id);
  }

  /** N4 · Cerrar con la resolución (lo resuelto fuera del sistema). Cerrar dos veces → 409. */
  async close(
    id: string,
    input: CloseSaleIncidentInput,
    request: FastifyRequest,
  ): Promise<SaleIncident> {
    const { user } = getAuth(request);
    return this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status::text AS status FROM sale_incidents WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked) throw new NotFoundError('Incidencia no encontrada');
      if (locked.status !== 'OPEN') throw new ConflictError('La incidencia ya está cerrada');
      const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
      await tx.saleIncident.update({
        where: { id },
        data: {
          status: 'CLOSED',
          resolution: input.resolution,
          resolvedById: user.id,
          resolvedAt: clock?.now ?? new Date(),
        },
      });
      const incident = await this.load(tx, id);
      await recordAudit(
        tx,
        {
          action: 'sale_incident.closed',
          entityType: 'SaleIncident',
          entityId: id,
          before: { status: 'OPEN' },
          after: { status: 'CLOSED', resolution: input.resolution },
        },
        request,
      );
      return incident;
    });
  }

  private async load(db: Db, id: string): Promise<SaleIncident> {
    const row = await db.saleIncident.findUnique({ where: { id }, include: incidentInclude });
    if (!row) throw new NotFoundError('Incidencia no encontrada');
    return toIncident(row);
  }

  /**
   * Venta referida por su número. Quien no tiene `sales:read-all` solo puede referir ventas propias;
   * una ajena o inexistente responde 404 (no revela que exista).
   */
  private async visibleSaleId(
    db: Db,
    saleNumber: number | undefined,
    request: FastifyRequest,
  ): Promise<string | null> {
    if (saleNumber === undefined) return null;
    const { user } = getAuth(request);
    const sale = await db.sale.findUnique({
      where: { number: saleNumber },
      select: { id: true, sellerId: true },
    });
    const readAll = user.permissions.includes(PERMISSIONS.SALES_READ_ALL);
    if (!sale || (!readAll && sale.sellerId !== user.id)) {
      throw new NotFoundError('Venta no encontrada');
    }
    return sale.id;
  }
}
