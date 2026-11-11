import {
  PERMISSIONS,
  cashCorrectionResultSchema,
  cashCorrectionSchema,
  cashSessionDetailSchema,
  cashSessionIdParamsSchema,
  cashSessionListQuerySchema,
  cashSessionSummarySchema,
  cashStatusSchema,
  closeCashSessionSchema,
  createCashCorrectionSchema,
  openCashSessionSchema,
  pageMetaSchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idempotencyHeadersSchema } from '../../plugins/idempotency.ts';
import { CashService } from './cash.service.ts';

const detail = z.strictObject({ data: cashSessionDetailSchema });

/**
 * Caja única (plan 11 §4.4; ADR-023), bajo `/cash`. La autorización va en `preValidation` (401/403
 * antes que 400). Apertura, cierre y corrección EXIGEN `Idempotency-Key`: la primera vez responden
 * 201 (cierre: 200) y una repetición responde 200 con `Idempotent-Replay: true`.
 * No existen PATCH, PUT ni DELETE, reapertura ni movimientos de caja (B6, B7).
 */
export const cashRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new CashService(app.prisma);

  app.get(
    '/status',
    {
      preValidation: app.requireAnyPermission(PERMISSIONS.SALES_CREATE, PERMISSIONS.CASH_READ),
      schema: { response: { 200: z.strictObject({ data: cashStatusSchema }) } },
    },
    async () => ({ data: await service.status() }),
  );

  app.post(
    '/sessions',
    {
      preValidation: app.requirePermission(PERMISSIONS.CASH_OPEN),
      schema: {
        headers: idempotencyHeadersSchema,
        body: openCashSessionSchema,
        response: { 200: detail, 201: detail },
      },
    },
    async (request, reply) => {
      const data = await service.open(request.body, request);
      return reply.status(request.idempotentReplay ? 200 : 201).send({ data });
    },
  );

  app.get(
    '/sessions/current',
    {
      preValidation: app.requirePermission(PERMISSIONS.CASH_READ),
      schema: { response: { 200: detail } },
    },
    async () => ({ data: await service.current() }),
  );

  app.get(
    '/sessions',
    {
      preValidation: app.requirePermission(PERMISSIONS.CASH_READ),
      schema: {
        querystring: cashSessionListQuerySchema,
        response: {
          200: z.strictObject({ data: z.array(cashSessionSummarySchema), meta: pageMetaSchema }),
        },
      },
    },
    async (request) => service.list(request.query),
  );

  app.get(
    '/sessions/:id',
    {
      preValidation: app.requirePermission(PERMISSIONS.CASH_READ),
      schema: { params: cashSessionIdParamsSchema, response: { 200: detail } },
    },
    async (request) => ({ data: await service.get(request.params.id) }),
  );

  app.post(
    '/sessions/:id/close',
    {
      preValidation: app.requirePermission(PERMISSIONS.CASH_CLOSE),
      schema: {
        headers: idempotencyHeadersSchema,
        params: cashSessionIdParamsSchema,
        body: closeCashSessionSchema,
        response: { 200: detail },
      },
    },
    async (request) => ({ data: await service.close(request.params.id, request.body, request) }),
  );

  app.post(
    '/sessions/:id/corrections',
    {
      preValidation: app.requirePermission(PERMISSIONS.CASH_CORRECT),
      schema: {
        headers: idempotencyHeadersSchema,
        params: cashSessionIdParamsSchema,
        body: createCashCorrectionSchema,
        response: {
          200: z.strictObject({ data: cashCorrectionResultSchema }),
          201: z.strictObject({ data: cashCorrectionResultSchema }),
        },
      },
    },
    async (request, reply) => {
      const data = await service.correct(request.params.id, request.body, request);
      return reply.status(request.idempotentReplay ? 200 : 201).send({ data });
    },
  );

  app.get(
    '/sessions/:id/corrections',
    {
      preValidation: app.requirePermission(PERMISSIONS.CASH_READ),
      schema: {
        params: cashSessionIdParamsSchema,
        response: { 200: z.strictObject({ data: z.array(cashCorrectionSchema) }) },
      },
    },
    async (request) => ({ data: await service.corrections(request.params.id) }),
  );
};
