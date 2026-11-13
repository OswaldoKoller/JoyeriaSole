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
import { startupWarnings, type Env } from './config/env.ts';
import { authRoutes } from './modules/auth/auth.routes.ts';
import { healthRoutes } from './modules/health/health.routes.ts';
import { suppliersRoutes } from './modules/suppliers/suppliers.routes.ts';
import { usersRoutes } from './modules/users/users.routes.ts';
import { rolesRoutes } from './modules/roles/roles.routes.ts';
import { categoriesRoutes } from './modules/catalog/categories.routes.ts';
import { attributesRoutes } from './modules/catalog/attributes.routes.ts';
import { productsRoutes } from './modules/catalog/products.routes.ts';
import { adjustmentsRoutes } from './modules/inventory/adjustments.routes.ts';
import { productPhotosRoutes } from './modules/catalog/photos/photos.routes.ts';
import { catalogVariantsRoutes } from './modules/catalog/variants.routes.ts';
import { exchangesRoutes } from './modules/inventory/exchanges.routes.ts';
import { inventoryRoutes } from './modules/inventory/inventory.routes.ts';
import { approvalsRoutes } from './modules/approvals/approvals.routes.ts';
import { auditRoutes } from './modules/audit/audit.routes.ts';
import { pricingRoutes } from './modules/pricing/pricing.routes.ts';
import { costHistoryRoutes } from './modules/stock-entries/cost-history.routes.ts';
import { costTypesRoutes } from './modules/stock-entries/cost-types.routes.ts';
import { inventoryCountsRoutes } from './modules/inventory-counts/inventory-counts.routes.ts';
import { stockEntriesRoutes } from './modules/stock-entries/stock-entries.routes.ts';
import { cashRoutes } from './modules/cash/cash.routes.ts';
import { paymentMethodsRoutes } from './modules/sales/payment-methods.routes.ts';
import { salesRoutes } from './modules/sales/sales.routes.ts';
import { receiptRoutes } from './modules/sales/receipt.routes.ts';
import { saleIncidentsRoutes } from './modules/sales/incidents.routes.ts';
import { businessSettingsRoutes } from './modules/settings/business-settings.routes.ts';
import { authPlugin } from './plugins/auth.ts';
import { errorHandlerPlugin } from './plugins/error-handler.ts';
import { idempotencyPlugin } from './plugins/idempotency.ts';
import { prismaPlugin } from './plugins/prisma.ts';
import { securityPlugin } from './plugins/security.ts';

const REQUEST_TIMEOUT_MS = 120_000;
const CONNECTION_TIMEOUT_MS = 120_000;
const KEEP_ALIVE_TIMEOUT_MS = 65_000;

/** Rutas `/api/*` que gestionan su propia caché (imágenes con ETag); el resto nunca se cachea. */
function isApiPath(url: string) {
  return url.startsWith('/api/');
}

/** Confía solo en los primeros `hops` saltos de la cadena (el socket es el salto 0). */
function trustHops(hops: number) {
  return (_address: string, hop: number) => hop < hops;
}

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
    // Número de saltos de proxy propios (0 = ninguno). Nunca `true`: ver TRUST_PROXY_HOPS.
    trustProxy: env.TRUST_PROXY_HOPS > 0 ? trustHops(env.TRUST_PROXY_HOPS) : false,
    bodyLimit: 1024 * 1024, // 1 MiB: JSON. Las fotos (multipart, 5 MB) tienen sus propios límites: ADR-020.
    // Tiempos explícitos (por defecto Fastify no limita el tiempo de una petición ni de un socket):
    // una subida de 5 MB desde un móvil lento cabe de sobra en 2 minutos; el keep-alive supera el
    // tiempo de inactividad habitual de los balanceadores (60 s) para evitar cortes de conexión.
    requestTimeout: REQUEST_TIMEOUT_MS,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    keepAliveTimeout: KEEP_ALIVE_TIMEOUT_MS,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
    // Respuestas de la API con datos de negocio: ni el navegador ni un proxy deben guardarlas.
    // Las imágenes (portada/fotos) fijan su propio Cache-Control con ETag y no se tocan.
    if (isApiPath(request.url) && !reply.hasHeader('cache-control')) {
      reply.header('cache-control', 'no-store');
    }
  });

  for (const warning of startupWarnings(env)) app.log.warn(warning);

  await app.register(errorHandlerPlugin);
  await app.register(securityPlugin, { env });
  await app.register(prismaPlugin, { databaseUrl: env.DATABASE_URL });
  await app.register(authPlugin, { env });
  await app.register(idempotencyPlugin);

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
      await api.register(rolesRoutes, { prefix: '/roles' });
      await api.register(categoriesRoutes, { prefix: '/categories' });
      await api.register(attributesRoutes, { prefix: '/attributes' });
      await api.register(productsRoutes, { prefix: '/products' });
      await api.register(productPhotosRoutes, { prefix: '/products' });
      await api.register(catalogVariantsRoutes, { prefix: '/catalog/variants' });
      await api.register(inventoryRoutes, { prefix: '/inventory' });
      await api.register(adjustmentsRoutes, { prefix: '/inventory/adjustments' });
      await api.register(exchangesRoutes, { prefix: '/inventory/exchanges' });
      await api.register(inventoryCountsRoutes, { prefix: '/inventory/counts' });
      await api.register(stockEntriesRoutes, { prefix: '/stock-entries' });
      await api.register(costTypesRoutes, { prefix: '/stock-entry-cost-types' });
      await api.register(costHistoryRoutes, { prefix: '/products' });
      await api.register(pricingRoutes, { prefix: '/pricing' });
      await api.register(approvalsRoutes, { prefix: '/approvals' });
      await api.register(auditRoutes, { prefix: '/audit' });
      // Ventas y caja (plan 11 de fase-2-ventas): sin rutas de anulación ni de edición (DEC-V07).
      await api.register(cashRoutes, { prefix: '/cash' });
      await api.register(salesRoutes, { prefix: '/sales' });
      await api.register(receiptRoutes, { prefix: '/sales' });
      await api.register(paymentMethodsRoutes, { prefix: '/payment-methods' });
      await api.register(saleIncidentsRoutes, { prefix: '/sale-incidents' });
      await api.register(businessSettingsRoutes, { prefix: '/settings' });
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
