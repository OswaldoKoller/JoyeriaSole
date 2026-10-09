import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';
import type { Env } from '../config/env.ts';
import { ForbiddenError } from '../lib/errors.ts';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Cabeceras de seguridad, CORS, cookies firmadas, rate limiting y protección CSRF.
 * Ver docs/security/SECURITY.md.
 */
export const securityPlugin = fp<{ env: Env }>(
  async (app, { env }) => {
    const allowedOrigins = new Set([...env.CORS_ORIGIN, new URL(env.FRONTEND_URL).origin]);

    await app.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: env.COOKIE_SECURE ? [] : null,
        },
      },
      hsts: env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
    });

    await app.register(cors, {
      origin: (origin, callback) => {
        // Sin cabecera Origin: misma página o cliente no-navegador (curl, pruebas).
        callback(null, !origin || allowedOrigins.has(origin));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    });

    await app.register(cookie, { secret: env.AUTH_SECRET });

    await app.register(rateLimit, {
      global: true,
      max: 300,
      timeWindow: '1 minute',
    });

    // CSRF: la cookie de sesión es SameSite=Strict y, además, se rechaza cualquier petición
    // que modifique datos desde un origen no permitido.
    app.addHook('onRequest', async (request) => {
      if (!UNSAFE_METHODS.has(request.method)) return;
      const origin = request.headers.origin;
      if (origin && !allowedOrigins.has(origin)) {
        request.log.warn({ origin, url: request.url }, 'security: origen no permitido bloqueado');
        throw new ForbiddenError('Origen no permitido');
      }
    });
  },
  { name: 'security' },
);
