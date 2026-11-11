import { IDEMPOTENT_REPLAY_HEADER } from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { IdempotencyKeyRequiredError, ValidationError } from '../lib/errors.ts';
import {
  hashRequest,
  purgeExpiredIdempotencyKeys,
  type IdempotencyContext,
} from '../lib/idempotency.ts';
import { getAuth } from './auth.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** `true` cuando la respuesta es la guardada de una clave `Idempotency-Key` ya usada. */
    idempotentReplay: boolean;
  }
}

/** Cada cuánto se eliminan las claves vencidas (una hora). */
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

const keySchema = z.uuid({ message: 'Debe ser un UUID' });

/**
 * Esquema de cabeceras de las rutas idempotentes (`schema: { headers: idempotencyHeadersSchema }`).
 * Es «loose»: Fastify reemplaza `request.headers` por el resultado y no deben perderse las demás
 * cabeceras (cookie, user-agent...). La clave es opcional salvo que el servicio la exija.
 */
export const idempotencyHeadersSchema = z.looseObject({
  'idempotency-key': keySchema.optional(),
});

/**
 * Contexto de idempotencia de una petición autenticada, o `null` si no trae `Idempotency-Key`.
 * Con `required: true` (p. ej. futuras ventas o caja) la falta de la clave es un 400
 * `IDEMPOTENCY_KEY_REQUIRED`. El hash cubre los `params` y el `body` ya validados por Zod.
 */
export function idempotencyOf(
  request: FastifyRequest,
  options: { required?: boolean; ttlHours?: number } = {},
): IdempotencyContext | null {
  const raw = request.headers['idempotency-key'];
  if (raw === undefined || raw === '') {
    if (options.required) throw new IdempotencyKeyRequiredError();
    return null;
  }
  const parsed = keySchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError('Los datos enviados no son válidos', [
      { field: 'headers.idempotency-key', message: 'Debe ser un UUID' },
    ]);
  }
  return {
    key: parsed.data.toLowerCase(),
    userId: getAuth(request).user.id,
    scope: `${request.method} ${request.routeOptions.url ?? request.url}`,
    requestHash: hashRequest({ params: request.params ?? null, body: request.body ?? null }),
    ttlHours: options.ttlHours,
    onReplay: () => {
      request.idempotentReplay = true;
    },
  };
}

/**
 * Plugin de idempotencia: marca las respuestas repetidas con `Idempotent-Replay: true` y elimina
 * cada hora las claves vencidas (sin tareas externas: el contenedor es uno solo, ADR-012).
 */
export const idempotencyPlugin = fp(
  async (app) => {
    app.decorateRequest('idempotentReplay', false);

    app.addHook('onSend', async (request, reply) => {
      if (request.idempotentReplay) reply.header(IDEMPOTENT_REPLAY_HEADER, 'true');
    });

    const purge = () => {
      purgeExpiredIdempotencyKeys(app.prisma)
        .then((removed) => {
          if (removed > 0) app.log.info({ removed }, 'Claves de idempotencia vencidas eliminadas');
        })
        .catch((error: unknown) => {
          app.log.warn({ err: error }, 'No se pudieron eliminar las claves de idempotencia');
        });
    };
    const timer = setInterval(purge, PURGE_INTERVAL_MS);
    timer.unref();
    app.addHook('onClose', async () => {
      clearInterval(timer);
    });
  },
  { name: 'idempotency', dependencies: ['prisma'] },
);
