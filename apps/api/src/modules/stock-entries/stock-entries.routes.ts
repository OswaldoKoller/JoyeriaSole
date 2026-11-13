import {
  PERMISSIONS,
  createStockEntrySchema,
  quickCreateStockEntryItemSchema,
  quickCreateStockEntryResponseSchema,
  replaceStockEntryCostsSchema,
  replaceStockEntryItemsSchema,
  stockEntryDetailSchema,
  stockEntryListQuerySchema,
  stockEntrySummarySchema,
  updateStockEntrySchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idempotencyHeadersSchema } from '../../plugins/idempotency.ts';
import { StockEntriesService } from './stock-entries.service.ts';

const idParams = z.object({ id: z.uuid() });
const detail = z.object({ data: stockEntryDetailSchema });

/**
 * Ingresos de mercadería. Un ingreso NO cambia el stock mientras sea borrador: solo la
 * confirmación (permiso propio) genera movimientos, saldos y último costo.
 *
 * Costos: quien carga precios, costos adicionales o confirma necesita además `costs:read`; sin
 * ese permiso las respuestas de lectura ocultan todo dato de costo (el Vendedor no ve ninguno).
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
    async (request) => service.list(request.query, request),
  );

  app.get(
    '/:id',
    {
      preValidation: app.requirePermission(PERMISSIONS.STOCK_ENTRIES_READ),
      schema: { params: idParams, response: { 200: detail } },
    },
    async (request) => ({ data: await service.get(request.params.id, request) }),
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
      preValidation: app.requirePermission(
        PERMISSIONS.STOCK_ENTRIES_MANAGE,
        PERMISSIONS.COSTS_READ,
      ),
      schema: { params: idParams, body: replaceStockEntryItemsSchema, response: { 200: detail } },
    },
    async (request) => ({
      data: await service.replaceItems(request.params.id, request.body, request),
    }),
  );

  app.put(
    '/:id/costs',
    {
      preValidation: app.requirePermission(
        PERMISSIONS.STOCK_ENTRIES_MANAGE,
        PERMISSIONS.COSTS_READ,
      ),
      schema: { params: idParams, body: replaceStockEntryCostsSchema, response: { 200: detail } },
    },
    async (request) => ({
      data: await service.replaceCosts(request.params.id, request.body, request),
    }),
  );

  // Alta rápida de una pieza nueva dentro del borrador (C1/P-24): crea producto + variante + ítem.
  app.post(
    '/:id/items/quick',
    {
      preValidation: app.requirePermission(
        PERMISSIONS.STOCK_ENTRIES_MANAGE,
        PERMISSIONS.CATALOG_MANAGE,
        PERMISSIONS.COSTS_READ,
      ),
      schema: {
        params: idParams,
        body: quickCreateStockEntryItemSchema,
        response: { 201: quickCreateStockEntryResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await service.quickCreateItem(request.params.id, request.body, request);
      return reply.status(201).send({
        data: result.detail,
        meta: {
          variantId: result.variantId,
          productId: result.productId,
          warnings: result.warnings,
        },
      });
    },
  );

  app.post(
    '/:id/confirm',
    {
      preValidation: app.requirePermission(
        PERMISSIONS.STOCK_ENTRIES_CONFIRM,
        PERMISSIONS.COSTS_READ,
      ),
      schema: { headers: idempotencyHeadersSchema, params: idParams, response: { 200: detail } },
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
