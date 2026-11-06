import type { Product } from '@joyeria/shared';
import { isSafePhotoUrl } from './photo-url.ts';

type Props = {
  product: Pick<Product, 'name' | 'photos'>;
  className?: string;
  /** Imagen decorativa (alt vacío): el nombre del producto ya está como texto al lado. */
  decorative?: boolean;
  /** Imagen principal de la pantalla: se descarga de inmediato y con prioridad alta (LCP). */
  priority?: boolean;
};

/** Miniatura de la portada del producto (o un marcador si no tiene fotos). */
export function ProductThumb({
  product,
  className = 'size-16',
  decorative = false,
  priority = false,
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
      src={cover.url}
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
