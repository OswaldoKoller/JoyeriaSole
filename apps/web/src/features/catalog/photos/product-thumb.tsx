import type { Product } from '@joyeria/shared';
import { isSafePhotoUrl, photoSrc, photoSrcSet } from './photo-url.ts';

type Props = {
  product: Pick<Product, 'name' | 'photos'>;
  className?: string;
  /** Imagen decorativa (alt vacío): el nombre del producto ya está como texto al lado. */
  decorative?: boolean;
  /** Imagen principal de la pantalla: se descarga de inmediato y con prioridad alta (LCP). */
  priority?: boolean;
  /**
   * Ancho con que se muestra (atributo `sizes`): el navegador elige la miniatura justa. Por
   * defecto, el de una tarjeta del catálogo (columna de la cuadrícula).
   */
  sizes?: string;
};

/** Tarjetas del catálogo: 2 columnas en teléfono, hasta 5-6 en pantallas grandes. */
const CARD_SIZES = '(min-width: 1024px) 220px, (min-width: 640px) 33vw, 50vw';

/** Miniatura de la portada del producto (o un marcador si no tiene fotos). */
export function ProductThumb({
  product,
  className = 'size-16',
  decorative = false,
  priority = false,
  sizes = CARD_SIZES,
}: Props) {
  const photo = product.photos.find((item) => item.isCover) ?? product.photos[0];
  const cover = photo && isSafePhotoUrl(photo.url) ? photo : undefined;
  if (!cover) {
    return (
      <div
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center rounded-lg bg-stone-100 text-center text-xs leading-tight text-stone-600 ${className}`}
      >
        Sin foto
      </div>
    );
  }
  return (
    <img
      src={photoSrc(cover.url, cover.width, 320)}
      srcSet={photoSrcSet(cover.url, cover.width)}
      sizes={sizes}
      alt={decorative ? '' : `Foto de portada de ${product.name}`}
      width={cover.width}
      height={cover.height}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      className={`shrink-0 rounded-lg border border-stone-200 object-cover ${className}`}
    />
  );
}
