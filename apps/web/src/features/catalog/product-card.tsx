import type { Product } from '@joyeria/shared';
import { Link } from 'react-router';
import { ProductThumb } from './photos/product-thumb.tsx';
import { availability, priceLabel, productStock } from './product-summary.ts';

type Props = {
  product: Product;
  canReadInventory: boolean;
};

/**
 * Tarjeta resumida del listado: foto principal, nombre, precio de venta, disponibilidad y stock.
 * Toda la tarjeta es un enlace a la ficha completa del producto (`/productos/:id`).
 */
export function ProductCard({ product, canReadInventory }: Props) {
  const state = availability(product, canReadInventory);
  const stock = canReadInventory ? productStock(product) : null;

  return (
    <Link
      to={`/productos/${product.id}`}
      aria-label={`Ver ficha de ${product.name}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xs transition-shadow hover:border-brand-500 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      <ProductThumb
        product={product}
        className="aspect-square h-auto w-full rounded-none! border-0!"
      />
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h2 className="line-clamp-2 text-sm leading-snug font-semibold text-stone-900">
          {product.name}
        </h2>
        <p className="text-base font-semibold text-stone-900">{priceLabel(product)}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs">
          {state && (
            <span className={`rounded-full px-2 py-0.5 font-medium ${state.tone}`}>
              {state.label}
            </span>
          )}
          {stock !== null && (
            <span className="text-stone-600">
              Stock: <span className="font-medium text-stone-900">{stock}</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
