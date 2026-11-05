import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import { API_PREFIX, ERROR_CODES } from '@joyeria/shared';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Env } from './config/env.ts';
import { authRoutes } from './modules/auth/auth.routes.ts';
import { healthRoutes } from './modules/health/health.routes.ts';
import { suppliersRoutes } from './modules/suppliers/suppliers.routes.ts';
import { usersRoutes } from './modules/users/users.routes.ts';
import { categoriesRoutes } from './modules/catalog/categories.routes.ts';
import { attributesRoutes } from './modules/catalog/attributes.routes.ts';
import { productsRoutes } from './modules/catalog/products.routes.ts';
import { productPhotosRoutes } from './modules/catalog/photos/photos.routes.ts';
import { catalogVariantsRoutes } from './modules/catalog/variants.routes.ts';
import { inventoryRoutes } from './modules/inventory/inventory.routes.ts';
import { stockEntriesRoutes } from './modules/stock-entries/stock-entries.routes.ts';
import { authPlugin } from './plugins/auth.ts';
import { errorHandlerPlugin } from './plugins/error-handler.ts';
import { prismaPlugin } from './plugins/prisma.ts';
import { securityPlugin } from './plugins/security.ts';

function loggerOptions(env: Env): FastifyServerOptions['logger'] {
  return {
    level: env.LOG_LEVEL,
    // Datos sensibles que nunca deben llegar a los logs.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.passwordHash',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
    ...(env.NODE_ENV === 'development' && {
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    }),
  };
}

export async function buildApp(env: Env) {
  const app = Fastify({
    logger: loggerOptions(env),
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    trustProxy: env.TRUST_PROXY ?? false,
    bodyLimit: 1024 * 1024, // 1 MiB: la API solo recibe JSON. Archivos: PENDIENTE (P-14).
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  await app.register(errorHandlerPlugin);
  await app.register(securityPlugin, { env });
  await app.register(prismaPlugin, { databaseUrl: env.DATABASE_URL });
  await app.register(authPlugin, { env });

  // API versionada. Cada módulo de negocio se registra aquí con su propio prefijo.
  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes, {
        prefix: '/auth',
        sessionTtlHours: env.SESSION_TTL_HOURS,
        loginRateLimitMax: env.LOGIN_RATE_LIMIT_MAX,
      });
      await api.register(suppliersRoutes, { prefix: '/suppliers' });
      await api.register(usersRoutes, { prefix: '/users' });
      await api.register(categoriesRoutes, { prefix: '/categories' });
      await api.register(attributesRoutes, { prefix: '/attributes' });
      await api.register(productsRoutes, { prefix: '/products' });
      await api.register(productPhotosRoutes, { prefix: '/products' });
      await api.register(catalogVariantsRoutes, { prefix: '/catalog/variants' });
      await api.register(inventoryRoutes, { prefix: '/inventory' });
      await api.register(stockEntriesRoutes, { prefix: '/stock-entries' });
    },
    { prefix: API_PREFIX },
  );

  // Producción: la API también sirve el frontend compilado (un solo servicio, mismo origen,
  // sin problemas de CORS ni cookies entre dominios). Ver ADR-012.
  const webDist = env.WEB_DIST_DIR ? path.resolve(env.WEB_DIST_DIR) : undefined;
  const serveWeb = webDist !== undefined && existsSync(path.join(webDist, 'index.html'));
  if (serveWeb) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
  }

  app.setNotFoundHandler((request, reply) => {
    const isApi = request.url.startsWith('/api/');
    if (serveWeb && !isApi && request.method === 'GET') {
      return reply.sendFile('index.html'); // SPA: el router del frontend resuelve la ruta
    }
    return reply.status(404).send({
      error: { code: ERROR_CODES.NOT_FOUND, message: 'Ruta no encontrada', requestId: request.id },
    });
  });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
