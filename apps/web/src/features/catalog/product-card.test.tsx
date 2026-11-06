import { PERMISSIONS, type Product } from '@joyeria/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../test/render.tsx';
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

function mockSession(permissions: string[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(
      jsonResponse(200, {
        data: {
          id: '00000000-0000-7000-8000-0000000000aa',
          email: 'a@example.invalid',
          name: 'Ana',
          roleName: 'Rol',
          permissions,
          mustChangePassword: false,
        },
      }),
    ),
  );
}

function renderCard(props: { defaultOpen?: boolean } = {}) {
  return renderWithProviders(
    <ProductCard
      product={product}
      canManage
      canReadInventory
      onEdit={vi.fn()}
      onError={vi.fn()}
      onWarnings={vi.fn()}
      {...props}
    />,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProductCard (tarjeta resumida)', () => {
  it('resume lo más relevante: nombre, rubro, rango de precio, variantes y stock', () => {
    mockSession([PERMISSIONS.CATALOG_MANAGE]);
    renderCard();
    expect(screen.getByRole('heading', { name: /Anillo luna/ })).toBeInTheDocument();
    expect(screen.getByText('Anillos · L-12')).toBeInTheDocument();
    expect(screen.getByText(/80,00.*–.*120,00/)).toBeInTheDocument();
    expect(screen.getByText('Variantes:').nextSibling).toHaveTextContent('2');
    expect(screen.getByText('Stock:').nextSibling).toHaveTextContent('7');
  });

  it('deja el detalle (variantes, descripción, acciones) detrás de «Ver detalle»', async () => {
    mockSession([PERMISSIONS.CATALOG_MANAGE]);
    renderCard();
    expect(screen.queryByText('Plata 925 con circón')).not.toBeInTheDocument();
    expect(screen.queryByText(/SKU-000001/, { selector: 'p' })).not.toBeInTheDocument();
    expect(screen.queryByText('Imprimir etiquetas')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Ver detalle de Anillo luna' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);

    expect(screen.getByText('Plata 925 con circón')).toBeInTheDocument();
    expect(screen.getByText(/SKU-000001/, { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Imprimir etiquetas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ocultar detalle de Anillo luna' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('se abre sola cuando la búsqueda deja un único producto', () => {
    mockSession([PERMISSIONS.CATALOG_MANAGE]);
    renderCard({ defaultOpen: true });
    expect(screen.getByText(/SKU-000001/, { selector: 'p' })).toBeInTheDocument();
  });
});
