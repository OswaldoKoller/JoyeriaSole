import type { Product } from '@joyeria/shared';
import { memo, useId } from 'react';
import { Link } from 'react-router';
import { ProductThumb } from './photos/product-thumb.tsx';
import { ProductBadges } from './product-badges.tsx';
import { ProductPrice } from './product-price.tsx';
import { availability, productStock } from './product-summary.ts';

type Props = {
  product: Product;
  canReadInventory: boolean;
  /** Búsqueda (`?q=…&page=…`) del listado, para que «Volver a Productos» conserve el contexto. */
  from?: string;
};

/**
 * Tarjeta resumida del listado: foto principal, nombre, precio de venta, disponibilidad y stock.
 * Toda la tarjeta es un enlace a la ficha completa del producto (`/productos/:id`). Su nombre
 * accesible es «Ver ficha de <nombre>» y su descripción reúne precio, estado y stock.
 */
export const ProductCard = memo(function ProductCard({ product, canReadInventory, from }: Props) {
  const uid = useId();
  const prefixId = `${uid}-prefix`;
  const nameId = `${uid}-name`;
  const infoId = `${uid}-info`;
  const inactive = product.status === 'INACTIVE';
  // «Inactivo» ya lo indican las insignias de la ficha: no se repite.
  const state = inactive ? null : availability(product, canReadInventory);
  const stock = canReadInventory ? productStock(product) : null;

  return (
    <Link
      to={`/productos/${product.id}`}
      state={from === undefined ? undefined : { productsSearch: from }}
      aria-labelledby={`${prefixId} ${nameId}`}
      aria-describedby={infoId}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xs transition-shadow hover:border-brand-500 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      <span id={prefixId} className="sr-only">
        Ver ficha de
      </span>
      <ProductThumb
        product={product}
        decorative
        className="aspect-square h-auto w-full rounded-none! border-0!"
      />
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h2 id={nameId} className="line-clamp-2 text-sm leading-snug font-semibold text-stone-900">
          {product.name}
        </h2>
        <div id={infoId} className="flex flex-1 flex-col gap-1">
          <ProductPrice product={product} className="text-base font-semibold text-stone-900" />
          <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs">
            <ProductBadges product={product} />
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
      </div>
    </Link>
  );
});
