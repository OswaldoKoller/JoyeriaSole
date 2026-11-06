import { changePasswordSchema, loginResultSchema, loginSchema } from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getAuth } from '../../plugins/auth.ts';
import { AuthService } from './auth.service.ts';

const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  mustChangePassword: z.boolean(),
});

export const authRoutes: FastifyPluginAsyncZod<{
  sessionTtlHours: number;
  loginRateLimitMax: number;
}> = async (app, { sessionTtlHours, loginRateLimitMax }) => {
  const service = new AuthService(app.prisma, sessionTtlHours);

  app.post(
    '/login',
    {
      // Límite estricto contra fuerza bruta (además del límite global).
      config: { rateLimit: { max: loginRateLimitMax, timeWindow: '15 minutes' } },
      schema: {
        body: loginSchema,
        response: { 200: z.object({ data: loginResultSchema }) },
      },
    },
    async (request, reply) => {
      const { token, expiresAt, mustChangePassword } = await service.login(request.body, request);
      app.sessionCookie.set(reply, token, expiresAt);
      return reply.status(200).send({ data: { mustChangePassword } });
    },
  );

  app.post(
    '/logout',
    { preValidation: app.authenticate, schema: { response: { 204: z.null() } } },
    async (request, reply) => {
      const auth = getAuth(request);
      await service.logout(auth.sessionId, auth.user.id, request);
      app.sessionCookie.clear(reply);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/me',
    {
      preValidation: app.authenticate,
      schema: { response: { 200: z.object({ data: authUserSchema }) } },
    },
    async (request) => ({ data: getAuth(request).user }),
  );

  app.post(
    '/change-password',
    {
      // preValidation: sin sesión responde 401 antes de validar el cuerpo (no filtra detalles).
      preValidation: app.authenticate,
      config: { rateLimit: { max: loginRateLimitMax, timeWindow: '15 minutes' } },
      schema: { body: changePasswordSchema, response: { 204: z.null() } },
    },
    async (request, reply) => {
      await service.changePassword(getAuth(request).user.id, request.body, request);
      app.sessionCookie.clear(reply);
      return reply.status(204).send(null);
    },
  );
};
