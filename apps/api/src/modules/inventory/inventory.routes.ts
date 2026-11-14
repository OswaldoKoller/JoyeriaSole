import {
  INVENTORY_LEVELS,
  PERMISSIONS,
  globalInventoryMovementSchema,
  initialStockResultSchema,
  initialStockSchema,
  inventoryItemSchema,
  inventoryMovementSchema,
  movementFiltersObject,
  withValidDateRange,
} from '@joyeria/shared';
import type { FastifyReply } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idempotencyHeadersSchema } from '../../plugins/idempotency.ts';
import { InventoryExportService, type CsvExport } from './inventory-export.service.ts';
import { InventoryService } from './inventory.service.ts';

const params = z.object({ variantId: z.uuid() });
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const movementsQuery = withValidDateRange(pageQuery.extend(movementFiltersObject.shape));
const balancesFilters = z.object({
  q: z.string().trim().max(100).default(''),
  level: z.enum(INVENTORY_LEVELS).default('all'),
});
/** Cuerpo del CSV: se transmite como flujo, así que la respuesta no se serializa con Zod. */
const csvResponse = z.string();
/** Las exportaciones leen mucho y dejan rastro de auditoría: tope por minuto más estricto. */
const EXPORT_RATE_LIMIT = { max: 20, timeWindow: '1 minute' } as const;
const meta = z.object({ page: z.number(), pageSize: z.number(), total: z.number() });

export const inventoryRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new InventoryService(app.prisma);
  const exportService = new InventoryExportService(app.prisma);
  /** Cabeceras de una descarga CSV: adjunto con nombre con fecha, sin caché, sin adivinar el tipo. */
  const sendCsv = (reply: FastifyReply, file: CsvExport) =>
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${file.filename}"`)
      .header('x-content-type-options', 'nosniff')
      .header('x-export-rows', String(file.rows))
      .send(file.stream);
  app.get(
    '/export.csv',
    {
      preValidation: app.requirePermission(PERMISSIONS.INVENTORY_READ),
      config: { rateLimit: EXPORT_RATE_LIMIT },
      schema: { querystring: balancesFilters, response: { 200: csvResponse } },
    },
    async (request, reply) => sendCsv(reply, await exportService.balances(request.query, request)),
  );
  app.get(
    '/movements/export.csv',
    {
      preValidation: app.requirePermission(PERMISSIONS.INVENTORY_READ),
      config: { rateLimit: EXPORT_RATE_LIMIT },
      schema: {
        querystring: withValidDateRange(movementFiltersObject),
        response: { 200: csvResponse },
      },
    },
    async (request, reply) => sendCsv(reply, await exportService.movements(request.query, request)),
  );
  app.get(
    '/movements',
    {
      preValidation: app.requirePermission(PERMISSIONS.INVENTORY_READ),
      schema: {
        querystring: movementsQuery,
        response: { 200: z.object({ data: z.array(globalInventoryMovementSchema), meta }) },
      },
    },
    async (request) => service.allMovements(request.query, request),
  );
  app.get(
    '/',
    {
      preValidation: app.requirePermission(PERMISSIONS.INVENTORY_READ),
      schema: {
        querystring: pageQuery.extend(balancesFilters.shape).extend({
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
      preValidation: app.requirePermission(PERMISSIONS.INVENTORY_READ),
      schema: {
        params,
        querystring: pageQuery,
        response: { 200: z.object({ data: z.array(inventoryMovementSchema), meta }) },
      },
    },
    async (request) => service.movements(request.params.variantId, request.query, request),
  );
  app.post(
    '/:variantId/initial',
    {
      preValidation: app.requirePermission(PERMISSIONS.INVENTORY_INITIAL_STOCK),
      schema: {
        headers: idempotencyHeadersSchema,
        params,
        body: initialStockSchema,
        response: { 201: z.object({ data: initialStockResultSchema }) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        data: await service.initialStock(request.params.variantId, request.body, request),
      }),
  );
};
