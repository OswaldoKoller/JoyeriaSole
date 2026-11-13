import type { PhotoThumbWidth } from '@joyeria/shared';
import { Prisma } from '../../../generated/prisma/client.ts';
import type { PrismaClient } from '../../../lib/prisma.ts';
import type { PhotoThumbnail } from './image-processing.ts';

/**
 * Almacenamiento de los BYTES de las fotos (ADR-020). Los metadatos (orden, portada, tamaño,
 * ETag...) viven siempre en `product_photos`; esta interfaz solo guarda y devuelve el contenido,
 * para poder cambiar PostgreSQL por un bucket externo (S3/R2) sin tocar el resto del módulo.
 *
 * `put` y `remove` reciben el cliente de la transacción de negocio: la implementación PostgreSQL
 * participa en ella (foto y auditoría son atómicas). Una implementación externa no puede ser
 * transaccional: debe subir ANTES de confirmar y limpiar huérfanos al fallar (ver ADR-020).
 */
export interface PhotoStorage {
  put(tx: Prisma.TransactionClient, photoId: string, bytes: Uint8Array): Promise<void>;
  /** Devuelve los bytes o `null` si no existen. Solo se invoca al servir la imagen. */
  get(photoId: string): Promise<Uint8Array | null>;
  remove(tx: Prisma.TransactionClient, photoIds: string[]): Promise<void>;
  /** Guarda las miniaturas de una foto nueva, en la misma transacción que la foto. */
  putThumbnails(
    tx: Prisma.TransactionClient,
    photoId: string,
    thumbnails: PhotoThumbnail[],
  ): Promise<void>;
  /** Bytes de una miniatura o `null` si todavía no se generó (fotos anteriores a DT-DAT-18). */
  getThumbnail(photoId: string, width: PhotoThumbWidth): Promise<Uint8Array | null>;
  /**
   * Guarda una miniatura generada al servirla, FUERA de toda transacción. Idempotente: si otra
   * petición ya la guardó, o la foto se eliminó mientras tanto, no hace nada.
   */
  saveThumbnail(photoId: string, thumbnail: PhotoThumbnail): Promise<void>;
}

/** Implementación por defecto: tabla `product_photo_blobs` (bytea en PostgreSQL). */
export class PostgresPhotoStorage implements PhotoStorage {
  constructor(private readonly prisma: PrismaClient) {}

  async put(tx: Prisma.TransactionClient, photoId: string, bytes: Uint8Array) {
    await tx.productPhotoBlob.create({ data: { photoId, bytes: new Uint8Array(bytes) } });
  }

  async get(photoId: string) {
    const blob = await this.prisma.productPhotoBlob.findUnique({ where: { photoId } });
    return blob?.bytes ?? null;
  }

  async remove(tx: Prisma.TransactionClient, photoIds: string[]) {
    // Las miniaturas también se borran en cascada; se eliminan explícitamente para que la
    // interfaz no dependa de la FK (un bucket externo tendría que hacerlo igual).
    await tx.productPhotoThumbnail.deleteMany({ where: { photoId: { in: photoIds } } });
    await tx.productPhotoBlob.deleteMany({ where: { photoId: { in: photoIds } } });
  }

  async putThumbnails(tx: Prisma.TransactionClient, photoId: string, thumbnails: PhotoThumbnail[]) {
    if (thumbnails.length === 0) return;
    await tx.productPhotoThumbnail.createMany({
      data: thumbnails.map((thumb) => ({
        photoId,
        width: thumb.width,
        bytes: new Uint8Array(thumb.bytes),
      })),
    });
  }

  async getThumbnail(photoId: string, width: PhotoThumbWidth) {
    const thumb = await this.prisma.productPhotoThumbnail.findUnique({
      where: { photoId_width: { photoId, width } },
      select: { bytes: true },
    });
    return thumb?.bytes ?? null;
  }

  async saveThumbnail(photoId: string, thumbnail: PhotoThumbnail) {
    try {
      await this.prisma.productPhotoThumbnail.createMany({
        data: [{ photoId, width: thumbnail.width, bytes: new Uint8Array(thumbnail.bytes) }],
        skipDuplicates: true,
      });
    } catch (error) {
      // P2003: la foto se eliminó mientras se generaba la miniatura; no hay nada que guardar.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') return;
      throw error;
    }
  }
}
