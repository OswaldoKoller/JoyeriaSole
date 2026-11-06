import {
  PERMISSIONS,
  assignBarcodeSchema,
  catalogHealthSchema,
  configureAxesSchema,
  createProductSchema,
  createVariantSchema,
  productListQuerySchema,
  productSchema,
  updateProductSchema,
  updateVariantSchema,
  updateVariantStatusSchema,
  warningsMetaSchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ProductsService } from './products.service.ts';
import { getAuth } from '../../plugins/auth.ts';

const idParams = z.object({ id: z.uuid() });
const item = z.object({ data: productSchema });
const itemWithWarnings = z.object({ data: productSchema, meta: warningsMetaSchema });

export const productsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new ProductsService(app.prisma);
  const canSeeStock = (request: Parameters<typeof getAuth>[0]) =>
    getAuth(request).user.permissions.includes(PERMISSIONS.INVENTORY_READ);

  app.get(
    '/',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_READ),
      schema: {
        querystring: productListQuerySchema,
        response: {
          200: z.object({
            data: z.array(productSchema),
            meta: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
          }),
        },
      },
    },
    async (request) => service.list(request.query, canSeeStock(request)),
  );
  app.get(
    '/health',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_READ),
      schema: { response: { 200: z.object({ data: catalogHealthSchema }) } },
    },
    async () => ({ data: await service.health() }),
  );
  app.get(
    '/lookup',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_READ),
      schema: {
        querystring: z.object({ code: z.string().trim().min(1).max(64) }),
        response: { 200: item },
      },
    },
    async (request) => ({ data: await service.lookup(request.query.code, canSeeStock(request)) }),
  );
  app.get(
    '/:id',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_READ),
      schema: { params: idParams, response: { 200: item } },
    },
    async (request) => ({ data: await service.get(request.params.id, canSeeStock(request)) }),
  );
  app.post(
    '/',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { body: createProductSchema, response: { 201: itemWithWarnings } },
    },
    async (request, reply) => {
      const { product, warnings } = await service.create(request.body, request);
      return reply.status(201).send({ data: product, meta: { warnings } });
    },
  );
  app.patch(
    '/:id',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params: idParams, body: updateProductSchema, response: { 200: item } },
    },
    async (request) => ({ data: await service.update(request.params.id, request.body, request) }),
  );
  // B11: eliminación física, solo Administrador y solo sin historial.
  app.delete(
    '/:id',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_DELETE),
      schema: {
        params: idParams,
        response: { 200: z.object({ data: z.object({ id: z.uuid() }) }) },
      },
    },
    async (request) => ({ data: await service.remove(request.params.id, request) }),
  );
  app.patch(
    '/variants/:id',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params: idParams, body: updateVariantSchema, response: { 200: item } },
    },
    async (request) => ({
      data: await service.updateVariant(request.params.id, request.body, request),
    }),
  );
  app.patch(
    '/variants/:id/status',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params: idParams, body: updateVariantStatusSchema, response: { 200: item } },
    },
    async (request) => ({
      data: await service.updateVariantStatus(request.params.id, request.body, request),
    }),
  );
  app.patch(
    '/variants/:id/barcode',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params: idParams, body: assignBarcodeSchema, response: { 200: itemWithWarnings } },
    },
    async (request) => {
      const { product, warnings } = await service.assignBarcode(
        request.params.id,
        request.body,
        request,
      );
      return { data: product, meta: { warnings } };
    },
  );
  app.post(
    '/variants/:id/barcode/generate',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params: idParams, response: { 200: item } },
    },
    async (request) => ({ data: await service.generateBarcode(request.params.id, request) }),
  );
  app.post(
    '/:id/axes',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params: idParams, body: configureAxesSchema, response: { 200: item } },
    },
    async (request) => ({
      data: await service.configureAxes(request.params.id, request.body, request),
    }),
  );
  app.post(
    '/:id/variants',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params: idParams, body: createVariantSchema, response: { 201: itemWithWarnings } },
    },
    async (request, reply) => {
      const { product, warnings } = await service.addVariant(
        request.params.id,
        request.body,
        request,
      );
      return reply.status(201).send({ data: product, meta: { warnings } });
    },
  );
};
