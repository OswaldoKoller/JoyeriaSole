import { MAX_PHOTOS_PER_PRODUCT, type ProductPhoto } from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import type { Prisma } from '../../../generated/prisma/client.ts';
import { BusinessRuleError, NotFoundError, ValidationError } from '../../../lib/errors.ts';
import type { PrismaClient } from '../../../lib/prisma.ts';
import { getAuth } from '../../../plugins/auth.ts';
import { recordAudit } from '../../audit/audit.service.ts';
import { processPhoto } from './image-processing.ts';
import { toPhotoResponse } from './photo-response.ts';
import { PostgresPhotoStorage, type PhotoStorage } from './photo-storage.ts';

const ordered = [
  { position: 'asc' },
  { id: 'asc' },
] satisfies Prisma.ProductPhotoOrderByWithRelationInput[];

const LIMIT_MESSAGE = `Cada producto admite hasta ${MAX_PHOTOS_PER_PRODUCT} fotos. Elimine una para subir otra.`;

/**
 * Fotos de producto (Q-09, ADR-020). Los bytes pasan por `PhotoStorage`; aquí solo viven las
 * reglas: máximo por producto, portada única, orden y auditoría en la misma transacción.
 */
export class ProductPhotosService {
  private readonly storage: PhotoStorage;

  constructor(
    private readonly prisma: PrismaClient,
    storage?: PhotoStorage,
  ) {
    this.storage = storage ?? new PostgresPhotoStorage(prisma);
  }

  /** Bloquea la fila del producto: serializa subidas, bajas y reordenamientos concurrentes. */
  private async lockProduct(tx: Prisma.TransactionClient, productId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundError('Producto no encontrado');
  }

