import { PERMISSIONS, createExchangeSchema, exchangeSchema } from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ExchangesService } from './exchanges.service.ts';

const params = z.object({ referenceId: z.uuid() });
const detail = z.object({ data: exchangeSchema });

/**
 * Cambios de pieza (ADR-019). Se registra bajo `/inventory/exchanges`.
 * Registrar exige `inventory:exchange`; consultar un cambio, `inventory:read`. Los costos solo se
 * devuelven con `costs:read` y la auditoría solo con `inventory:exchange` o `audit:read`.
 * La autorización va en `preValidation` para que quien no tiene sesión o permiso reciba 401/403.
 */
export const exchangesRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new ExchangesService(app.prisma);

  app.post(
    '/',
    {
      preValidation: app.requirePermission(PERMISSIONS.INVENTORY_EXCHANGE),
      schema: { body: createExchangeSchema, response: { 201: detail } },
    },
    async (request, reply) =>
      reply.status(201).send({ data: await service.create(request.body, request) }),
  );

  app.get(
    '/:referenceId',
    {
      preValidation: app.requirePermission(PERMISSIONS.INVENTORY_READ),
      schema: { params, response: { 200: detail } },
    },
    async (request) => ({ data: await service.get(request.params.referenceId, request) }),
  );
};
