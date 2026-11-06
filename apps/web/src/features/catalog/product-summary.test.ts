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

  it('disponibilidad: Disponible, Bajo mínimo, Sin stock e Inactivo', () => {
    expect(availability(product([variant()]), true)?.label).toBe('Disponible');
    expect(availability(product([variant({ stockQuantity: 2 })]), true)?.label).toBe('Bajo mínimo');
    expect(availability(product([variant({ stockQuantity: 0 })]), true)?.label).toBe('Sin stock');
    expect(availability(product([variant()], 'INACTIVE'), true)?.label).toBe('Inactivo');
  });

  it('sin permiso de inventario no se informa la disponibilidad (salvo «Inactivo»)', () => {
    expect(availability(product([variant()]), false)).toBeNull();
    expect(availability(product([variant()], 'INACTIVE'), false)?.label).toBe('Inactivo');
  });
});
