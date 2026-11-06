import multipart from '@fastify/multipart';
import {
  MAX_PHOTO_UPLOAD_BYTES,
  PERMISSIONS,
  PHOTO_FIELD_NAME,
  productPhotoSchema,
  reorderPhotosSchema,
} from '@joyeria/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { NotFoundError, PayloadTooLargeError, ValidationError } from '../../../lib/errors.ts';
import { STORED_PHOTO_TYPE } from './image-processing.ts';
import { ProductPhotosService } from './photos.service.ts';

const productParams = z.object({ id: z.uuid() });
const photoParams = z.object({ id: z.uuid(), photoId: z.uuid() });
const variantParams = z.object({ variantId: z.uuid() });
const photoItem = z.object({ data: productPhotoSchema });
const photoList = z.object({ data: z.array(productPhotoSchema) });

/** Holgura del cuerpo multipart sobre el archivo (cabeceras de las partes y el delimitador). */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/**
 * Permisos que dan acceso a VER la imagen de una pieza. El cliente pidió que la foto aparezca en
 * todas las pantallas para identificar la pieza; una foto no es información sensible, así que basta
 * con poder ver el catálogo o cualquier pantalla donde la pieza se muestra.
 */
const IMAGE_VIEW_PERMISSIONS = [
  PERMISSIONS.CATALOG_READ,
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.STOCK_ENTRIES_READ,
  PERMISSIONS.INVENTORY_COUNTS_READ,
  PERMISSIONS.INVENTORY_ADJUST,
  PERMISSIONS.INVENTORY_EXCHANGE,
  PERMISSIONS.PRICES_PROPOSE,
  PERMISSIONS.PRICES_APPROVE,
] as const;

/**
 * Las imágenes no cuentan para el límite global por IP (300/min): una lista muestra decenas de
 * miniaturas y dejaría sin respuesta al resto de la pantalla. Tienen un tope alto POR USUARIO
 * (la limitación se evalúa en `preHandler`, después de autenticar, para conocer el usuario).
 */
const IMAGE_RATE_LIMIT = {
  max: 3000,
  timeWindow: '1 minute',
  hook: 'preHandler' as const,
  keyGenerator: (request: FastifyRequest) => request.auth?.user.id ?? request.ip,
};

/** Imagen de reemplazo (SVG propio, sin datos del usuario) para piezas sin foto. */
const NO_PHOTO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="Sin foto">' +
  '<rect width="120" height="120" fill="#f5f5f4"/>' +
  '<path d="M60 34 78 52 60 86 42 52Z M42 52h36" fill="none" stroke="#a8a29e" stroke-width="3" stroke-linejoin="round"/>' +
  '<text x="60" y="106" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#78716c">Sin foto</text>' +
  '</svg>';
const NO_PHOTO_ETAG = '"sin-foto-1"';

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
 *   GET    /:id/photos/:photoId    bytes de la imagen (catalog:read u otra pantalla con fotos) — ETag, caché, nosniff
 *   GET    /variants/:variantId/cover  portada de la pieza (o imagen «Sin foto») — ETag
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
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_READ),
      schema: { params: productParams, response: { 200: photoList } },
    },
    async (request) => ({ data: await service.list(request.params.id) }),
  );

  /** Cabeceras y cuerpo de una foto (con ETag: responde 304 si no cambió). */
  async function sendPhoto(
    request: FastifyRequest,
    reply: FastifyReply,
    photo: { id: string; contentType: string; sha256: string },
    cacheControl: string,
  ) {
    const etag = `"${photo.sha256}"`;
    reply
      .header('etag', etag)
      .header('cache-control', cacheControl)
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('content-disposition', 'inline');
    if (etagMatches(request.headers['if-none-match'], etag)) {
      return reply.status(304).send();
    }
    const bytes = await service.readBytes(photo.id);
    return reply.type(photo.contentType).send(Buffer.from(bytes));
  }

  app.get(
    '/:id/photos/:photoId',
    {
      preValidation: app.requireAnyPermission(...IMAGE_VIEW_PERMISSIONS),
      // Una lista muestra decenas de fotos a la vez: tope alto por usuario en vez del global por IP.
      config: { rateLimit: IMAGE_RATE_LIMIT },
      schema: { params: photoParams },
    },
    async (request, reply) => {
      const photo = await service.meta(request.params.id, request.params.photoId);
      if (!SERVED_TYPES.has(photo.contentType)) throw new NotFoundError('Foto no encontrada');
      // El contenido de una foto nunca cambia (el id es nuevo con cada subida); privado porque
      // exige sesión.
      return sendPhoto(request, reply, photo, 'private, max-age=31536000, immutable');
    },
  );

  // Portada de una pieza a partir de su variante: las pantallas de inventario, ajustes, precios,
  // conteos e ingresos solo conocen la variante. Sin foto se sirve una imagen de reemplazo (200),
  // así la página nunca muestra una imagen rota. La portada puede cambiar: se revalida con ETag.
  app.get(
    '/variants/:variantId/cover',
    {
      preValidation: app.requireAnyPermission(...IMAGE_VIEW_PERMISSIONS),
      config: { rateLimit: IMAGE_RATE_LIMIT }, // ver la nota de la ruta de fotos por id
      schema: { params: variantParams },
    },
    async (request, reply) => {
      const photo = await service.coverOfVariant(request.params.variantId);
      if (photo && SERVED_TYPES.has(photo.contentType)) {
        return sendPhoto(request, reply, photo, 'private, no-cache');
      }
      reply
        .header('etag', NO_PHOTO_ETAG)
        .header('cache-control', 'private, no-cache')
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "default-src 'none'; sandbox")
        .header('content-disposition', 'inline');
      if (etagMatches(request.headers['if-none-match'], NO_PHOTO_ETAG)) {
        return reply.status(304).send();
      }
      return reply.type('image/svg+xml').send(NO_PHOTO_SVG);
    },
  );

  app.post(
    '/:id/photos',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
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
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params: productParams, body: reorderPhotosSchema, response: { 200: photoList } },
    },
    async (request) => ({
      data: await service.reorder(request.params.id, request.body.photoIds, request),
    }),
  );

  app.put(
    '/:id/photos/:photoId/cover',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params: photoParams, response: { 200: photoList } },
    },
    async (request) => ({
      data: await service.setCover(request.params.id, request.params.photoId, request),
    }),
  );

  app.delete(
    '/:id/photos/:photoId',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_MANAGE),
      schema: { params: photoParams, response: { 200: photoList } },
    },
    async (request) => ({
      data: await service.remove(request.params.id, request.params.photoId, request),
    }),
  );
};
