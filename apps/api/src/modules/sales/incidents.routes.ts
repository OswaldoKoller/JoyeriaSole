import {
  PERMISSIONS,
  closeSaleIncidentSchema,
  createSaleIncidentSchema,
  pageMetaSchema,
  saleIncidentIdParamsSchema,
  saleIncidentListQuerySchema,
  saleIncidentSchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idempotencyHeadersSchema } from '../../plugins/idempotency.ts';
import { SaleIncidentsService } from './incidents.service.ts';

const detail = z.strictObject({ data: saleIncidentSchema });

/**
 * Incidencias de venta (plan 11 §4.6 N1–N4), bajo `/sale-incidents`. Reportan Vendedor y
 * Responsable (`sales-incidents:report`); ven y cierran solo quienes tienen
 * `sales-incidents:manage` (Administrador). Sin PATCH, PUT ni DELETE.
 */
export const saleIncidentsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new SaleIncidentsService(app.prisma);
  const manage = app.requirePermission(PERMISSIONS.SALES_INCIDENTS_MANAGE);

  app.post(
    '/',
    {
      preValidation: app.requirePermission(PERMISSIONS.SALES_INCIDENTS_REPORT),
      schema: {
        headers: idempotencyHeadersSchema,
        body: createSaleIncidentSchema,
        response: { 200: detail, 201: detail },
      },
    },
    async (request, reply) => {
      const data = await service.report(request.body, request);
      return reply.status(request.idempotentReplay ? 200 : 201).send({ data });
    },
  );

  app.get(
    '/',
    {
      preValidation: manage,
      schema: {
        querystring: saleIncidentListQuerySchema,
        response: {
          200: z.strictObject({ data: z.array(saleIncidentSchema), meta: pageMetaSchema }),
        },
      },
    },
    async (request) => service.list(request.query),
  );

  app.get(
    '/:id',
    {
      preValidation: manage,
      schema: { params: saleIncidentIdParamsSchema, response: { 200: detail } },
    },
    async (request) => ({ data: await service.get(request.params.id) }),
  );

  app.post(
    '/:id/close',
    {
      preValidation: manage,
      schema: {
        params: saleIncidentIdParamsSchema,
        body: closeSaleIncidentSchema,
        response: { 200: detail },
      },
    },
    async (request) => ({ data: await service.close(request.params.id, request.body, request) }),
  );
};
