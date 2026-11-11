import { ERROR_CODES, type ApiErrorBody } from '@joyeria/shared';
import type { FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { Prisma } from '../generated/prisma/client.ts';
import { AppError } from '../lib/errors.ts';

/** Segundos sugeridos al cliente (cabecera Retry-After) ante un conflicto transitorio de la base. */
const TRANSIENT_RETRY_AFTER_SECONDS = 2;

/**
 * SQLSTATE de conflictos transitorios: deadlock_detected, serialization_failure y lock_not_available
 * (vence `lock_timeout`, p. ej. el cierre de caja espera como máximo 5 s a las ventas en curso).
 */
const TRANSIENT_SQLSTATES = new Set(['40P01', '40001', '55P03']);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Conflictos transitorios de la base: conflicto de escritura/deadlock (P2034, 40P01, 40001) o
 * transacción interactiva sin tiempo/conexión (P2028). Reintentar suele funcionar; no es un bug.
 */
export function isTransientDatabaseError(error: unknown): boolean {
  const record = asRecord(error);
  if (!record) return false;
  const code = record.code;
  if (code === 'P2034' || code === 'P2028') return true;
  if (typeof code === 'string' && TRANSIENT_SQLSTATES.has(code)) return true;
  const meta = asRecord(record.meta);
  if (typeof meta?.code === 'string' && TRANSIENT_SQLSTATES.has(meta.code)) return true;
  const cause = asRecord(asRecord(meta?.driverAdapterError)?.cause);
  return (
    cause?.kind === 'TransactionWriteConflict' ||
    (typeof cause?.originalCode === 'string' && TRANSIENT_SQLSTATES.has(cause.originalCode))
  );
}

/** SQLSTATE numeric_value_out_of_range: un importe no cabe en su columna `numeric`. */
const NUMERIC_OVERFLOW_SQLSTATE = '22003';

/**
 * Desbordamiento numérico de la base (P2020 de Prisma o SQLSTATE 22003, directo, en `meta` o en la
 * causa del adaptador). No es un fallo técnico del servidor: el dato excede un límite técnico, así
 * que se responde 422 con un mensaje claro en lugar de un 500 (B-2).
 */
export function isNumericOverflowError(error: unknown): boolean {
  const record = asRecord(error);
  if (!record) return false;
  if (record.code === 'P2020' || record.code === NUMERIC_OVERFLOW_SQLSTATE) return true;
  const meta = asRecord(record.meta);
  if (meta?.code === NUMERIC_OVERFLOW_SQLSTATE) return true;
  const cause = asRecord(asRecord(meta?.driverAdapterError)?.cause);
  return cause?.originalCode === NUMERIC_OVERFLOW_SQLSTATE || cause?.kind === 'ValueOutOfRange';
}

/**
 * Manejo centralizado de errores. Garantiza:
 *   - Formato único: { error: { code, message, details?, requestId } }.
 *   - Nunca se envían stack traces, SQL ni mensajes internos al cliente.
 *   - Los errores técnicos (500) se registran completos en el log con su requestId.
 */
export const errorHandlerPlugin = fp(
  async (app) => {
    app.setErrorHandler((error: FastifyError, request, reply) => {
      const send = (statusCode: number, body: ApiErrorBody['error']) =>
        reply.status(statusCode).send({ error: { ...body, requestId: request.id } });

      if (error instanceof AppError) {
        if (error.statusCode >= 500) request.log.error({ err: error }, error.message);
        return send(error.statusCode, {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined && { details: error.details }),
        });
      }

      if (hasZodFastifySchemaValidationErrors(error)) {
        return send(400, {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Los datos enviados no son válidos',
          details: error.validation.map((issue) => ({
            field: [error.validationContext, ...issue.instancePath.split('/').filter(Boolean)].join(
              '.',
            ),
            message: issue.message,
          })),
        });
      }

      if (isTransientDatabaseError(error)) {
        request.log.warn({ err: error }, 'Conflicto transitorio de base de datos');
        reply.header('retry-after', String(TRANSIENT_RETRY_AFTER_SECONDS));
        return send(503, {
          code: ERROR_CODES.SERVICE_UNAVAILABLE,
          message:
            'El sistema está ocupado procesando otra operación. Espere unos segundos y vuelva a intentarlo.',
        });
      }

      if (isNumericOverflowError(error)) {
        request.log.warn({ err: error }, 'Importe fuera del rango de la base');
        return send(422, {
          code: ERROR_CODES.BUSINESS_RULE_VIOLATION,
          message:
            'Un importe supera el máximo que el sistema puede registrar. Revise las cifras ingresadas.',
        });
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          return send(409, {
            code: ERROR_CODES.CONFLICT,
            message: 'Ya existe un registro con esos datos únicos',
          });
        }
        if (error.code === 'P2003') {
          // Clave foránea: otro registro depende de este (p. ej. eliminar algo con historial).
          return send(422, {
            code: ERROR_CODES.BUSINESS_RULE_VIOLATION,
            message: 'No se puede completar la operación: hay registros que dependen de este.',
          });
        }
        if (error.code === 'P2025') {
          return send(404, { code: ERROR_CODES.NOT_FOUND, message: 'Recurso no encontrado' });
        }
      }

      // Subidas de archivos (@fastify/multipart): archivo o cuerpo demasiado grande, demasiadas partes.
      if (
        error.statusCode === 413 ||
        error.code === 'FST_REQ_FILE_TOO_LARGE' ||
        error.code === 'FST_FILES_LIMIT' ||
        error.code === 'FST_PARTS_LIMIT' ||
        error.code === 'FST_FIELDS_LIMIT'
      ) {
        return send(413, {
          code: ERROR_CODES.PAYLOAD_TOO_LARGE,
          message:
            'El archivo supera el tamaño máximo permitido o la solicitud es demasiado grande.',
        });
      }

      if (error.statusCode === 429) {
        return send(429, {
          code: ERROR_CODES.RATE_LIMITED,
          message: 'Demasiadas solicitudes. Intente nuevamente en unos minutos.',
        });
      }

      // Errores 4xx propios de Fastify (JSON mal formado, content-type no soportado, etc.).
      if (
        !isResponseSerializationError(error) &&
        error.statusCode &&
        error.statusCode >= 400 &&
        error.statusCode < 500
      ) {
        return send(error.statusCode, {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Solicitud inválida',
        });
      }

      request.log.error({ err: error }, 'Error no controlado');
      return send(500, {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Ocurrió un error inesperado. Si persiste, contacte al administrador.',
      });
    });
  },
  { name: 'error-handler' },
);
