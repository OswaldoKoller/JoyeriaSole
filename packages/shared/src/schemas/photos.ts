import { z } from 'zod';

/** Q-09: hasta 5 fotos por producto (una de ellas, la portada). */
export const MAX_PHOTOS_PER_PRODUCT = 5;
/** Q-09: tamaño máximo del archivo que se sube (antes de reducirlo). */
export const MAX_PHOTO_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Q-09: la foto se reduce a este lado mayor (px) en el servidor. */
export const PHOTO_MAX_SIDE_PX = 1200;
/** Formatos aceptados al subir (se validan por el contenido real, no por la extensión). */
export const PHOTO_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Nombre del campo multipart que lleva el archivo. */
export const PHOTO_FIELD_NAME = 'file';

/** Metadatos de una foto. Los bytes se piden aparte a `url` (nunca viajan en listados). */
export const productPhotoSchema = z.object({
  id: z.uuid(),
  /** Ruta de la imagen (mismo origen, requiere sesión): `/api/v1/products/:id/photos/:photoId`. */
  url: z.string(),
  contentType: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  sizeBytes: z.number().int(),
  position: z.number().int(),
  isCover: z.boolean(),
});
export type ProductPhoto = z.infer<typeof productPhotoSchema>;

/** Nuevo orden de la galería: todas las fotos del producto, una sola vez cada una. */
export const reorderPhotosSchema = z.object({
  photoIds: z.array(z.uuid()).min(1).max(MAX_PHOTOS_PER_PRODUCT),
});
export type ReorderPhotosInput = z.infer<typeof reorderPhotosSchema>;

/** Ruta pública (dentro de la API) de una foto. */
export function productPhotoPath(productId: string, photoId: string) {
  return `/api/v1/products/${productId}/photos/${photoId}`;
}
