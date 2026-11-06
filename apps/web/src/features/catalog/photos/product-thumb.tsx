import type { Product } from '@joyeria/shared';

type Props = { product: Pick<Product, 'name' | 'photos'>; className?: string };

/** Miniatura de la portada del producto (o un marcador si no tiene fotos). */
export function ProductThumb({ product, className = 'size-16' }: Props) {
  const cover = product.photos.find((photo) => photo.isCover) ?? product.photos[0];
  if (!cover) {
    return (
      <div
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center rounded-lg bg-stone-100 text-center text-[10px] leading-tight text-stone-500 ${className}`}
      >
        Sin foto
      </div>
    );
  }
  return (
    <img
      src={cover.url}
      alt={`Foto de portada de ${product.name}`}
      width={cover.width}
      height={cover.height}
      loading="lazy"
      decoding="async"
      className={`shrink-0 rounded-lg border border-stone-200 object-cover ${className}`}
    />
  );
}
