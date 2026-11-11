import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../test/api-mock.ts';
import { renderWithProviders } from '../../test/render.tsx';
import { BusinessSettingsPage } from './business-settings-page.tsx';

const PROVISIONAL = {
  tradeName: 'Joyería Sole',
  address: null,
  phone: null,
  taxId: null,
  receiptShowSeller: false,
  updatedAt: null,
  updatedBy: null,
};

describe('datos del negocio', () => {
  it('avisa que son provisionales y guarda los cambios', async () => {
    const calls = mockApi(
      {
        'GET /settings/business': () => [200, { data: PROVISIONAL }],
        'PUT /settings/business': (call) => [
          200,
          {
            data: {
              ...PROVISIONAL,
              ...(call.body as object),
              updatedAt: '2026-11-11T12:00:00.000Z',
              updatedBy: { id: '01900000-0000-7000-8000-0000000000a1', name: 'Admin' },
            },
          },
        ],
      },
      { permissions: ['settings:manage'] },
    );
    renderWithProviders(<BusinessSettingsPage />);
    const user = userEvent.setup();
    expect(await screen.findByText(/Valores provisionales/)).toBeVisible();
    await user.type(screen.getByLabelText('Dirección (opcional)'), 'Calle Comercio 123');
    await user.type(screen.getByLabelText('NIT (opcional)'), '1234567');
    await user.click(screen.getByLabelText(/nombre de quien atendió/));
    await user.click(screen.getByRole('button', { name: 'Guardar datos' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Datos guardados');
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
      tradeName: 'Joyería Sole',
      address: 'Calle Comercio 123',
      phone: null,
      taxId: '1234567',
      receiptShowSeller: true,
    });
  });

  it('el nombre comercial es obligatorio', async () => {
    const calls = mockApi(
      { 'GET /settings/business': () => [200, { data: PROVISIONAL }] },
      { permissions: ['settings:manage'] },
    );
    renderWithProviders(<BusinessSettingsPage />);
    const user = userEvent.setup();
    await user.clear(await screen.findByLabelText('Nombre comercial'));
    await user.click(screen.getByRole('button', { name: 'Guardar datos' }));
    expect(screen.getByLabelText('Nombre comercial')).toHaveAccessibleDescription(
      'Indique el nombre comercial',
    );
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });
});
