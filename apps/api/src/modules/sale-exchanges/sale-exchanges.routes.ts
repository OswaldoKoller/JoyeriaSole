import {
  PERMISSIONS,
  createSaleExchangeSchema,
  saleExchangeDetailSchema,
  saleExchangeIdParamsSchema,
  saleExchangeListQuerySchema,
  saleExchangeListSchema,
  saleExchangeLookupQuerySchema,
  saleExchangeLookupSchema,
  saleExchangeReceiptSchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idempotencyHeadersSchema } from '../../plugins/idempotency.ts';
import { SaleExchangesService } from './sale-exchanges.service.ts';

const detail = z.strictObject({ data: saleExchangeDetailSchema });

/**
 * Cambio de pieza de una venta (ADR-026), bajo `/sale-exchanges`. Autorización en `preValidation`.
 * `POST /` EXIGE `Idempotency-Key`: 201 la primera vez, 200 + `Idempotent-Replay: true` al repetir.
 * Un cambio registrado no se edita ni se borra: solo hay alta y consulta (sin PATCH, PUT ni DELETE).
 */
export const saleExchangesRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new SaleExchangesService(app.prisma);
  const canRead = app.requireAnyPermission(
    PERMISSIONS.SALES_EXCHANGE,
    PERMISSIONS.SALES_READ,
    PERMISSIONS.SALES_READ_ALL,
  );

  app.get(
    '/lookup',
    {
      preValidation: app.requirePermission(PERMISSIONS.SALES_EXCHANGE),
      schema: {
        querystring: saleExchangeLookupQuerySchema,
        response: { 200: z.strictObject({ data: saleExchangeLookupSchema }) },
      },
    },
    async (request) => ({ data: await service.lookup(request.query.number) }),
  );

  app.post(
    '/',
    {
      preValidation: app.requirePermission(PERMISSIONS.SALES_EXCHANGE),
      schema: {
        headers: idempotencyHeadersSchema,
        body: createSaleExchangeSchema,
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
        querystring: saleExchangeListQuerySchema,
        response: { 200: saleExchangeListSchema },
      },
    },
    async (request) => service.list(request.query, request),
  );

  app.get(
    '/:id',
    {
      preValidation: canRead,
      schema: { params: saleExchangeIdParamsSchema, response: { 200: detail } },
    },
    async (request) => ({ data: await service.get(request.params.id, request) }),
  );

  app.get(
    '/:id/receipt',
    {
      preValidation: canRead,
      schema: {
        params: saleExchangeIdParamsSchema,
        response: { 200: z.strictObject({ data: saleExchangeReceiptSchema }) },
      },
    },
    async (request) => ({ data: await service.receipt(request.params.id, request) }),
  );
};
