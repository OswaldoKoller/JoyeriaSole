import {
  PERMISSIONS,
  createSupplierSchema,
  supplierSchema,
  supplierTypeSchema,
  updateSupplierSchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SuppliersService } from './suppliers.service.ts';

const idParams = z.object({ id: z.uuid() });
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).default(''),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  type: z.union([z.literal('all'), supplierTypeSchema]).default('all'),
});
const itemResponse = z.object({ data: supplierSchema });

export const suppliersRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new SuppliersService(app.prisma);

  app.get(
    '/',
    {
      preHandler: app.requirePermission(PERMISSIONS.SUPPLIERS_READ),
      schema: {
        querystring: listQuery,
        response: {
          200: z.object({
            data: z.array(supplierSchema),
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
      preHandler: app.requirePermission(PERMISSIONS.SUPPLIERS_READ),
      schema: { params: idParams, response: { 200: itemResponse } },
    },
    async (request) => ({ data: await service.get(request.params.id) }),
  );

  app.post(
    '/',
    {
      preHandler: app.requirePermission(PERMISSIONS.SUPPLIERS_MANAGE),
      schema: { body: createSupplierSchema, response: { 201: itemResponse } },
    },
    async (request, reply) =>
      reply.status(201).send({ data: await service.create(request.body, request) }),
  );

  app.patch(
    '/:id',
    {
      preHandler: app.requirePermission(PERMISSIONS.SUPPLIERS_MANAGE),
      schema: { params: idParams, body: updateSupplierSchema, response: { 200: itemResponse } },
    },
    async (request) => ({ data: await service.update(request.params.id, request.body, request) }),
  );
};
