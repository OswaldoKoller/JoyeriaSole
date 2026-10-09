import type { FastifyRequest } from 'fastify';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.ts';

/** Cliente normal o cliente de transacción: la auditoría debe escribirse en la MISMA transacción
 *  que la operación de negocio, para que no exista una sin la otra. */
type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  action: string;
  userId?: string | null;
  entityType?: string;
  entityId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}

export function recordAudit(db: Db, entry: AuditEntry, request?: FastifyRequest) {
  return db.auditLog.create({
    data: {
      action: entry.action,
      userId: entry.userId ?? request?.auth?.user.id ?? null,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      ...(entry.before !== undefined && { before: entry.before }),
      ...(entry.after !== undefined && { after: entry.after }),
      ...(entry.metadata !== undefined && { metadata: entry.metadata }),
      ip: request?.ip ?? null,
      userAgent: request?.headers['user-agent']?.slice(0, 500) ?? null,
      requestId: request?.id ?? null,
    },
  });
}
