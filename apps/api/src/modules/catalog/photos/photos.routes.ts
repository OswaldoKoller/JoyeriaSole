import multipart from '@fastify/multipart';
import {
  MAX_PHOTO_UPLOAD_BYTES,
  PERMISSIONS,
  PHOTO_FIELD_NAME,
  productPhotoSchema,
  reorderPhotosSchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { NotFoundError, PayloadTooLargeError, ValidationError } from '../../../lib/errors.ts';
import { STORED_PHOTO_TYPE } from './image-processing.ts';
import { ProductPhotosService } from './photos.service.ts';

const productParams = z.object({ id: z.uuid() });
const photoParams = z.object({ id: z.uuid(), photoId: z.uuid() });
const photoItem = z.object({ data: productPhotoSchema });
const photoList = z.object({ data: z.array(productPhotoSchema) });

/** Holgura del cuerpo multipart sobre el archivo (cabeceras de las partes y el delimitador). */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/** Lista blanca de tipos que se sirven; cualquier otro valor guardado se trata como inexistente. */
const SERVED_TYPES = new Set<string>([STORED_PHOTO_TYPE, 'image/jpeg', 'image/png']);

/** ¿La cabecera If-None-Match (puede traer varios ETag, débiles o `*`) coincide con este ETag? */
function etagMatches(header: string | undefined, etag: string) {
  if (!header) return false;
  return header
    .split(',')
    .map((value) => value.trim().replace(/^W\//, ''))
    .some((value) => value === '*' || value === etag);
}

/**
 * Fotos de producto (Q-09, ADR-020). Se registran bajo `/products`:
 *   GET    /:id/photos             lista de metadatos (catalog:read)
 *   GET    /:id/photos/:photoId    bytes de la imagen (catalog:read) — ETag, caché, nosniff
 *   POST   /:id/photos             sube una foto, multipart campo «file» (catalog:manage)
 *   PUT    /:id/photos/order       reordena (catalog:manage)
 *   PUT    /:id/photos/:photoId/cover  marca la portada (catalog:manage)
 *   DELETE /:id/photos/:photoId    elimina (catalog:manage)
 */
export const productPhotosRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new ProductPhotosService(app.prisma);

  // El plugin vive solo en este contexto: el resto de la API sigue siendo JSON con tope de 1 MiB.
  await app.register(multipart, {
    limits: {
      fileSize: MAX_PHOTO_UPLOAD_BYTES, // más grande: FST_REQ_FILE_TOO_LARGE → 413
      files: 1,
      fields: 2,
      parts: 3,
      fieldSize: 1024,
      fieldNameSize: 100,
      headerPairs: 20,
    },
  });

  app.get(
    '/:id/photos',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_READ),
      schema: { params: productParams, response: { 200: photoList } },
    },
    async (request) => ({ data: await service.list(request.params.id) }),
  );

  app.get(
    '/:id/photos/:photoId',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_READ),
      schema: { params: photoParams },
    },
    async (request, reply) => {
      const photo = await service.meta(request.params.id, request.params.photoId);
      if (!SERVED_TYPES.has(photo.contentType)) throw new NotFoundError('Foto no encontrada');
      const etag = `"${photo.sha256}"`;
      reply
        .header('etag', etag)
        // El contenido de una foto nunca cambia (el id es nuevo con cada subida); privado porque
        // exige sesión.
        .header('cache-control', 'private, max-age=31536000, immutable')
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "default-src 'none'; sandbox")
        .header('content-disposition', 'inline');
      if (etagMatches(request.headers['if-none-match'], etag)) {
        return reply.status(304).send();
      }
      const bytes = await service.readBytes(photo.id);
      return reply.type(photo.contentType).send(Buffer.from(bytes));
    },
  );

  app.post(
    '/:id/photos',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      // Subir fotos es costoso (decodifica y re-codifica): tope propio por usuario/IP.
      config: { rateLimit: { max: 40, timeWindow: '1 minute' } },
      schema: { params: productParams, response: { 201: photoItem } },
    },
    async (request, reply) => {
      if (!request.isMultipart()) {
        throw new ValidationError('Envíe la foto como multipart/form-data, en el campo «file».');
      }
      const declared = Number(request.headers['content-length'] ?? 0);
      if (declared > MAX_PHOTO_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) {
        throw new PayloadTooLargeError('La foto supera el tamaño máximo de 5 MB.');
      }
      const part = await request.file();
      if (!part || part.fieldname !== PHOTO_FIELD_NAME) {
        throw new ValidationError('Falta el archivo de la foto (campo «file»).');
      }
      const file = await part.toBuffer(); // FST_REQ_FILE_TOO_LARGE → 413 en el manejador de errores
      if (file.length === 0) throw new ValidationError('El archivo está vacío.');
      const photo = await service.add(request.params.id, file, request);
      return reply.status(201).send({ data: photo });
    },
  );

  app.put(
    '/:id/photos/order',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params: productParams, body: reorderPhotosSchema, response: { 200: photoList } },
    },
    async (request) => ({
      data: await service.reorder(request.params.id, request.body.photoIds, request),
    }),
  );

  app.put(
    '/:id/photos/:photoId/cover',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params: photoParams, response: { 200: photoList } },
    },
    async (request) => ({
      data: await service.setCover(request.params.id, request.params.photoId, request),
    }),
  );

  app.delete(
    '/:id/photos/:photoId',
    {
      preHandler: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params: photoParams, response: { 200: photoList } },
    },
    async (request) => ({
      data: await service.remove(request.params.id, request.params.photoId, request),
    }),
  );
};
