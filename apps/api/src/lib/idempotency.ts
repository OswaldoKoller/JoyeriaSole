import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { Prisma, type PrismaClient } from '../generated/prisma/client.ts';
import { IdempotencyKeyReusedError } from './errors.ts';

/**
 * Idempotencia de operaciones críticas (E0, ver docs/api/API.md «Idempotencia»).
 *
 * El cliente envía `Idempotency-Key: <uuid>` (una clave por intento de operación del usuario,
 * reutilizada en los reintentos). La clave se reclama en `idempotency_keys` como PRIMER paso de la
 * misma transacción que la operación y la respuesta se guarda antes del commit:
 *
 *   - clave nueva → se ejecuta la operación y se guarda su respuesta (todo o nada);
 *   - misma clave + mismo usuario, ruta y cuerpo → se devuelve la respuesta guardada sin repetir
 *     efectos (ni movimientos ni auditoría);
 *   - misma clave con otro cuerpo, otra ruta u otro usuario → 409 `IDEMPOTENCY_KEY_REUSED`;
 *   - dos peticiones simultáneas con la misma clave → la segunda espera en el `INSERT` (índice de
 *     la clave primaria) a que la primera termine: si confirmó, repite su respuesta; si revirtió,
 *     ejecuta ella. Nunca se ejecutan dos veces.
 *
 * Si la operación falla, la transacción revierte también la clave: un reintento vuelve a ejecutar
 * (y normalmente obtiene el mismo error de negocio). Solo se guardan respuestas exitosas.
 */

/** Vigencia por defecto de una clave: cubre de sobra los reintentos de una jornada (sesión de 8 h). */
export const DEFAULT_IDEMPOTENCY_TTL_HOURS = 24;

/** Lo necesario para reclamar una clave. Lo arma `idempotencyOf(request)` en las rutas HTTP. */
export interface IdempotencyContext {
  /** UUID enviado por el cliente en `Idempotency-Key`. */
  key: string;
  userId: string;
  /** Método y patrón de la ruta, p. ej. `POST /api/v1/stock-entries/:id/confirm`. */
  scope: string;
  /** `hashRequest({ params, body })`. */
  requestHash: string;
  /** Horas de vigencia de la clave (por defecto 24). */
  ttlHours?: number;
  /** Se llama cuando se devuelve una respuesta guardada (la ruta marca `Idempotent-Replay`). */
  onReplay?: () => void;
}

/** Normaliza un valor para serializarlo de forma estable (claves ordenadas, sin `undefined`). */
function normalize(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item: unknown) => normalize(item) ?? null);
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const item = record[key];
    if (item !== undefined) out[key] = normalize(item);
  }
  return out;
}

/** JSON canónico: el mismo contenido produce el mismo texto sin importar el orden de las claves. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value) ?? null);
}

/** SHA-256 (hex, 64 caracteres) del JSON canónico. */
export function hashRequest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/** Convierte la respuesta de una operación en JSON almacenable (sin casts ni `any`). */
export function toStoredJson(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item: unknown) => toStoredJson(item));
  if (typeof value === 'object') {
    const out: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[key] = toStoredJson(item);
    }
    return out;
  }
  throw new TypeError('La respuesta de la operación no se puede guardar como JSON.');
}

type ClaimResult = { kind: 'claimed' } | { kind: 'replay'; response: Prisma.JsonValue };

/**
 * Reclama la clave dentro de la transacción. Un `INSERT … ON CONFLICT` serializa a quienes usan la
 * misma clave; una clave vencida se reutiliza (se sobrescribe) en la misma sentencia.
 */
async function claimKey(
  tx: Prisma.TransactionClient,
  context: IdempotencyContext,
): Promise<ClaimResult> {
  const ttlHours = Math.max(1, Math.round(context.ttlHours ?? DEFAULT_IDEMPOTENCY_TTL_HOURS));
  const claimed = await tx.$queryRaw<{ key: string }[]>`
    INSERT INTO idempotency_keys (key, user_id, scope, request_hash, expires_at)
    VALUES (
      ${context.key}::uuid,
      ${context.userId}::uuid,
      ${context.scope},
      ${context.requestHash},
      now() + make_interval(hours => ${ttlHours}::int)
    )
    ON CONFLICT (key) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      scope = EXCLUDED.scope,
      request_hash = EXCLUDED.request_hash,
      response = NULL,
      created_at = now(),
      expires_at = EXCLUDED.expires_at
    WHERE idempotency_keys.expires_at <= now()
    RETURNING key::text AS key`;
  if (claimed.length > 0) return { kind: 'claimed' };

  // La clave existe, está vigente y su transacción ya confirmó (si no, el INSERT habría esperado).
  const existing = await tx.idempotencyKey.findUnique({ where: { key: context.key } });
  if (!existing || existing.response === null) {
    throw new Error('Clave de idempotencia sin respuesta guardada');
  }
  if (
    existing.userId !== context.userId ||
    existing.scope !== context.scope ||
    existing.requestHash !== context.requestHash
  ) {
    throw new IdempotencyKeyReusedError();
  }
  return { kind: 'replay', response: existing.response };
}

/**
 * Ejecuta `operation` una sola vez por clave, dentro de la transacción `tx` que ya abrió el servicio.
 * Debe llamarse ANTES de cualquier bloqueo o escritura de la transacción (la espera por la clave no
 * debe retener otros bloqueos). Sin contexto (`null`), ejecuta la operación tal cual.
 *
 * `responseSchema` valida la respuesta guardada al repetirla: el llamador recibe el mismo tipo.
 */
export async function runIdempotent<T>(
  tx: Prisma.TransactionClient,
  context: IdempotencyContext | null,
  responseSchema: z.ZodType<T>,
  operation: () => Promise<T>,
): Promise<T> {
  if (!context) return operation();
  const claim = await claimKey(tx, context);
  if (claim.kind === 'replay') {
    context.onReplay?.();
    return responseSchema.parse(claim.response);
  }
  const result = await operation();
  await tx.idempotencyKey.update({
    where: { key: context.key },
    data: { response: toStoredJson(result) ?? Prisma.JsonNull },
  });
  return result;
}

/** Qué operación idempotente se ejecuta: clave (o `null`), esquema de su respuesta y opciones. */
export interface IdempotentOperation<T> {
  /** `idempotencyOf(request)`; `null` = sin clave, se ejecuta como una transacción normal. */
  context: IdempotencyContext | null;
  /** Esquema de la respuesta (`data`): valida la respuesta guardada al repetirla. */
  responseSchema: z.ZodType<T>;
  /** Opciones de la transacción interactiva (por defecto, las del cliente Prisma). */
  transaction?: { timeout?: number; maxWait?: number };
}

/**
 * Abre la transacción y reclama la clave como primer paso. Forma recomendada para los servicios:
 *
 *   const idempotency = { context: idempotencyOf(request), responseSchema: detailSchema };
 *   return idempotentTransaction(this.prisma, idempotency, async (tx) => {
 *     ...bloqueos, libro de stock, recordAudit(tx, ...)...
 *     return detalle; // se guarda y se repite tal cual
 *   });
 */
export function idempotentTransaction<T>(
  prisma: PrismaClient,
  idempotency: IdempotentOperation<T>,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    (tx) => runIdempotent(tx, idempotency.context, idempotency.responseSchema, () => operation(tx)),
    idempotency.transaction,
  );
}

/** Elimina las claves vencidas. La ejecuta periódicamente el plugin de idempotencia. */
export async function purgeExpiredIdempotencyKeys(prisma: PrismaClient): Promise<number> {
  const removed = await prisma.idempotencyKey.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  return removed.count;
}
