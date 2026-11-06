import {
  PERMISSIONS,
  createStockEntryCostTypeSchema,
  stockEntryCostTypeSchema,
  updateStockEntryCostTypeSchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CostTypesService } from './cost-types.service.ts';

const idParams = z.object({ id: z.uuid() });
const one = z.object({ data: stockEntryCostTypeSchema });

/**
 * Tipos de costo adicional de un ingreso (Q-08). Leerlos lo necesita quien registra ingresos;
 * agregarlos o desactivarlos es configuración del sistema: solo `settings:manage` (Administrador).
 */
export const costTypesRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new CostTypesService(app.prisma);

  app.get(
    '/',
    {
      preValidation: app.requirePermission(PERMISSIONS.STOCK_ENTRIES_READ),
      schema: { response: { 200: z.object({ data: z.array(stockEntryCostTypeSchema) }) } },
    },
    async () => ({ data: await service.list() }),
  );

  app.post(
    '/',
    {
      preValidation: app.requirePermission(PERMISSIONS.SETTINGS_MANAGE),
      schema: { body: createStockEntryCostTypeSchema, response: { 201: one } },
    },
    async (request, reply) =>
      reply.status(201).send({ data: await service.create(request.body, request) }),
  );

  app.patch(
    '/:id',
    {
      preValidation: app.requirePermission(PERMISSIONS.SETTINGS_MANAGE),
      schema: { params: idParams, body: updateStockEntryCostTypeSchema, response: { 200: one } },
    },
    async (request) => ({
      data: await service.update(request.params.id, request.body, request),
    }),
  );
};
