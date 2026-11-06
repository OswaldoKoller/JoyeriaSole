import type { Product } from '@joyeria/shared';
import { formatBs } from '../../lib/format.ts';

type Variant = Product['variants'][number];

/** Piezas totales del producto (suma de sus variantes); 0 si el rol no ve el stock. */
export function productStock(product: Product) {
  return product.variants.reduce((sum, variant) => sum + (variant.stockQuantity ?? 0), 0);
}

/** Precio de venta (neto): uno solo, un rango entre variantes activas o «Sin definir». */
export function priceLabel(product: Product) {
  const prices = product.variants
    .filter((variant) => variant.status === 'ACTIVE')
    .map((variant) => Number(variant.salePrice))
    .filter((price) => price > 0);
  if (prices.length === 0) return 'Sin definir';
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return low === high ? formatBs(low) : `${formatBs(low)} – ${formatBs(high)}`;
}

export type Availability = {
  /** Texto corto para la insignia. */
  label: string;
  /** Clases de color de la insignia (siempre con texto: el color nunca es la única señal). */
  tone: string;
};

/** La API ya calcula el nivel de cada variante (`stockLevel`); la UI solo lo resume. */
function isBelowMinimum(variant: Variant) {
  return variant.stockLevel === 'LOW' || (variant.stockLevel === 'OUT' && variant.minStock > 0);
}

/**
 * Disponibilidad del producto a partir del nivel (`stockLevel`) que la API informa para cada
 * variante activa: «Inactivo», «Sin stock» (todas sin piezas), «Bajo mínimo» (alguna en o bajo su
 * mínimo) o «Disponible». Devuelve null cuando el rol no puede ver el inventario o cuando el
 * producto no tiene variantes activas (no hay nada que informar: no está «Sin stock»).
 */
export function availability(product: Product, canReadInventory: boolean): Availability | null {
  if (product.status === 'INACTIVE')
    return { label: 'Inactivo', tone: 'bg-stone-200 text-stone-700' };
  if (!canReadInventory) return null;
  const active = product.variants.filter((variant) => variant.status === 'ACTIVE');
  if (active.length === 0 || active.some((variant) => variant.stockLevel === undefined)) {
    return null;
  }
  if (active.every((variant) => variant.stockLevel === 'OUT')) {
    return { label: 'Sin stock', tone: 'bg-rose-100 text-rose-900' };
  }
  if (active.some(isBelowMinimum)) {
    return { label: 'Bajo mínimo', tone: 'bg-amber-100 text-amber-900' };
  }
  return { label: 'Disponible', tone: 'bg-emerald-100 text-emerald-900' };
}
