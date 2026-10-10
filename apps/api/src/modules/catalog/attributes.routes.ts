import {
  PERMISSIONS,
  attributeOptionSchema,
  attributeSchema,
  createAttributeOptionSchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AttributesService } from './attributes.service.ts';

export const attributesRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new AttributesService(app.prisma);
  app.get(
    '/',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_READ),
      schema: { response: { 200: z.object({ data: z.array(attributeSchema) }) } },
    },
    async () => service.list(),
  );
  app.post(
    '/:id/options',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: {
        params: z.object({ id: z.uuid() }),
        body: createAttributeOptionSchema,
        response: { 201: z.object({ data: attributeOptionSchema }) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        data: await service.addOption(request.params.id, request.body, request),
      }),
  );
};
