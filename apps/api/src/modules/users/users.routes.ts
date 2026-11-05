import {
  PERMISSIONS,
  assignUserRolesSchema,
  createUserSchema,
  resetPasswordSchema,
  roleSummarySchema,
  updateUserSchema,
  userSummarySchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { UsersService } from './users.service.ts';

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).default(''),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
});

export const usersRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new UsersService(app.prisma);

  app.get(
    '/roles',
    {
      preValidation: app.requirePermission(PERMISSIONS.USERS_READ, PERMISSIONS.ROLES_MANAGE),
      schema: { response: { 200: z.object({ data: z.array(roleSummarySchema) }) } },
    },
    async () => ({ data: await service.roles() }),
  );

  app.get(
    '/',
    {
      preValidation: app.requirePermission(PERMISSIONS.USERS_READ),
      schema: {
        querystring: listQuery,
        response: {
          200: z.object({
            data: z.array(userSummarySchema),
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
      preValidation: app.requirePermission(PERMISSIONS.USERS_MANAGE, PERMISSIONS.ROLES_MANAGE),
      schema: { body: createUserSchema, response: { 201: z.object({ data: userSummarySchema }) } },
    },
    async (request, reply) =>
      reply.status(201).send({ data: await service.create(request.body, request) }),
  );

  app.get(
    '/:id',
    {
      preValidation: app.requirePermission(PERMISSIONS.USERS_READ),
      schema: {
        params: z.object({ id: z.uuid() }),
        response: { 200: z.object({ data: userSummarySchema }) },
      },
    },
    async (request) => ({ data: await service.get(request.params.id) }),
  );

  app.patch(
    '/:id',
    {
      preValidation: app.requirePermission(PERMISSIONS.USERS_MANAGE),
      schema: {
        params: z.object({ id: z.uuid() }),
        body: updateUserSchema,
        response: { 200: z.object({ data: userSummarySchema }) },
      },
    },
    async (request) => ({ data: await service.update(request.params.id, request.body, request) }),
  );

  app.post(
    '/:id/reset-password',
    {
      preValidation: app.requirePermission(PERMISSIONS.USERS_MANAGE),
      schema: {
        params: z.object({ id: z.uuid() }),
        body: resetPasswordSchema,
        response: { 200: z.object({ data: userSummarySchema }) },
      },
    },
    async (request) => ({
      data: await service.resetPassword(request.params.id, request.body, request),
    }),
  );

  app.put(
    '/:id/roles',
    {
      preValidation: app.requirePermission(PERMISSIONS.USERS_MANAGE, PERMISSIONS.ROLES_MANAGE),
      schema: {
        params: z.object({ id: z.uuid() }),
        body: assignUserRolesSchema,
        response: { 200: z.object({ data: userSummarySchema }) },
      },
    },
    async (request) => ({
      data: await service.assignRoles(request.params.id, request.body, request),
    }),
  );
};
