import {
  PERMISSIONS,
  cancelInventoryCountSchema,
  countFindingSchema,
  countScanRecordSchema,
  countScanResultSchema,
  createInventoryCountSchema,
  findingNoteSchema,
  inventoryCountDetailSchema,
  inventoryCountListQuerySchema,
  inventoryCountScansQuerySchema,
  inventoryCountSummarySchema,
  regularizeFindingSchema,
  scanInventoryCountSchema,
  setCountQuantitySchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idempotencyHeadersSchema } from '../../plugins/idempotency.ts';
import { InventoryCountsService } from './inventory-counts.service.ts';

const idParams = z.object({ id: z.uuid() });
const detail = z.object({ data: inventoryCountDetailSchema });
const scanResult = z.object({ data: countScanResultSchema });

/**
 * Conteo físico a ciegas con segundo recuento (ADR-021). Se registra bajo `/inventory/counts`.
 * - `inventory-counts:read` consulta; `:manage` crea, captura (solo el operador asignado) y cancela;
 *   `:approve` aprueba (único paso que mueve stock) y regulariza hallazgos.
 * - Mientras el conteo está en captura o recuento las respuestas NO incluyen stock del sistema ni
 *   diferencias (vista `BLIND`); esos datos solo existen desde la revisión (vista `REVIEW`).
 *
 * La autorización va en `preValidation` para que quien no tiene sesión o permiso reciba 401/403 y
 * no un 400 con el detalle del esquema.
 */
export const inventoryCountsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new InventoryCountsService(app.prisma);
  const canRead = app.requirePermission(PERMISSIONS.INVENTORY_COUNTS_READ);
  const canManage = app.requirePermission(PERMISSIONS.INVENTORY_COUNTS_MANAGE);
  const canApprove = app.requirePermission(PERMISSIONS.INVENTORY_COUNTS_APPROVE);

  app.get(
    '/',
    {
      preValidation: canRead,
      schema: {
        querystring: inventoryCountListQuerySchema,
        response: {
          200: z.object({
            data: z.array(inventoryCountSummarySchema),
            meta: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
          }),
        },
      },
    },
    async (request) => service.list(request.query),
  );

  app.post(
    '/',
    {
      preValidation: canManage,
      schema: { body: createInventoryCountSchema, response: { 201: detail } },
    },
    async (request, reply) =>
      reply.status(201).send({ data: await service.create(request.body, request) }),
  );

  app.get(
    '/:id',
    { preValidation: canRead, schema: { params: idParams, response: { 200: detail } } },
    async (request) => ({ data: await service.get(request.params.id, request) }),
  );

  app.get(
    '/:id/scans',
    {
      preValidation: canRead,
      schema: {
        params: idParams,
        querystring: inventoryCountScansQuerySchema,
        response: {
          200: z.object({
            data: z.array(countScanRecordSchema),
            meta: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
          }),
        },
      },
    },
    async (request) => service.scans(request.params.id, request.query),
  );

  app.post(
    '/:id/start',
    { preValidation: canManage, schema: { params: idParams, response: { 200: detail } } },
    async (request) => ({ data: await service.start(request.params.id, request) }),
  );

  app.post(
    '/:id/take',
    { preValidation: canManage, schema: { params: idParams, response: { 200: detail } } },
    async (request) => ({ data: await service.take(request.params.id, request) }),
  );

  app.post(
    '/:id/scan',
    {
      preValidation: canManage,
      schema: {
        headers: idempotencyHeadersSchema,
        params: idParams,
        body: scanInventoryCountSchema,
        response: { 200: scanResult },
      },
    },
    async (request) => ({
      data: await service.scan(request.params.id, request.body.code, request),
    }),
  );

  app.post(
    '/:id/undo',
    { preValidation: canManage, schema: { params: idParams, response: { 200: scanResult } } },
    async (request) => ({ data: await service.undo(request.params.id, request) }),
  );

  app.put(
    '/:id/items/:variantId',
    {
      preValidation: canManage,
      schema: {
        params: z.object({ id: z.uuid(), variantId: z.uuid() }),
        body: setCountQuantitySchema,
        response: { 200: scanResult },
      },
    },
    async (request) => ({
      data: await service.setQuantity(
        request.params.id,
        request.params.variantId,
        request.body.quantity,
        request,
      ),
    }),
  );

  app.post(
    '/:id/close',
    {
      preValidation: canManage,
      schema: { headers: idempotencyHeadersSchema, params: idParams, response: { 200: detail } },
    },
    async (request) => ({ data: await service.close(request.params.id, request) }),
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
    '/:id/cancel',
    {
      preValidation: canManage,
      schema: { params: idParams, body: cancelInventoryCountSchema, response: { 200: detail } },
    },
    async (request) => ({
      data: await service.cancel(request.params.id, request.body, request),
    }),
  );

  app.patch(
    '/:id/findings/:findingId',
    {
      preValidation: canManage,
      schema: {
        params: z.object({ id: z.uuid(), findingId: z.uuid() }),
        body: findingNoteSchema,
        response: { 200: z.object({ data: countFindingSchema }) },
      },
    },
    async (request) => ({
      data: await service.noteFinding(
        request.params.id,
        request.params.findingId,
        request.body.note,
        request,
      ),
    }),
  );

  app.post(
    '/:id/findings/:findingId/regularize',
    {
      preValidation: canApprove,
      schema: {
        params: z.object({ id: z.uuid(), findingId: z.uuid() }),
        body: regularizeFindingSchema,
        response: { 200: z.object({ data: countFindingSchema }) },
      },
    },
    async (request) => ({
      data: await service.regularizeFinding(
        request.params.id,
        request.params.findingId,
        request.body.note,
        request,
      ),
    }),
  );
};
