import { MAX_PHOTO_UPLOAD_BYTES, PHOTO_UPLOAD_TYPES } from '@joyeria/shared';

/** Atributo `accept` del input de archivos. */
export const PHOTO_ACCEPT = PHOTO_UPLOAD_TYPES.join(',');

/**
 * Revisión rápida en el navegador para avisar antes de subir. NO es una medida de seguridad:
 * la API vuelve a validar el contenido real del archivo.
 */
export function validatePhotoFile(file: Pick<File, 'type' | 'size' | 'name'>): string | null {
  if (!(PHOTO_UPLOAD_TYPES as readonly string[]).includes(file.type)) {
    return `«${file.name}» no es una foto JPG, PNG o WebP.`;
  }
  if (file.size === 0) return `«${file.name}» está vacío.`;
  if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
    return `«${file.name}» pesa más de ${MAX_PHOTO_UPLOAD_BYTES / (1024 * 1024)} MB.`;
  }
  return null;
}

/** Tamaño legible en español (p. ej. «84 KB», «1,2 MB»). */
export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
