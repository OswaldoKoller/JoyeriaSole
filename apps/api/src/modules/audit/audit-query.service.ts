import type { AuditDetail, AuditEntry, AuditFilters, AuditListQuery } from '@joyeria/shared';
import type { Prisma } from '../../generated/prisma/client.ts';
import { NotFoundError } from '../../lib/errors.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { redactSensitive, type JsonValue } from './audit-redaction.ts';

/** Tope de valores distintos que se devuelven para poblar los filtros. */
const FILTER_LIMIT = 300;

const include = { user: { select: { id: true, name: true, email: true } } } as const;
type Row = Prisma.AuditLogGetPayload<{ include: typeof include }>;

const json = (value: Prisma.JsonValue | null): JsonValue | null =>
  value === null ? null : redactSensitive(value as JsonValue);

/** Prisma no escapa los comodines de LIKE (% _) en contains/startsWith: se escapan aquí. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, '\\$&');

function toEntry(row: Row): AuditEntry {
  return {
    id: row.id.toString(),
    createdAt: row.createdAt.toISOString(),
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    user: row.user,
    ip: row.ip,
    requestId: row.requestId,
    before: json(row.before),
    after: json(row.after),
    metadata: json(row.metadata),
  };
}

/**
 * Consulta de la auditoría (solo lectura). Los registros son append-only: este servicio no
 * tiene ninguna operación de escritura (las escrituras viven en `recordAudit`).
 */
export class AuditQueryService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: AuditListQuery) {
    const where = this.buildWhere(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      data: rows.map(toEntry),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async detail(id: string): Promise<AuditDetail> {
    const row = await this.prisma.auditLog.findUnique({ where: { id: BigInt(id) }, include });
    if (!row) throw new NotFoundError('Registro de auditoría no encontrado');
    return { ...toEntry(row), userAgent: row.userAgent };
  }

  async filters(): Promise<AuditFilters> {
    const [actions, entityTypes, userIds] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
        take: FILTER_LIMIT,
      }),
      this.prisma.auditLog.findMany({
        distinct: ['entityType'],
        where: { entityType: { not: null } },
        select: { entityType: true },
        orderBy: { entityType: 'asc' },
        take: FILTER_LIMIT,
      }),
      this.prisma.auditLog.findMany({
        distinct: ['userId'],
        where: { userId: { not: null } },
        select: { userId: true },
        take: FILTER_LIMIT,
      }),
    ]);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds.flatMap((row) => (row.userId ? [row.userId] : [])) } },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
    return {
      actions: actions.map((row) => row.action),
      entityTypes: entityTypes.flatMap((row) => (row.entityType ? [row.entityType] : [])),
      users,
    };
  }

  /** Where de Prisma: los valores van parametrizados (nada se concatena). */
  private buildWhere(query: AuditListQuery): Prisma.AuditLogWhereInput {
    const and: Prisma.AuditLogWhereInput[] = [];
    if (query.userId) and.push({ userId: query.userId });
    if (query.action) {
      // «price.» o «price.*» filtra por prefijo; un código completo, por coincidencia exacta.
      const isPrefix = query.action.endsWith('.') || query.action.endsWith('*');
      and.push({
        action: isPrefix
          ? { startsWith: escapeLike(query.action.replace(/\*$/, '')) }
          : { equals: query.action },
      });
    }
    if (query.entityType) and.push({ entityType: query.entityType });
    if (query.entityId) and.push({ entityId: query.entityId });
    if (query.from || query.to) {
      and.push({
        createdAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: new Date(query.to) }),
        },
      });
    }
    if (query.q) {
      const contains = { contains: escapeLike(query.q), mode: 'insensitive' as const };
      and.push({
        OR: [
          { action: contains },
          { entityType: contains },
          { entityId: contains },
          { user: { is: { OR: [{ name: contains }, { email: contains }] } } },
        ],
      });
    }
    return and.length > 0 ? { AND: and } : {};
  }
}
