import { productPhotoPath, type ProductPhoto } from '@joyeria/shared';

interface PhotoRow {
  id: string;
  productId: string;
  contentType: string;
  width: number;
  height: number;
  sizeBytes: number;
  position: number;
  isCover: boolean;
}

/** Metadatos públicos de una foto (nunca incluye bytes). */
export function toPhotoResponse(photo: PhotoRow): ProductPhoto {
  return {
    id: photo.id,
    url: productPhotoPath(photo.productId, photo.id),
    contentType: photo.contentType,
    width: photo.width,
    height: photo.height,
    sizeBytes: photo.sizeBytes,
    position: photo.position,
    isCover: photo.isCover,
  };
}
