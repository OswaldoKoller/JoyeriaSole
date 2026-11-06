import { PERMISSIONS, costHistoryEntrySchema } from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { StockEntriesService } from './stock-entries.service.ts';

/**
 * Historial de costos de una variante (C10): las compras confirmadas con su precio original,
 * tipo de cambio, costos adicionales y costo total unitario. Solo con `costs:read`.
 * Se registra bajo `/products` (junto a `/products/variants/:id/barcode`).
 */
export const costHistoryRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new StockEntriesService(app.prisma);

  app.get(
    '/variants/:id/cost-history',
    {
      preValidation: app.requirePermission(PERMISSIONS.COSTS_READ),
      schema: {
        params: z.object({ id: z.uuid() }),
        querystring: z.object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        }),
        response: {
          200: z.object({
            data: z.array(costHistoryEntrySchema),
            meta: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
          }),
        },
      },
    },
    async (request) =>
      service.costHistory(request.params.id, request.query.page, request.query.pageSize),
  );
};
