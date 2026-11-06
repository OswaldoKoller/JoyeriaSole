import type { Product } from '@joyeria/shared';

const currency = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' });

/** Piezas totales del producto (suma de sus variantes); 0 si el rol no ve el stock. */
export function productStock(product: Product) {
  return product.variants.reduce((sum, variant) => sum + (variant.stockQuantity ?? 0), 0);
}

/** Precio de venta: uno solo, un rango entre variantes activas o «Sin definir». */
export function priceLabel(product: Product) {
  const prices = product.variants
    .filter((variant) => variant.status === 'ACTIVE')
    .map((variant) => Number(variant.salePrice))
    .filter((price) => price > 0);
  if (prices.length === 0) return 'Sin definir';
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return low === high ? currency.format(low) : `${currency.format(low)} – ${currency.format(high)}`;
}

export type Availability = {
  /** Texto corto para la insignia. */
  label: string;
  /** Clases de color de la insignia (siempre con texto: el color nunca es la única señal). */
  tone: string;
};

/**
 * Disponibilidad del producto a partir del stock de sus variantes activas:
 * «Inactivo», «Sin stock», «Bajo mínimo» (alguna variante en o bajo su mínimo) o «Disponible».
 * Devuelve null cuando el rol no puede ver el inventario.
 */
export function availability(product: Product, canReadInventory: boolean): Availability | null {
  if (product.status === 'INACTIVE')
    return { label: 'Inactivo', tone: 'bg-stone-200 text-stone-700' };
  if (!canReadInventory) return null;
  const active = product.variants.filter((variant) => variant.status === 'ACTIVE');
  if (active.every((variant) => (variant.stockQuantity ?? 0) === 0)) {
    return { label: 'Sin stock', tone: 'bg-rose-100 text-rose-900' };
  }
  if (
    active.some(
      (variant) => variant.minStock > 0 && (variant.stockQuantity ?? 0) <= variant.minStock,
    )
  ) {
    return { label: 'Bajo mínimo', tone: 'bg-amber-100 text-amber-900' };
  }
  return { label: 'Disponible', tone: 'bg-emerald-100 text-emerald-900' };
}
