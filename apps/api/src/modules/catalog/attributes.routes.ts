import {
  PERMISSIONS,
  attributeOptionSchema,
  attributeSchema,
  createAttributeOptionSchema,
  createAttributeSchema,
  updateAttributeOptionSchema,
  updateAttributeSchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AttributesService } from './attributes.service.ts';

const idParams = z.object({ id: z.uuid() });
const optionParams = z.object({ id: z.uuid(), optionId: z.uuid() });
const item = z.object({ data: attributeSchema });
const optionItem = z.object({ data: attributeOptionSchema });

export const attributesRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new AttributesService(app.prisma);
  app.get(
    '/',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_READ),
      schema: {
        querystring: z.object({
          includeInactive: z
            .enum(['true', 'false'])
            .default('false')
            .transform((value) => value === 'true'),
        }),
        response: { 200: z.object({ data: z.array(attributeSchema) }) },
      },
    },
    async (request) => service.list(request.query.includeInactive),
  );
  app.post(
    '/',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { body: createAttributeSchema, response: { 201: item } },
    },
    async (request, reply) =>
      reply.status(201).send({ data: await service.create(request.body, request) }),
  );
  app.patch(
    '/:id',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params: idParams, body: updateAttributeSchema, response: { 200: item } },
    },
    async (request) => ({ data: await service.update(request.params.id, request.body, request) }),
  );
  app.post(
    '/:id/options',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: {
        params: idParams,
        body: createAttributeOptionSchema,
        response: { 201: optionItem },
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        data: await service.addOption(request.params.id, request.body, request),
      }),
  );
  app.patch(
    '/:id/options/:optionId',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: {
        params: optionParams,
        body: updateAttributeOptionSchema,
        response: { 200: optionItem },
      },
    },
    async (request) => ({
      data: await service.updateOption(
        request.params.id,
        request.params.optionId,
        request.body,
        request,
      ),
    }),
  );
};
