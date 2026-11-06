/** Ruta de la portada de una pieza a partir de su variante (la API devuelve «Sin foto» si no hay). */
function variantCoverUrl(variantId: string) {
  return `/api/v1/products/variants/${variantId}/cover`;
}

type Props = {
  /** Variante de la pieza; null cuando el código no corresponde a ninguna (se muestra el marcador). */
  variantId: string | null | undefined;
  /** Tamaño y forma (clases de Tailwind). */
  className?: string;
};

/**
 * Foto de portada de una pieza para identificarla de un vistazo en cualquier pantalla (pedido del
 * cliente). Es decorativa (alt vacío): el nombre de la pieza siempre va como texto al lado.
 */
export function PieceImage({ variantId, className = 'size-14' }: Props) {
  if (!variantId) {
    return (
      <span
        aria-hidden="true"
        className={`inline-block shrink-0 rounded-lg border border-stone-200 bg-stone-100 ${className}`}
      />
    );
  }
  return (
    <img
      src={variantCoverUrl(variantId)}
      alt=""
      loading="lazy"
      decoding="async"
      className={`shrink-0 rounded-lg border border-stone-200 bg-stone-100 object-cover ${className}`}
    />
  );
}
