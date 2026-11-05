import {
  PERMISSIONS,
  categorySchema,
  createCategorySchema,
  setCategoryAttributesSchema,
  updateCategorySchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CategoriesService } from './categories.service.ts';

const params = z.object({ id: z.uuid() });
const item = z.object({ data: categorySchema });

export const categoriesRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new CategoriesService(app.prisma);
  app.get(
    '/',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_READ),
      schema: { response: { 200: z.object({ data: z.array(categorySchema) }) } },
    },
    async () => service.list(),
  );
  app.get(
    '/:id',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_READ),
      schema: { params, response: { 200: item } },
    },
    async (request) => ({ data: await service.get(request.params.id) }),
  );
  app.post(
    '/',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { body: createCategorySchema, response: { 201: item } },
    },
    async (request, reply) =>
      reply.status(201).send({ data: await service.create(request.body, request) }),
  );
  app.patch(
    '/:id',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params, body: updateCategorySchema, response: { 200: item } },
    },
    async (request) => ({ data: await service.update(request.params.id, request.body, request) }),
  );
  app.put(
    '/:id/attributes',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params, body: setCategoryAttributesSchema, response: { 200: item } },
    },
    async (request) => ({
      data: await service.setAttributes(request.params.id, request.body, request),
    }),
  );
};
