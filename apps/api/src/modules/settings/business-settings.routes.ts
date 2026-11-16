import multipart from '@fastify/multipart';
import {
  LOGO_FIELD_NAME,
  MAX_LOGO_UPLOAD_BYTES,
  PERMISSIONS,
  businessSettingsSchema,
  updateBusinessSettingsSchema,
} from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PayloadTooLargeError, ValidationError } from '../../lib/errors.ts';
import { BusinessLogoService } from './business-logo.service.ts';
import { BusinessSettingsService } from './business-settings.service.ts';

const detail = z.strictObject({ data: businessSettingsSchema });

/** Holgura del cuerpo multipart sobre el archivo (cabeceras de las partes y el delimitador). */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/** ¿La cabecera If-None-Match (puede traer varios ETag, débiles o `*`) coincide con este ETag? */
function etagMatches(request: FastifyRequest, etag: string) {
  const header = request.headers['if-none-match'];
  if (!header) return false;
  return header
    .split(',')
    .map((value) => value.trim().replace(/^W\//, ''))
    .some((value) => value === '*' || value === etag);
}

/**
 * Datos del negocio (plan 11 §4.6 S1/S2), bajo `/settings`. Los edita solo `settings:manage`
 * (Administrador). El logo se sube por `PUT /business/logo` (multipart, campo «file»), se sirve por
 * `GET /business/logo` a quien imprime o ve comprobantes, y se quita con `DELETE`.
 */
export const businessSettingsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new BusinessSettingsService(app.prisma);
  const logos = new BusinessLogoService(app.prisma);

  // El plugin vive solo en este contexto: el resto de la API sigue siendo JSON con tope de 1 MiB.
  await app.register(multipart, {
    limits: {
      fileSize: MAX_LOGO_UPLOAD_BYTES, // más grande: FST_REQ_FILE_TOO_LARGE → 413
      files: 1,
      fields: 2,
      parts: 3,
      fieldSize: 1024,
      fieldNameSize: 100,
      headerPairs: 20,
    },
  });

  app.get(
    '/business',
    {
      preValidation: app.requirePermission(PERMISSIONS.SETTINGS_MANAGE),
      schema: { response: { 200: detail } },
    },
    async () => ({ data: await service.get() }),
  );

  app.put(
    '/business',
    {
      preValidation: app.requirePermission(PERMISSIONS.SETTINGS_MANAGE),
      schema: { body: updateBusinessSettingsSchema, response: { 200: detail } },
    },
    async (request) => ({ data: await service.update(request.body, request) }),
  );

  // Quien ve o imprime un comprobante necesita el logo; no es información sensible.
  app.get(
    '/business/logo',
    {
      preValidation: app.requireAnyPermission(
        PERMISSIONS.SETTINGS_MANAGE,
        PERMISSIONS.SALES_READ,
        PERMISSIONS.SALES_READ_ALL,
        PERMISSIONS.SALES_EXCHANGE,
      ),
    },
    async (request, reply) => {
      const logo = await logos.read();
      const etag = `"${logo.sha256}"`;
      reply
        .header('etag', etag)
        .header('cache-control', 'private, no-cache')
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "default-src 'none'; sandbox")
        .header('content-disposition', 'inline');
      if (etagMatches(request, etag)) return reply.status(304).send();
      return reply.type(logo.contentType).send(Buffer.from(logo.bytes));
    },
  );

  app.put(
    '/business/logo',
    {
      preValidation: app.requirePermission(PERMISSIONS.SETTINGS_MANAGE),
      // Procesar una imagen es costoso: tope propio por usuario/IP.
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: { response: { 200: detail } },
    },
    async (request) => {
      if (!request.isMultipart()) {
        throw new ValidationError('Envíe el logo como multipart/form-data, en el campo «file».');
      }
      const declared = Number(request.headers['content-length'] ?? 0);
      if (declared > MAX_LOGO_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) {
        throw new PayloadTooLargeError('El logo supera el tamaño máximo de 2 MB.');
      }
      const part = await request.file();
      if (part?.fieldname !== LOGO_FIELD_NAME) {
        throw new ValidationError('Falta el archivo del logo (campo «file»).');
      }
      const file = await part.toBuffer(); // FST_REQ_FILE_TOO_LARGE → 413 en el manejador de errores
      if (file.length === 0) throw new ValidationError('El archivo está vacío.');
      return { data: await logos.replace(file, request) };
    },
  );

  app.delete(
    '/business/logo',
    {
      preValidation: app.requirePermission(PERMISSIONS.SETTINGS_MANAGE),
      schema: { response: { 200: detail } },
    },
    async (request) => ({ data: await logos.remove(request) }),
  );
};
