import {
  PERMISSIONS,
  approvePriceChangesSchema,
  priceChangeSchema,
  priceChangesInputSchema,
  priceChangesQuerySchema,
  pricingMetaSchema,
  pricingVariantSchema,
  pricingVariantsQuerySchema,
  rejectPriceChangesSchema,
  type Permission,
} from '@joyeria/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ForbiddenError } from '../../lib/errors.ts';
import { getAuth } from '../../plugins/auth.ts';
import { PricingService } from './pricing.service.ts';

const idParams = z.object({ id: z.uuid() });
const changes = z.object({ data: z.array(priceChangeSchema) });
const batchResult = z.object({
  data: z.array(priceChangeSchema),
  meta: z.object({ batchId: z.uuid() }),
});

/**
 * Precios de venta (ADR-018). Ver el módulo (panel de costos, historial) exige `prices:propose` o
 * `prices:approve`; el Vendedor no llega a nada de aquí (403). Los costos de cada respuesta solo
 * aparecen con `costs:read`. Solicitar exige `prices:propose`; aprobar, rechazar y cambiar
 * directamente exigen `prices:approve`.
 *
 * La autorización va en `preValidation`: quien no tiene sesión o permiso recibe 401/403 y no un 400
 * con el detalle del esquema.
 */
export const pricingRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new PricingService(app.prisma);

  /** Sesión válida y AL MENOS UNO de los permisos indicados. */
  const requireAny =
    (...allowed: Permission[]) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      await app.authenticate(request, reply);
      const { user } = getAuth(request);
      if (!allowed.some((permission) => user.permissions.includes(permission))) {
        request.log.warn(
          { userId: user.id, required: allowed, url: request.url },
          'security: acceso denegado por permisos',
        );
        throw new ForbiddenError();
      }
    };
  const canView = requireAny(PERMISSIONS.PRICES_PROPOSE, PERMISSIONS.PRICES_APPROVE);

  app.get(
    '/variants',
    {
      preValidation: canView,
      schema: {
        querystring: pricingVariantsQuerySchema,
        response: {
          200: z.object({ data: z.array(pricingVariantSchema), meta: pricingMetaSchema }),
        },
      },
    },
    async (request) => service.listVariants(request.query, request),
  );

  app.get(
    '/variants/:id/history',
    {
      preValidation: canView,
      schema: {
        params: idParams,
        querystring: priceChangesQuerySchema.pick({ page: true, pageSize: true }),
        response: { 200: z.object({ data: z.array(priceChangeSchema), meta: pricingMetaSchema }) },
      },
    },
    async (request) => service.variantHistory(request.params.id, request.query, request),
  );

  app.get(
    '/changes',
    {
      preValidation: canView,
      schema: {
        querystring: priceChangesQuerySchema,
        response: { 200: z.object({ data: z.array(priceChangeSchema), meta: pricingMetaSchema }) },
      },
    },
    async (request) => service.listChanges(request.query, request),
  );

  app.get(
    '/pending-count',
    {
      preValidation: app.requirePermission(PERMISSIONS.PRICES_APPROVE),
      schema: { response: { 200: z.object({ data: z.object({ count: z.number() }) }) } },
    },
    async () => ({ data: await service.pendingCount() }),
  );

  app.post(
    '/requests',
    {
      preValidation: app.requirePermission(PERMISSIONS.PRICES_PROPOSE),
      schema: { body: priceChangesInputSchema, response: { 201: changes } },
    },
    async (request, reply) =>
      reply.status(201).send({ data: await service.createRequests(request.body, request) }),
  );

  app.post(
    '/apply',
    {
      preValidation: app.requirePermission(PERMISSIONS.PRICES_APPROVE),
      schema: { body: priceChangesInputSchema, response: { 201: changes } },
    },
    async (request, reply) =>
      reply.status(201).send({ data: await service.applyDirect(request.body, request) }),
  );

  app.post(
    '/changes/approve',
    {
      preValidation: app.requirePermission(PERMISSIONS.PRICES_APPROVE),
      schema: { body: approvePriceChangesSchema, response: { 200: batchResult } },
    },
    async (request) => {
      const result = await service.approve(request.body.ids, request);
      return { data: result.changes, meta: { batchId: result.batchId } };
    },
  );

  app.post(
    '/changes/reject',
    {
      preValidation: app.requirePermission(PERMISSIONS.PRICES_APPROVE),
      schema: { body: rejectPriceChangesSchema, response: { 200: batchResult } },
    },
    async (request) => {
      const result = await service.reject(request.body.ids, request.body.comment, request);
      return { data: result.changes, meta: { batchId: result.batchId } };
    },
  );

  app.post(
    '/changes/:id/cancel',
    {
      preValidation: app.requirePermission(PERMISSIONS.PRICES_PROPOSE),
      schema: { params: idParams, response: { 200: z.object({ data: priceChangeSchema }) } },
    },
    async (request) => ({ data: await service.cancel(request.params.id, request) }),
  );
};
