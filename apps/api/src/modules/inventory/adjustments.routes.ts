import {
  PERMISSIONS,
  adjustmentDetailSchema,
  adjustmentListQuerySchema,
  adjustmentReasonSchema,
  adjustmentSummarySchema,
  createAdjustmentSchema,
  rejectAdjustmentSchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idempotencyHeadersSchema } from '../../plugins/idempotency.ts';
import { AdjustmentsService } from './adjustments.service.ts';

const idParams = z.object({ id: z.uuid() });
const detail = z.object({ data: adjustmentDetailSchema });

/**
 * Ajustes manuales con solicitud y aprobación (ADR-017). Se registra bajo `/inventory/adjustments`.
 * Quien tiene `inventory:adjust` solicita, consulta y cancela lo suyo; solo `inventory:adjust-approve`
 * (Administrador) aprueba o rechaza. El stock cambia ÚNICAMENTE al aprobar.
 *
 * La autorización va en `preValidation` (no `preHandler`) para que quien no tiene sesión o permiso
 * reciba 401/403 y no un 400 con el detalle del esquema.
 */
export const adjustmentsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new AdjustmentsService(app.prisma);
  const canRequest = app.requirePermission(PERMISSIONS.INVENTORY_ADJUST);
  const canApprove = app.requirePermission(PERMISSIONS.INVENTORY_ADJUST_APPROVE);

  app.get(
    '/reasons',
    {
      preValidation: canRequest,
      schema: { response: { 200: z.object({ data: z.array(adjustmentReasonSchema) }) } },
    },
    async () => ({ data: await service.reasons() }),
  );

  // Contador para la bandeja del Administrador (Q-14). Declarada antes de `/:id`.
  app.get(
    '/pending-count',
    {
      preValidation: canApprove,
      schema: { response: { 200: z.object({ data: z.object({ count: z.number() }) }) } },
    },
    async () => ({ data: await service.pendingCount() }),
  );

  app.get(
    '/',
    {
      preValidation: canRequest,
      schema: {
        querystring: adjustmentListQuerySchema,
        response: {
          200: z.object({
            data: z.array(adjustmentSummarySchema),
            meta: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
          }),
        },
      },
    },
    async (request) => service.list(request.query, request),
  );

  app.get(
    '/:id',
    { preValidation: canRequest, schema: { params: idParams, response: { 200: detail } } },
    async (request) => ({ data: await service.get(request.params.id, request) }),
  );

  app.post(
    '/',
    {
      preValidation: canRequest,
      schema: { body: createAdjustmentSchema, response: { 201: detail } },
    },
    async (request, reply) =>
      reply.status(201).send({ data: await service.create(request.body, request) }),
  );

  app.post(
    '/:id/cancel',
    { preValidation: canRequest, schema: { params: idParams, response: { 200: detail } } },
    async (request) => ({ data: await service.cancel(request.params.id, request) }),
  );

  app.post(
    '/:id/approve',
    {
      preValidation: canApprove,
      schema: { headers: idempotencyHeadersSchema, params: idParams, response: { 200: detail } },
    },
    async (request) => ({ data: await service.approve(request.params.id, request) }),
  );

  app.post(
    '/:id/reject',
    {
      preValidation: canApprove,
      schema: { params: idParams, body: rejectAdjustmentSchema, response: { 200: detail } },
    },
    async (request) => ({
      data: await service.reject(request.params.id, request.body, request),
    }),
  );
};
