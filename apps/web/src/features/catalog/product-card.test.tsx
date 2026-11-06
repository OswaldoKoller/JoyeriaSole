import type { Product } from '@joyeria/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render.tsx';
import { ProductCard } from './product-card.tsx';

const PRODUCT_ID = '00000000-0000-7000-8000-000000000001';

function variant(n: number, salePrice: string, stockQuantity: number) {
  return {
    id: `00000000-0000-7000-8000-00000000020${n}`,
    sku: `SKU-00000${n}`,
    barcode: null,
    label: `Talla ${n}`,
    salePrice,
    minStock: 1,
    stockQuantity,
    stockLevel: 'OK' as const,
    status: 'ACTIVE' as const,
  };
}

const product = {
  id: PRODUCT_ID,
  categoryId: '00000000-0000-7000-8000-000000000009',
  categoryName: 'Anillos',
  name: 'Anillo luna',
  description: 'Plata 925 con circón',
  model: 'L-12',
  status: 'ACTIVE',
  isIncomplete: false,
  hasMissingPrice: false,
  profileIncomplete: false,
  attributes: [],
  axes: [],
  variants: [variant(1, '80.00', 3), variant(2, '120.00', 4)],
  photos: [],
} satisfies Product;

function renderCard(p: Product = product, canReadInventory = true) {
  return renderWithProviders(<ProductCard product={p} canReadInventory={canReadInventory} />);
}

describe('ProductCard (tarjeta resumida)', () => {
  it('muestra solo lo esencial: foto, nombre, precio, disponibilidad y stock', () => {
    renderCard();
    expect(screen.getByRole('heading', { name: 'Anillo luna' })).toBeInTheDocument();
    expect(screen.getByText(/80,00.*–.*120,00/)).toBeInTheDocument();
    expect(screen.getByText('Disponible')).toBeInTheDocument();
    expect(screen.getByText('Stock:').parentElement).toHaveTextContent('Stock: 7');
    // Nada de detalle en la tarjeta: ni descripción, ni SKU, ni acciones.
    expect(screen.queryByText('Plata 925 con circón')).not.toBeInTheDocument();
    expect(screen.queryByText(/SKU-000001/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('toda la tarjeta es un enlace a la ficha del producto', () => {
    renderCard();
    expect(screen.getByRole('link', { name: 'Ver ficha de Anillo luna' })).toHaveAttribute(
      'href',
      `/productos/${PRODUCT_ID}`,
    );
  });

  it('indica «Sin stock» cuando no hay piezas', () => {
    renderCard({ ...product, variants: [variant(1, '80.00', 0)] });
    expect(screen.getByText('Sin stock')).toBeInTheDocument();
  });

  it('oculta disponibilidad y stock si el rol no ve el inventario', () => {
    renderCard(product, false);
    expect(screen.queryByText('Disponible')).not.toBeInTheDocument();
    expect(screen.queryByText(/Stock:/)).not.toBeInTheDocument();
  });
});
