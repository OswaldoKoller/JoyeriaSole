import {
  PERMISSIONS,
  createSaleSchema,
  pageMetaSchema,
  saleDetailSchema,
  saleIdParamsSchema,
  saleListQuerySchema,
  saleSummarySchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idempotencyHeadersSchema } from '../../plugins/idempotency.ts';
import { SalesService } from './sales.service.ts';

const detail = z.strictObject({ data: saleDetailSchema });

/**
 * Ventas de mostrador (plan 11 §4.5; ADR-022), bajo `/sales`. Autorización en `preValidation`.
 * `POST /sales` EXIGE `Idempotency-Key`: 201 la primera vez, 200 + `Idempotent-Replay: true` al
 * repetir. Una venta confirmada no se anula ni se modifica (DEC-V07): solo existen rutas de alta y
 * de consulta (sin PATCH, PUT ni DELETE).
 */
export const salesRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new SalesService(app.prisma);
  const canRead = app.requireAnyPermission(PERMISSIONS.SALES_READ, PERMISSIONS.SALES_READ_ALL);

  app.post(
    '/',
    {
      preValidation: app.requirePermission(PERMISSIONS.SALES_CREATE),
      schema: {
        headers: idempotencyHeadersSchema,
        body: createSaleSchema,
        response: { 200: detail, 201: detail },
      },
    },
    async (request, reply) => {
      const data = await service.create(request.body, request);
      return reply.status(request.idempotentReplay ? 200 : 201).send({ data });
    },
  );

  app.get(
    '/',
    {
      preValidation: canRead,
      schema: {
        querystring: saleListQuerySchema,
        response: {
          200: z.strictObject({ data: z.array(saleSummarySchema), meta: pageMetaSchema }),
        },
      },
    },
    async (request) => service.list(request.query, request),
  );

  app.get(
    '/:id',
    {
      preValidation: canRead,
      schema: { params: saleIdParamsSchema, response: { 200: detail } },
    },
    async (request) => ({ data: await service.get(request.params.id, request) }),
  );
};
