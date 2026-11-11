import {
  PERMISSIONS,
  createRoleSchema,
  permissionCatalogSchema,
  roleDetailSchema,
  updateRoleSchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { RolesService } from './roles.service.ts';

/** Gestión de roles por pantalla (P-46). Las salvaguardas viven en `RolesService`. */
export const rolesRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new RolesService(app.prisma);

  app.get(
    '/',
    {
      preValidation: app.requirePermission(PERMISSIONS.ROLES_READ),
      schema: { response: { 200: z.object({ data: z.array(roleDetailSchema) }) } },
    },
    async () => ({ data: await service.list() }),
  );

  app.get(
    '/permissions',
    {
      preValidation: app.requirePermission(PERMISSIONS.ROLES_READ),
      schema: { response: { 200: z.object({ data: permissionCatalogSchema }) } },
    },
    () => ({ data: service.permissionCatalog() }),
  );

  app.post(
    '/',
    {
      preValidation: app.requirePermission(PERMISSIONS.ROLES_MANAGE),
      schema: { body: createRoleSchema, response: { 201: z.object({ data: roleDetailSchema }) } },
    },
    async (request, reply) =>
      reply.status(201).send({ data: await service.create(request.body, request) }),
  );

  app.patch(
    '/:id',
    {
      preValidation: app.requirePermission(PERMISSIONS.ROLES_MANAGE),
      schema: {
        params: z.object({ id: z.uuid() }),
        body: updateRoleSchema,
        response: { 200: z.object({ data: roleDetailSchema }) },
      },
    },
    async (request) => ({ data: await service.update(request.params.id, request.body, request) }),
  );

  app.delete(
    '/:id',
    {
      preValidation: app.requirePermission(PERMISSIONS.ROLES_MANAGE),
      schema: { params: z.object({ id: z.uuid() }), response: { 204: z.null() } },
    },
    async (request, reply) => {
      await service.remove(request.params.id, request);
      return reply.status(204).send(null);
    },
  );
};
