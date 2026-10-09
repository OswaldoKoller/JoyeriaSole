import { loginSchema } from '@joyeria/shared';
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
});

export const authRoutes: FastifyPluginAsyncZod<{ sessionTtlHours: number }> = async (
  app,
  { sessionTtlHours },
) => {
  const service = new AuthService(app.prisma, sessionTtlHours);

  app.post(
    '/login',
    {
      // Límite estricto contra fuerza bruta (además del límite global).
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
      schema: {
        body: loginSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { token, expiresAt } = await service.login(request.body, request);
      app.sessionCookie.set(reply, token, expiresAt);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/logout',
    { preHandler: app.authenticate, schema: { response: { 204: z.null() } } },
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
      preHandler: app.authenticate,
      schema: { response: { 200: z.object({ data: authUserSchema }) } },
    },
    async (request) => ({ data: getAuth(request).user }),
  );
};
