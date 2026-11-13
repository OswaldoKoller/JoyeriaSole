import { PHOTO_THUMB_WIDTHS, productPhotoThumbPath, type PhotoThumbWidth } from '@joyeria/shared';

/**
 * Las fotos las sirve nuestra propia API (`/api/...`, mismo origen). Si alguna vez llegara otra
 * URL (esquema distinto, otro dominio, protocolo relativo `//`), no se carga en la interfaz.
 */
export function isSafePhotoUrl(url: string): boolean {
  return url.startsWith('/api/');
}

/**
 * `srcset` de una foto (DT-DAT-18): las miniaturas de la lista blanca más angostas que la foto
 * y la foto completa con su ancho real. El navegador elige según `sizes` y la densidad de la
 * pantalla; todas las URL son inmutables, así que cada una se descarga una sola vez. `undefined`
 * si la foto es tan angosta que no tiene miniaturas.
 */
export function photoSrcSet(url: string, photoWidth: number): string | undefined {
  const thumbs = PHOTO_THUMB_WIDTHS.filter((width) => width < photoWidth);
  // Sin miniaturas no hay nada que elegir: sin `srcset` la imagen conserva su tamaño natural.
  if (thumbs.length === 0) return undefined;
  return [
    ...thumbs.map((width) => `${productPhotoThumbPath(url, width)} ${width}w`),
    `${url} ${photoWidth}w`,
  ].join(', ');
}

/** `src` de respaldo: la miniatura indicada si la foto es más ancha; si no, la foto misma. */
export function photoSrc(url: string, photoWidth: number, preferred: PhotoThumbWidth): string {
  return preferred < photoWidth ? productPhotoThumbPath(url, preferred) : url;
}
