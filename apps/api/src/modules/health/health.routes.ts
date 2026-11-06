import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

/** Usado por el hosting (health checks), monitoreo externo y CI. No expone datos sensibles. */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      // Tope propio por IP (los health checks del hosting hacen pocas peticiones por minuto).
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        response: {
          200: z.object({ status: z.literal('ok'), database: z.literal('up') }),
          503: z.object({ status: z.literal('degraded'), database: z.literal('down') }),
        },
      },
    },
    async (request, reply) => {
      try {
        await app.prisma.$queryRaw`SELECT 1`;
        return { status: 'ok' as const, database: 'up' as const };
      } catch (err) {
        request.log.error({ err }, 'health: base de datos no disponible');
        return reply.status(503).send({ status: 'degraded' as const, database: 'down' as const });
      }
    },
  );
};
