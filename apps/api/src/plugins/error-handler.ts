import { ERROR_CODES, type ApiErrorBody } from '@joyeria/shared';
import type { FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { Prisma } from '../generated/prisma/client.ts';
import { AppError } from '../lib/errors.ts';

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

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          return send(409, {
            code: ERROR_CODES.CONFLICT,
            message: 'Ya existe un registro con esos datos únicos',
            details: { fields: error.meta?.target },
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
