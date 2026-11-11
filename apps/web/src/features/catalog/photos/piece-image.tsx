import { isSafePhotoUrl, photoSrc, photoSrcSet } from './photo-url.ts';
import { useVariantCover } from './use-variant-covers.ts';

/**
 * Ruta de la portada por variante (la API devuelve «Sin foto» si no hay). Solo se usa como
 * respaldo si falla la consulta de portadas; sigue revalidándose en cada pantalla.
 */
function variantCoverUrl(variantId: string) {
  return `/api/v1/products/variants/${variantId}/cover?w=160`;
}

/**
 * Las miniaturas de pieza miden entre 40 y 80 px (`size-10` a `size-20`): con 80 px el navegador
 * elige la de 160 px en pantallas 2x y la de 320 px en 3x.
 */
const PIECE_IMAGE_SIZES = '80px';

type Props = {
  /** Variante de la pieza; null cuando el código no corresponde a ninguna (se muestra el marcador). */
  variantId: string | null | undefined;
  /** Tamaño y forma (clases de Tailwind). */
  className?: string;
};

const FRAME = 'shrink-0 rounded-lg border border-stone-200 bg-stone-100';

/** Marcador sin texto (el nombre de la pieza ya va al lado). */
function Placeholder({ className, noPhoto }: { className: string; noPhoto: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-piece-image={noPhoto ? 'sin-foto' : undefined}
      className={`inline-flex items-center justify-center ${FRAME} ${className}`}
    >
      {noPhoto && (
        <svg viewBox="0 0 120 120" className="size-3/5" focusable="false">
          <path
            d="M60 34 78 52 60 86 42 52Z M42 52h36"
            fill="none"
            stroke="#a8a29e"
            strokeWidth="5"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

/**
 * Foto de portada de una pieza para identificarla de un vistazo en cualquier pantalla (pedido del
 * cliente). Es decorativa (alt vacío): el nombre de la pieza siempre va como texto al lado.
 * Usa la miniatura adecuada (`srcset`) por su URL inmutable: no se revalida en cada pantalla.
 */
export function PieceImage({ variantId, className = 'size-14' }: Props) {
  const cover = useVariantCover(variantId);
  if (!variantId || cover.isPending) {
    return <Placeholder className={className} noPhoto={false} />;
  }
  if (cover.isError) {
    return (
      <img
        src={variantCoverUrl(variantId)}
        alt=""
        loading="lazy"
        decoding="async"
        className={`${FRAME} object-cover ${className}`}
      />
    );
  }
  const photo = cover.data;
  if (!photo || !isSafePhotoUrl(photo.url)) {
    return <Placeholder className={className} noPhoto />;
  }
  return (
    <img
      src={photoSrc(photo.url, photo.width, 160)}
      srcSet={photoSrcSet(photo.url, photo.width)}
      sizes={PIECE_IMAGE_SIZES}
      width={photo.width}
      height={photo.height}
      alt=""
      loading="lazy"
      decoding="async"
      className={`${FRAME} object-cover ${className}`}
    />
  );
}
