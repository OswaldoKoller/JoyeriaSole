import { PERMISSIONS } from '@joyeria/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api-mock.ts';
import { mockBlobUrls } from '../../test/blob-urls.ts';
import { renderWithProviders } from '../../test/render.tsx';
import { InventoryPage } from './inventory-page.tsx';

const ITEM = {
  variantId: '01900000-0000-7000-8000-0000000000d1',
  productName: 'Anillo Solitario',
  variantLabel: null,
  sku: 'SKU-000001',
  barcode: null,
  quantity: 5,
  minStock: 2,
  canInitialize: false,
  level: 'OK',
};

function mockInventory(permissions: string[]) {
  return mockApi(
    {
      'GET /inventory': () => [200, { data: [ITEM], meta: { page: 1, pageSize: 25, total: 1 } }],
      'GET /inventory/export.csv': () => new Response('x', { status: 200 }),
    },
    { permissions },
  );
}

describe('Saldos y alertas: exportar CSV', () => {
  let blobUrls: ReturnType<typeof mockBlobUrls>;

  beforeEach(() => {
    blobUrls = mockBlobUrls();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });
  afterEach(() => {
    blobUrls.restore();
  });

  it('exporta con la búsqueda y el estado activos', async () => {
    const calls = mockInventory([PERMISSIONS.INVENTORY_READ]);
    renderWithProviders(<InventoryPage />);
    await screen.findByText('Anillo Solitario');

    await userEvent.type(screen.getByLabelText('Buscar por producto, SKU o código'), 'anillo');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await userEvent.selectOptions(screen.getByLabelText('Estado de stock'), 'OK');
    await waitFor(() => {
      expect(calls.at(-1)?.path).toContain('level=OK');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() => {
      expect(calls.map((call) => call.path)).toContain('/inventory/export.csv?level=OK&q=anillo');
    });
  });

  it('sin costs:read no menciona costos; con costs:read avisa que los incluye', async () => {
    mockInventory([PERMISSIONS.INVENTORY_READ]);
    const first = renderWithProviders(<InventoryPage />);
    await screen.findByText('Anillo Solitario');
    expect(screen.queryByText(/costo/i)).not.toBeInTheDocument();
    first.unmount();
    vi.restoreAllMocks();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    mockInventory([PERMISSIONS.INVENTORY_READ, PERMISSIONS.COSTS_READ]);
    renderWithProviders(<InventoryPage />);
    await screen.findByText('Anillo Solitario');
    expect(screen.getByText(/Incluye costo y valor a costo vigente/)).toBeInTheDocument();
  });

  it('no se ofrece sin inventory:read ni en la vista de stock inicial', async () => {
    mockInventory([]);
    const first = renderWithProviders(<InventoryPage />);
    await screen.findByText('Anillo Solitario');
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).not.toBeInTheDocument();
    first.unmount();
    vi.restoreAllMocks();

    mockInventory([PERMISSIONS.INVENTORY_READ]);
    renderWithProviders(<InventoryPage />, { route: '/inventario?accion=inicial' });
    await screen.findByText('Anillo Solitario');
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).not.toBeInTheDocument();
  });
});
