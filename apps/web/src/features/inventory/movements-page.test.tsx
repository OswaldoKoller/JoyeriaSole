import { PERMISSIONS } from '@joyeria/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api-mock.ts';
import { mockBlobUrls } from '../../test/blob-urls.ts';
import { renderWithProviders } from '../../test/render.tsx';
import { MovementsPage } from './movements-page.tsx';

const base = {
  sku: 'SKU-000001',
  productName: 'Anillo Solitario',
  variantLabel: null,
  balanceBefore: 3,
  notes: null,
  userId: '00000000-0000-7000-8000-000000000001',
  createdAt: '2026-11-05T15:00:00.000Z',
};

const MOVEMENTS = [
  { ...base, id: '4', type: 'EXCHANGE_OUT', quantity: -1, balanceAfter: 2, reason: 'Talla' },
  { ...base, id: '3', type: 'EXCHANGE_IN', quantity: 1, balanceAfter: 4, reason: 'Talla' },
  {
    ...base,
    id: '2',
    type: 'COUNT_ADJUSTMENT',
    quantity: -1,
    balanceAfter: 2,
    reason: 'Conteo CNT-000001',
  },
  { ...base, id: '1', type: 'STOCK_ENTRY', quantity: 5, balanceAfter: 8, reason: 'ING-000001' },
];

const PAGE = { data: MOVEMENTS, meta: { page: 1, pageSize: 25, total: 4 } };
const READER = [PERMISSIONS.INVENTORY_READ];

function mockMovements(permissions: string[] = READER) {
  return mockApi(
    {
      'GET /inventory/movements': () => [200, PAGE],
      'GET /inventory/movements/export.csv': () => new Response('x', { status: 200 }),
    },
    { permissions },
  );
}

const listCalls = (calls: { path: string }[]) =>
  calls.filter((call) => call.path.startsWith('/inventory/movements?')).map((call) => call.path);

describe('Movimientos de inventario', () => {
  let blobUrls: ReturnType<typeof mockBlobUrls>;

  beforeEach(() => {
    blobUrls = mockBlobUrls();
  });
  afterEach(() => {
    blobUrls.restore();
  });

  it('etiqueta en español los movimientos de cambio de pieza y conserva los anteriores', async () => {
    mockMovements();
    renderWithProviders(<MovementsPage />);

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    expect(within(table).getByText('Cambio: salida de pieza entregada')).toBeInTheDocument();
    expect(within(table).getByText('Cambio: entrada de pieza devuelta')).toBeInTheDocument();
    expect(within(table).getByText('Conteo')).toBeInTheDocument();
    expect(within(table).getByText('Ingreso')).toBeInTheDocument();
    expect(within(table).queryByText('EXCHANGE_OUT')).not.toBeInTheDocument();
  });

  it('muestra «Exportar CSV» solo a quien tiene inventory:read', async () => {
    mockMovements([]);
    renderWithProviders(<MovementsPage />);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).not.toBeInTheDocument();
  });

  it('el listado y la exportación usan los mismos filtros', async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const calls = mockMovements();
    renderWithProviders(<MovementsPage />);
    await screen.findByRole('table');

    await userEvent.selectOptions(screen.getByLabelText('Tipo de movimiento'), 'ADJUSTMENT');
    await userEvent.type(screen.getByLabelText('Desde'), '2026-11-01');
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-11-12');
    await waitFor(() => {
      expect(listCalls(calls).at(-1)).toBe(
        '/inventory/movements?type=ADJUSTMENT&from=2026-11-01&to=2026-11-12&page=1&pageSize=25',
      );
    });

    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() => {
      expect(calls.map((call) => call.path)).toContain(
        '/inventory/movements/export.csv?type=ADJUSTMENT&from=2026-11-01&to=2026-11-12',
      );
    });
    await waitFor(() => {
      expect(click).toHaveBeenCalled();
    });
  });

  it('un rango de fechas invertido muestra el error y no cambia la consulta', async () => {
    const calls = mockMovements();
    renderWithProviders(<MovementsPage />);
    await screen.findByRole('table');
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-11-01');
    await waitFor(() => {
      expect(listCalls(calls).at(-1)).toContain('to=2026-11-01');
    });
    const before = listCalls(calls).length;
    // El atributo `max` solo guía al selector de fechas: aquí se fuerza escribiendo el valor.
    await userEvent.type(screen.getByLabelText('Desde'), '2026-11-10');
    expect(
      await screen.findByText('La fecha final no puede ser anterior a la inicial'),
    ).toBeInTheDocument();
    expect(listCalls(calls)).toHaveLength(before);
  });

  it('«Limpiar filtros» restablece los campos y quita el botón', async () => {
    mockMovements();
    renderWithProviders(<MovementsPage />);
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Tipo de movimiento'), 'LOSS');
    await userEvent.type(screen.getByLabelText('Desde'), '2026-11-01');
    await userEvent.click(await screen.findByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByLabelText('Tipo de movimiento')).toHaveValue('');
    expect(screen.getByLabelText('Desde')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
  });
});
