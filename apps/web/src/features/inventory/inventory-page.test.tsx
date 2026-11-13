import type { InventoryItem } from '@joyeria/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../test/render.tsx';
import { InventoryPage } from './inventory-page.tsx';

const VARIANT = '01900000-0000-7000-8000-0000000000e1';
const fresh: InventoryItem = {
  variantId: VARIANT,
  productName: 'Arete Luna',
  variantLabel: null,
  sku: 'SKU-000023',
  barcode: null,
  quantity: 0,
  minStock: 0,
  canInitialize: true,
  level: 'OUT',
};

/** API simulada: la variante sale de la lista «solo sin movimientos» después de registrarla. */
function mockApi() {
  let initialized = false;
  const posts: { url: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith('/auth/me')) {
      return Promise.resolve(
        jsonResponse(200, {
          data: {
            id: VARIANT,
            name: 'Usuario',
            email: 'u@test.local',
            roles: [],
            permissions: ['inventory:read', 'inventory:initial-stock'],
          },
        }),
      );
    }
    if (init?.method === 'POST' && url.endsWith(`/inventory/${VARIANT}/initial`)) {
      initialized = true;
      posts.push({
        url,
        body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      });
      return Promise.resolve(jsonResponse(201, { data: {} }));
    }
    if (url.startsWith('/api/v1/inventory?')) {
      const data = initialized ? [] : [fresh];
      return Promise.resolve(
        jsonResponse(200, { data, meta: { page: 1, pageSize: 25, total: data.length } }),
      );
    }
    return Promise.resolve(
      jsonResponse(200, { data: [], meta: { page: 1, pageSize: 25, total: 0 } }),
    );
  });
  return posts;
}

describe('Stock inicial', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('confirma el registro con un aviso accesible y explica por qué la pieza sale de la lista', async () => {
    const posts = mockApi();
    renderWithProviders(<InventoryPage />, { route: '/inventario?accion=inicial' });
    expect(await screen.findByRole('heading', { name: 'Stock inicial' })).toBeInTheDocument();
    expect(
      screen.getByText(/Solo se listan las variantes que todavía no tienen ningún movimiento/),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Stock inicial de SKU-000023' }));
    await user.type(screen.getByLabelText('Cantidad en piezas'), '5');
    await user.click(screen.getByRole('button', { name: 'Registrar entrada' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(
      'Stock inicial registrado: 5 piezas de Arete Luna (SKU-000023). Ya no aparece en esta lista porque ahora tiene movimientos',
    );
    expect(posts).toEqual([
      {
        url: `/api/v1/inventory/${VARIANT}/initial`,
        body: { quantity: 5, reason: 'Stock inicial' },
      },
    ]);

    // La lista vacía ya no dice solo «No hay variantes para este filtro».
    const empty = await screen.findByText(/No hay variantes pendientes de stock inicial/);
    expect(empty).toHaveTextContent(/Las que ya tienen movimientos no se listan aquí/);
    expect(within(empty).getByRole('link', { name: 'Saldos y alertas' })).toHaveAttribute(
      'href',
      '/inventario',
    );
    expect(screen.queryByText('No hay variantes para este filtro.')).not.toBeInTheDocument();
  });

  it('en Saldos y alertas el aviso es breve y la lista vacía conserva su texto', async () => {
    mockApi();
    renderWithProviders(<InventoryPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Stock inicial de SKU-000023' }));
    await user.type(screen.getByLabelText('Cantidad en piezas'), '1');
    await user.click(screen.getByRole('button', { name: 'Registrar entrada' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      /^Stock inicial registrado: 1 pieza de Arete Luna \(SKU-000023\)\.$/,
    );
    expect(await screen.findByText('No hay variantes para este filtro.')).toBeInTheDocument();
  });
});
