import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../test/render.tsx';
import { DashboardPage } from './dashboard-page.tsx';

type Level = 'OUT' | 'LOW' | 'OK';
const item = (name: string, sku: string, quantity: number, minStock: number, level: Level) => ({
  variantId: `00000000-0000-7000-8000-${sku.padStart(12, '0')}`,
  productName: name,
  variantLabel: null,
  sku: `SKU-${sku}`,
  barcode: null,
  quantity,
  minStock,
  canInitialize: false,
  level,
});

const OUT_ITEMS = [item('Collar Corazón', '2', 0, 2, 'OUT')];
const LOW_ITEMS = [
  // El filtro «bajo mínimo» de la API también devuelve las agotadas con mínimo.
  ...OUT_ITEMS,
  item('Anillo Solitario', '1', 3, 5, 'LOW'),
  item('Aretes Estrella', '3', 1, 4, 'LOW'),
];

function mockApi(options: { permissions?: string[]; failItems?: boolean; empty?: boolean } = {}) {
  const permissions = options.permissions ?? ['inventory:read'];
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith('/auth/me')) {
      return Promise.resolve(
        jsonResponse(200, {
          data: { id: 'u', name: 'Rosa Quispe', email: 'r@test.local', roles: [], permissions },
        }),
      );
    }
    const level = /level=(\w+)/.exec(url)?.[1] ?? 'all';
    const pageSize = Number(/pageSize=(\d+)/.exec(url)?.[1] ?? '25');
    if (options.failItems && pageSize === 100) {
      return Promise.resolve(
        jsonResponse(500, { error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }),
      );
    }
    const rows = options.empty
      ? []
      : level === 'OUT'
        ? OUT_ITEMS
        : level === 'LOW'
          ? LOW_ITEMS
          : [];
    // Totales: 10 variantes en total, 6 disponibles, 1 sin stock → 3 bajo mínimo (exclusivo).
    const totals = options.empty
      ? { all: 4, OUT: 0, LOW: 0, OK: 4 }
      : { all: 10, OUT: 1, LOW: 3, OK: 6 };
    return Promise.resolve(
      jsonResponse(200, {
        data: pageSize === 1 ? [] : rows,
        meta: { page: 1, pageSize, total: totals[level as keyof typeof totals] },
      }),
    );
  });
}

function productOrder() {
  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
  return rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? '');
}

describe('Dashboard', () => {
  it('muestra métricas exactas sin contar dos veces las piezas agotadas', async () => {
    mockApi();
    renderWithProviders(<DashboardPage />);

    const metrics = await screen.findByRole('region', { name: 'Métricas principales' });
    await waitFor(() => {
      expect(
        within(metrics).getByRole('heading', { name: 'Variantes activas' }).closest('article'),
      ).toHaveTextContent('10');
    });
    const valueOf = (name: string) =>
      within(metrics).getByRole('heading', { name }).closest('article');
    expect(valueOf('Disponibles')).toHaveTextContent('6');
    expect(valueOf('Bajo mínimo')).toHaveTextContent('3');
    expect(valueOf('Sin stock')).toHaveTextContent('1');
    expect(
      screen.getByRole('img', { name: /6 disponibles, 3 bajo mínimo, 1 sin stock/ }),
    ).toBeVisible();
  });

  it('muestra marcadores de carga accesibles mientras llegan los datos', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      return url.endsWith('/auth/me')
        ? Promise.resolve(
            jsonResponse(200, {
              data: {
                id: 'u',
                name: 'Rosa',
                email: 'r@t.l',
                roles: [],
                permissions: ['inventory:read'],
              },
            }),
          )
        : new Promise<Response>(() => undefined);
    });
    renderWithProviders(<DashboardPage />);
    // Primero el panel completo mientras llega la sesión; luego los marcadores de cada bloque.
    expect(screen.getByRole('status', { name: 'Cargando panel' })).toBeVisible();
    expect(await screen.findByText('Cargando piezas en alerta…')).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
  });

  it('ordena la tabla al pulsar los encabezados y refleja aria-sort', async () => {
    mockApi();
    renderWithProviders(<DashboardPage />);
    await screen.findByText('Anillo Solitario');

    // Orden inicial: por estado (sin stock primero), luego menos piezas.
    expect(productOrder()[0]).toContain('Collar Corazón');

    const user = userEvent.setup();
    const piezas = screen.getByRole('columnheader', { name: /Piezas/ });
    await user.click(within(piezas).getByRole('button'));
    expect(piezas).toHaveAttribute('aria-sort', 'ascending');
    expect(productOrder().map((text) => text.split('SKU')[0])).toEqual([
      'Collar Corazón',
      'Aretes Estrella',
      'Anillo Solitario',
    ]);

    await user.click(within(piezas).getByRole('button'));
    expect(piezas).toHaveAttribute('aria-sort', 'descending');
    expect(productOrder()[0]).toContain('Anillo Solitario');

    const producto = screen.getByRole('columnheader', { name: /Producto/ });
    await user.click(within(producto).getByRole('button'));
    expect(productOrder()[0]).toContain('Anillo Solitario');
    expect(producto).toHaveAttribute('aria-sort', 'ascending');
    expect(piezas).toHaveAttribute('aria-sort', 'none');
  });

  it('muestra error con reintento si falla la tabla', async () => {
    mockApi({ failItems: true });
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText('No se pudieron cargar las piezas en alerta.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });

  it('muestra un estado vacío cuando no hay piezas en alerta', async () => {
    mockApi({ empty: true });
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText('Todo en orden')).toBeVisible();
  });

  it('sin permiso de inventario no pide datos ni muestra métricas', async () => {
    const fetchMock = mockApi({ permissions: ['catalog:read'] });
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText('Tu cuenta no incluye métricas de inventario.')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Métricas principales' })).not.toBeInTheDocument();
    const inventoryCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input instanceof Request ? input.url : input).includes('/inventory'),
    );
    expect(inventoryCalls).toHaveLength(0);
    expect(screen.getByRole('heading', { name: /Bienvenido\/a, Rosa Quispe/ })).toBeVisible();
  });
});
