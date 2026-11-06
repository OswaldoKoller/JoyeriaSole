import type { Product } from '@joyeria/shared';
import { priceLabel } from './product-summary.ts';

/**
 * Precio de venta del producto. El precio es NETO (antes de impuestos, D7): se indica junto al
 * monto para que nadie lo tome por un precio final al público.
 */
export function ProductPrice({
  product,
  className = '',
}: {
  product: Product;
  className?: string;
}) {
  const label = priceLabel(product);
  return (
    <p className={className}>
      {label}
      {label !== 'Sin definir' && (
        <span className="ml-1 text-xs font-normal text-stone-600">neto</span>
      )}
    </p>
  );
}