  async list(productId: string): Promise<ProductPhoto[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { photos: { orderBy: ordered } },
    });
    if (!product) throw new NotFoundError('Producto no encontrado');
    return product.photos.map(toPhotoResponse);
  }

  /**
   * Procesa (valida por contenido, re-codifica y reduce) y guarda una foto nueva al final de la
   * galería. La primera foto del producto queda como portada.
   */
  async add(productId: string, file: Uint8Array, request: FastifyRequest): Promise<ProductPhoto> {
    const existing = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { _count: { select: { photos: true } } },
    });
    if (!existing) throw new NotFoundError('Producto no encontrado');
    // Falla rápido, antes de gastar CPU en la imagen (se vuelve a comprobar bajo bloqueo).
    if (existing._count.photos >= MAX_PHOTOS_PER_PRODUCT) {
      throw new BusinessRuleError(LIMIT_MESSAGE);
    }

    const processed = await processPhoto(file);
    const userId = getAuth(request).user.id;

    return this.prisma.$transaction(async (tx) => {
      await this.lockProduct(tx, productId);
      const current = await tx.productPhoto.findMany({
        where: { productId },
        select: { position: true },
      });
      if (current.length >= MAX_PHOTOS_PER_PRODUCT) throw new BusinessRuleError(LIMIT_MESSAGE);
      const position = current.reduce((max, photo) => Math.max(max, photo.position + 1), 0);
      const photo = await tx.productPhoto.create({
        data: {
          productId,
          contentType: processed.contentType,
          width: processed.width,
          height: processed.height,
          sizeBytes: processed.sizeBytes,
          sha256: processed.sha256,
          position,
          isCover: current.length === 0,
          createdById: userId,
        },
      });
      await this.storage.put(tx, photo.id, processed.bytes);
      const response = toPhotoResponse(photo);
      await recordAudit(
        tx,
        {
          action: 'product.photo_added',
          entityType: 'Product',
          entityId: productId,
          after: { ...response, sha256: photo.sha256 },
        },
        request,
      );
      return response;
    });
  }

  /** Marca la portada. Solo puede haber una por producto. */
  async setCover(productId: string, photoId: string, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProduct(tx, productId);
      const photos = await tx.productPhoto.findMany({ where: { productId }, orderBy: ordered });
      const target = photos.find((photo) => photo.id === photoId);
      if (!target) throw new NotFoundError('Foto no encontrada');
      const previous = photos.find((photo) => photo.isCover);
      if (previous?.id !== target.id) {
        // El índice único parcial exige quitar la portada anterior antes de poner la nueva.
        if (previous) {
          await tx.productPhoto.update({ where: { id: previous.id }, data: { isCover: false } });
        }
        await tx.productPhoto.update({ where: { id: target.id }, data: { isCover: true } });
        await recordAudit(
          tx,
          {
            action: 'product.photo_cover_changed',
            entityType: 'Product',
            entityId: productId,
            before: { coverPhotoId: previous?.id ?? null },
            after: { coverPhotoId: target.id },
          },
          request,
        );
      }
      const updated = await tx.productPhoto.findMany({ where: { productId }, orderBy: ordered });
      return updated.map(toPhotoResponse);
    });
  }

  /** Reordena la galería: `photoIds` debe contener exactamente las fotos del producto. */
  async reorder(productId: string, photoIds: string[], request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProduct(tx, productId);
      const photos = await tx.productPhoto.findMany({ where: { productId }, orderBy: ordered });
      const current = new Set(photos.map((photo) => photo.id));
      const requested = new Set(photoIds);
      if (
        requested.size !== photoIds.length ||
        requested.size !== current.size ||
        photoIds.some((id) => !current.has(id))
      ) {
        throw new ValidationError(
          'El nuevo orden debe incluir exactamente las fotos del producto, una sola vez cada una.',
        );
      }
      for (const [position, id] of photoIds.entries()) {
        await tx.productPhoto.update({ where: { id }, data: { position } });
      }
      await recordAudit(
        tx,
        {
          action: 'product.photos_reordered',
          entityType: 'Product',
          entityId: productId,
          before: { photoIds: photos.map((photo) => photo.id) },
          after: { photoIds },
        },
        request,
      );
      const updated = await tx.productPhoto.findMany({ where: { productId }, orderBy: ordered });
      return updated.map(toPhotoResponse);
    });
  }

  /**
   * Elimina una foto. Si era la portada, la primera de las restantes pasa a serlo; las posiciones
   * se compactan.
   */
  async remove(productId: string, photoId: string, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProduct(tx, productId);
      const photos = await tx.productPhoto.findMany({ where: { productId }, orderBy: ordered });
      const target = photos.find((photo) => photo.id === photoId);
      if (!target) throw new NotFoundError('Foto no encontrada');
      await this.storage.remove(tx, [target.id]);
      await tx.productPhoto.delete({ where: { id: target.id } });
      const remaining = photos.filter((photo) => photo.id !== target.id);
      for (const [position, photo] of remaining.entries()) {
        const becomesCover = target.isCover && position === 0;
        if (photo.position !== position || becomesCover) {
          await tx.productPhoto.update({
            where: { id: photo.id },
            data: { position, ...(becomesCover && { isCover: true }) },
          });
        }
      }
      await recordAudit(
        tx,
        {
          action: 'product.photo_removed',
          entityType: 'Product',
          entityId: productId,
          before: { ...toPhotoResponse(target), sha256: target.sha256 },
        },
        request,
      );
      const updated = await tx.productPhoto.findMany({ where: { productId }, orderBy: ordered });
      return updated.map(toPhotoResponse);
    });
  }

  /** Metadatos de una foto sin leer sus bytes (para ETag / 304). */
  async meta(productId: string, photoId: string) {
    const photo = await this.prisma.productPhoto.findFirst({ where: { id: photoId, productId } });
    if (!photo) throw new NotFoundError('Foto no encontrada');
    return photo;
  }

  async readBytes(photoId: string) {
    const bytes = await this.storage.get(photoId);
    if (!bytes) throw new NotFoundError('Foto no encontrada');
    return bytes;
  }
}
