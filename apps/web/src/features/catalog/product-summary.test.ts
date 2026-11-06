import type { Product } from '@joyeria/shared';
import { describe, expect, it } from 'vitest';
import { availability, priceLabel, productStock } from './product-summary.ts';

function variant(overrides: Partial<Product['variants'][number]> = {}) {
  return {
    id: '00000000-0000-7000-8000-000000000201',
    sku: 'SKU-000001',
    barcode: null,
    label: 'Única',
    salePrice: '50.00',
    minStock: 2,
    stockQuantity: 5,
    stockLevel: 'OK' as const,
    status: 'ACTIVE' as const,
    ...overrides,
  };
}

function product(variants: Product['variants'], status: Product['status'] = 'ACTIVE'): Product {
  return {
    id: '00000000-0000-7000-8000-000000000001',
    categoryId: '00000000-0000-7000-8000-000000000009',
    categoryName: 'Anillos',
    name: 'Anillo',
    description: null,
    model: null,
    status,
    isIncomplete: false,
    hasMissingPrice: false,
    profileIncomplete: false,
    attributes: [],
    axes: [],
    variants,
    photos: [],
  };
}

const OTHER = { id: '00000000-0000-7000-8000-000000000202', sku: 'SKU-000002' };

describe('resumen del producto', () => {
  it('suma el stock de todas las variantes', () => {
    expect(productStock(product([variant(), variant({ stockQuantity: 3 })]))).toBe(8);
  });

  it('precio: único, rango o «Sin definir» (ignora precio 0 y variantes inactivas)', () => {
    expect(priceLabel(product([variant()]))).toMatch(/50,00/);
    expect(priceLabel(product([variant(), variant({ salePrice: '90.00' })]))).toMatch(/–/);
    expect(priceLabel(product([variant({ salePrice: '0.00' })]))).toBe('Sin definir');
    expect(priceLabel(product([variant({ status: 'INACTIVE' })]))).toBe('Sin definir');
  });

  it('disponibilidad: Disponible, Bajo mínimo, Sin stock e Inactivo (según el nivel de la API)', () => {
    expect(availability(product([variant()]), true)?.label).toBe('Disponible');
    expect(
      availability(product([variant({ stockQuantity: 2, stockLevel: 'LOW' })]), true)?.label,
    ).toBe('Bajo mínimo');
    expect(
      availability(product([variant({ stockQuantity: 0, stockLevel: 'OUT' })]), true)?.label,
    ).toBe('Sin stock');
    expect(availability(product([variant()], 'INACTIVE'), true)?.label).toBe('Inactivo');
  });

  it('la UI no recalcula el nivel: usa el stockLevel que informa la API', () => {
    // Cantidad baja pero la API dice OK: no se inventa «Bajo mínimo».
    expect(
      availability(product([variant({ stockQuantity: 1, minStock: 5, stockLevel: 'OK' })]), true)
        ?.label,
    ).toBe('Disponible');
  });

  it('una variante sin piezas junto a otras con stock no vuelve «Sin stock» al producto', () => {
    const mixed = product([
      variant({ stockQuantity: 0, stockLevel: 'OUT', minStock: 0 }),
      variant(OTHER),
    ]);
    expect(availability(mixed, true)?.label).toBe('Disponible');
    const withMinimum = product([
      variant({ stockQuantity: 0, stockLevel: 'OUT', minStock: 2 }),
      variant(OTHER),
    ]);
    expect(availability(withMinimum, true)?.label).toBe('Bajo mínimo');
  });

  it('un producto sin variantes activas no está «Sin stock»: no se informa disponibilidad', () => {
    expect(availability(product([]), true)).toBeNull();
    expect(
      availability(
        product([variant({ status: 'INACTIVE', stockQuantity: 0, stockLevel: 'OUT' })]),
        true,
      ),
    ).toBeNull();
  });

  it('las variantes inactivas no cuentan para la disponibilidad', () => {
    const items = product([
      variant({ status: 'INACTIVE', stockQuantity: 0, stockLevel: 'OUT' }),
      variant(OTHER),
    ]);
    expect(availability(items, true)?.label).toBe('Disponible');
  });

  it('si la API no informa el nivel no se inventa uno', () => {
    expect(
      availability(product([variant({ stockLevel: undefined, stockQuantity: undefined })]), true),
    ).toBeNull();
  });

  it('sin permiso de inventario no se informa la disponibilidad (salvo «Inactivo»)', () => {
    expect(availability(product([variant()]), false)).toBeNull();
    expect(availability(product([variant()], 'INACTIVE'), false)?.label).toBe('Inactivo');
  });
});
