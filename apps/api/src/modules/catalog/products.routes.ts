import {
  PERMISSIONS,
  assignBarcodeSchema,
  configureAxesSchema,
  createProductSchema,
  createVariantSchema,
  productSchema,
  updateProductSchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ProductsService } from './products.service.ts';
import { getAuth } from '../../plugins/auth.ts';

const idParams = z.object({ id: z.uuid() });
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).default(''),
  status: z.enum(['all', 'DRAFT', 'ACTIVE', 'INACTIVE']).default('all'),
});
const item = z.object({ data: productSchema });

export const productsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new ProductsService(app.prisma);
  app.get(
    '/',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_READ),
      schema: {
        querystring: listQuery,
        response: {
          200: z.object({
            data: z.array(productSchema),
            meta: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
          }),
        },
      },
    },
    async (request) =>
      service.list(
        request.query,
        getAuth(request).user.permissions.includes(PERMISSIONS.INVENTORY_READ),
      ),
  );
  app.get(
    '/lookup',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_READ),
      schema: {
        querystring: z.object({ code: z.string().trim().min(1).max(64) }),
        response: { 200: item },
      },
    },
    async (request) => ({
      data: await service.lookup(
        request.query.code,
        getAuth(request).user.permissions.includes(PERMISSIONS.INVENTORY_READ),
      ),
    }),
  );
  app.get(
    '/:id',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_READ),
      schema: { params: idParams, response: { 200: item } },
    },
    async (request) => ({
      data: await service.get(
        request.params.id,
        getAuth(request).user.permissions.includes(PERMISSIONS.INVENTORY_READ),
      ),
    }),
  );
  app.post(
    '/',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { body: createProductSchema, response: { 201: item } },
    },
    async (request, reply) =>
      reply.status(201).send({ data: await service.create(request.body, request) }),
  );
  app.patch(
    '/:id',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params: idParams, body: updateProductSchema, response: { 200: item } },
    },
    async (request) => ({ data: await service.update(request.params.id, request.body, request) }),
  );
  app.patch(
    '/variants/:id/barcode',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params: idParams, body: assignBarcodeSchema, response: { 200: item } },
    },
    async (request) => ({
      data: await service.assignBarcode(request.params.id, request.body, request),
    }),
  );
  app.post(
    '/variants/:id/barcode/generate',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params: idParams, response: { 200: item } },
    },
    async (request) => ({ data: await service.generateBarcode(request.params.id, request) }),
  );
  app.post(
    '/:id/axes',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params: idParams, body: configureAxesSchema, response: { 200: item } },
    },
    async (request) => ({
      data: await service.configureAxes(request.params.id, request.body, request),
    }),
  );
  app.post(
    '/:id/variants',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params: idParams, body: createVariantSchema, response: { 201: item } },
    },
    async (request, reply) =>
      reply.status(201).send({
        data: await service.addVariant(request.params.id, request.body, request),
      }),
  );
};
