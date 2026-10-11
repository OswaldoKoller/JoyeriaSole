import {
  PERMISSIONS,
  globalInventoryMovementSchema,
  initialStockSchema,
  inventoryItemSchema,
  inventoryMovementSchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { InventoryService } from './inventory.service.ts';

const params = z.object({ variantId: z.uuid() });
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const meta = z.object({ page: z.number(), pageSize: z.number(), total: z.number() });

export const inventoryRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new InventoryService(app.prisma);
  app.get(
    '/movements',
    {
      preHandler: app.requirePermission(PERMISSIONS.INVENTORY_READ),
      schema: {
        querystring: pageQuery,
        response: { 200: z.object({ data: z.array(globalInventoryMovementSchema), meta }) },
      },
    },
    async (request) => service.allMovements(request.query),
  );
  app.get(
    '/',
    {
      preHandler: app.requirePermission(PERMISSIONS.INVENTORY_READ),
      schema: {
        querystring: pageQuery.extend({
          q: z.string().trim().max(100).default(''),
          level: z.enum(['all', 'OUT', 'LOW', 'OK']).default('all'),
          initialOnly: z
            .enum(['true', 'false'])
            .default('false')
            .transform((value) => value === 'true'),
        }),
        response: { 200: z.object({ data: z.array(inventoryItemSchema), meta }) },
      },
    },
    async (request) => service.list(request.query),
  );
  app.get(
    '/:variantId/movements',
    {
      preHandler: app.requirePermission(PERMISSIONS.INVENTORY_READ),
      schema: {
        params,
        querystring: pageQuery,
        response: { 200: z.object({ data: z.array(inventoryMovementSchema), meta }) },
      },
    },
    async (request) => service.movements(request.params.variantId, request.query),
  );
  app.post(
    '/:variantId/initial',
    {
      preHandler: app.requirePermission(PERMISSIONS.INVENTORY_ADJUST),
      schema: {
        params,
        body: initialStockSchema,
        response: { 201: z.object({ data: z.object({ quantity: z.number() }) }) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        data: await service.initialStock(request.params.variantId, request.body, request),
      }),
  );
};
