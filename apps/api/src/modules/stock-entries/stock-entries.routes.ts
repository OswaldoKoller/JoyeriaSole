import {
  PERMISSIONS,
  createStockEntrySchema,
  replaceStockEntryItemsSchema,
  stockEntryDetailSchema,
  stockEntryListQuerySchema,
  stockEntrySummarySchema,
  updateStockEntrySchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { StockEntriesService } from './stock-entries.service.ts';

const idParams = z.object({ id: z.uuid() });
const detail = z.object({ data: stockEntryDetailSchema });

/**
 * Ingresos de mercadería (roadmap, orden 2). Un ingreso NO cambia el stock mientras sea borrador:
 * solo la confirmación (permiso propio) genera movimientos, saldos y último costo.
 *
 * La autorización va en `preValidation` (no en `preHandler`): Fastify valida el cuerpo antes del
 * `preHandler`, y quien no tiene sesión o permiso recibiría un 400 con el detalle del esquema en
 * lugar de 401/403.
 */
export const stockEntriesRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new StockEntriesService(app.prisma);

  app.get(
    '/',
    {
      preValidation: app.requirePermission(PERMISSIONS.STOCK_ENTRIES_READ),
      schema: {
        querystring: stockEntryListQuerySchema,
        response: {
          200: z.object({
            data: z.array(stockEntrySummarySchema),
            meta: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
          }),
        },
      },
    },
    async (request) => service.list(request.query),
  );

  app.get(
    '/:id',
    {
      preValidation: app.requirePermission(PERMISSIONS.STOCK_ENTRIES_READ),
      schema: { params: idParams, response: { 200: detail } },
    },
    async (request) => ({ data: await service.get(request.params.id) }),
  );

  app.post(
    '/',
    {
      preValidation: app.requirePermission(PERMISSIONS.STOCK_ENTRIES_MANAGE),
      schema: { body: createStockEntrySchema, response: { 201: detail } },
    },
    async (request, reply) =>
      reply.status(201).send({ data: await service.create(request.body, request) }),
  );

  app.patch(
    '/:id',
    {
      preValidation: app.requirePermission(PERMISSIONS.STOCK_ENTRIES_MANAGE),
      schema: { params: idParams, body: updateStockEntrySchema, response: { 200: detail } },
    },
    async (request) => ({
      data: await service.update(request.params.id, request.body, request),
    }),
  );

  app.put(
    '/:id/items',
    {
      preValidation: app.requirePermission(PERMISSIONS.STOCK_ENTRIES_MANAGE),
      schema: { params: idParams, body: replaceStockEntryItemsSchema, response: { 200: detail } },
    },
    async (request) => ({
      data: await service.replaceItems(request.params.id, request.body, request),
    }),
  );

  app.post(
    '/:id/confirm',
    {
      preValidation: app.requirePermission(PERMISSIONS.STOCK_ENTRIES_CONFIRM),
      schema: { params: idParams, response: { 200: detail } },
    },
    async (request) => ({ data: await service.confirm(request.params.id, request) }),
  );

  app.post(
    '/:id/cancel',
    {
      preValidation: app.requirePermission(PERMISSIONS.STOCK_ENTRIES_MANAGE),
      schema: { params: idParams, response: { 200: detail } },
    },
    async (request) => ({ data: await service.cancel(request.params.id, request) }),
  );
};
