import type { Prisma } from '../../../generated/prisma/client.ts';
import type { PrismaClient } from '../../../lib/prisma.ts';

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
    await tx.productPhotoBlob.deleteMany({ where: { photoId: { in: photoIds } } });
  }
}
