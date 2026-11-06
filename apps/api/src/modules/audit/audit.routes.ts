import {
  PERMISSIONS,
  auditDetailSchema,
  auditEntrySchema,
  auditFiltersSchema,
  auditIdParamsSchema,
  auditListQuerySchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AuditQueryService } from './audit-query.service.ts';

const meta = z.object({ page: z.number(), pageSize: z.number(), total: z.number() });

/**
 * Consulta de auditoría: solo lectura y solo para quien tenga `audit:read` (Administrador, Q-15.3).
 * No hay rutas de escritura: la auditoría es append-only.
 */
export const auditRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new AuditQueryService(app.prisma);

  app.get(
    '/',
    {
      preValidation: app.requirePermission(PERMISSIONS.AUDIT_READ),
      schema: {
        querystring: auditListQuerySchema,
        response: { 200: z.object({ data: z.array(auditEntrySchema), meta }) },
      },
    },
    async (request) => service.list(request.query),
  );

  app.get(
    '/actions',
    {
      preValidation: app.requirePermission(PERMISSIONS.AUDIT_READ),
      schema: { response: { 200: z.object({ data: auditFiltersSchema }) } },
    },
    async () => ({ data: await service.filters() }),
  );

  app.get(
    '/:id',
    {
      preValidation: app.requirePermission(PERMISSIONS.AUDIT_READ),
      schema: {
        params: auditIdParamsSchema,
        response: { 200: z.object({ data: auditDetailSchema }) },
      },
    },
    async (request) => ({ data: await service.detail(request.params.id) }),
  );
};
