import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../test/render.tsx';
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

describe('Movimientos de inventario', () => {
  it('etiqueta en español los movimientos de cambio de pieza y conserva los anteriores', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        jsonResponse(200, { data: MOVEMENTS, meta: { page: 1, pageSize: 25, total: 4 } }),
      ),
    );
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
});
