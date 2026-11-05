import type { Product } from '@joyeria/shared';

const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';

/**
 * Insignias de la ficha (C1, D9): «Ficha incompleta» (sin descripción ni características) y
 * «Sin precio» (alguna variante activa con precio 0), independientes entre sí. Las fichas
 * inactivas no las muestran: ya no están en uso.
 */
export function ProductBadges({
  product,
}: {
  product: Pick<Product, 'isIncomplete' | 'hasMissingPrice' | 'status'>;
}) {
  const inactive = product.status === 'INACTIVE';
  return (
    <>
      {product.status !== 'ACTIVE' && (
        <span className={`${base} bg-stone-200 text-stone-700`}>
          {inactive ? 'Inactivo' : 'Borrador'}
        </span>
      )}
      {!inactive && product.isIncomplete && (
        <span className={`${base} bg-amber-100 text-amber-900`}>Ficha incompleta</span>
      )}
      {!inactive && product.hasMissingPrice && (
        <span className={`${base} bg-rose-100 text-rose-900`}>Sin precio</span>
      )}
    </>
  );
}
