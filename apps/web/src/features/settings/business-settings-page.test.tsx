import { RECEIPT_POLICY_NOTE } from '@joyeria/shared';
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
  receiptFooterNote: RECEIPT_POLICY_NOTE,
  logo: null,
  updatedAt: null,
  updatedBy: null,
};

const LOGO = {
  sha256: 'a'.repeat(64),
  width: 600,
  height: 200,
  sizeBytes: 12_000,
  updatedAt: '2026-11-14T12:00:00.000Z',
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
      receiptFooterNote: RECEIPT_POLICY_NOTE,
    });
  });

  it('la leyenda del pie trae la política de la tienda y se puede quitar dejándola vacía', async () => {
    const calls = mockApi(
      {
        'GET /settings/business': () => [200, { data: PROVISIONAL }],
        'PUT /settings/business': (call) => [
          200,
          { data: { ...PROVISIONAL, ...(call.body as object), receiptFooterNote: null } },
        ],
      },
      { permissions: ['settings:manage'] },
    );
    renderWithProviders(<BusinessSettingsPage />);
    const user = userEvent.setup();
    const note = await screen.findByLabelText('Leyenda al pie del comprobante (opcional)');
    expect(note).toHaveValue(RECEIPT_POLICY_NOTE);
    await user.clear(note);
    await user.click(screen.getByRole('button', { name: 'Guardar datos' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Datos guardados');
    expect(calls.find((call) => call.method === 'PUT')?.body).toMatchObject({
      receiptFooterNote: null,
    });
  });

  it('sube el logo, lo muestra y permite quitarlo', async () => {
    let current: typeof PROVISIONAL | (Omit<typeof PROVISIONAL, 'logo'> & { logo: typeof LOGO }) =
      PROVISIONAL;
    const calls = mockApi(
      {
        'GET /settings/business': () => [200, { data: current }],
        'PUT /settings/business/logo': () => {
          current = { ...PROVISIONAL, logo: LOGO };
          return [200, { data: current }];
        },
        'DELETE /settings/business/logo': () => {
          current = PROVISIONAL;
          return [200, { data: current }];
        },
      },
      { permissions: ['settings:manage'] },
    );
    renderWithProviders(<BusinessSettingsPage />);
    const user = userEvent.setup();
    expect(await screen.findByText(/Todavía no hay un logo/)).toBeVisible();
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', {
      type: 'image/png',
    });
    await user.upload(screen.getByLabelText('Subir logo'), file);
    expect(await screen.findByText(/Logo guardado/)).toBeVisible();
    expect(screen.getByRole('img', { name: 'Logo de Joyería Sole' })).toHaveAttribute(
      'src',
      `/api/v1/settings/business/logo?v=${LOGO.sha256}`,
    );
    expect(
      calls.some((call) => call.method === 'PUT' && call.path === '/settings/business/logo'),
    ).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Quitar logo' }));
    expect(await screen.findByText(/Logo quitado/)).toBeVisible();
    expect(screen.queryByRole('img', { name: 'Logo de Joyería Sole' })).not.toBeInTheDocument();
  });

  it('rechaza en el navegador archivos que no son imagen o pesan más de 2 MB, sin enviarlos', async () => {
    const calls = mockApi(
      { 'GET /settings/business': () => [200, { data: PROVISIONAL }] },
      { permissions: ['settings:manage'] },
    );
    renderWithProviders(<BusinessSettingsPage />);
    const user = userEvent.setup({ applyAccept: false });
    const input = await screen.findByLabelText('Subir logo');
    await user.upload(input, new File(['texto'], 'logo.txt', { type: 'text/plain' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Elija una imagen PNG, JPG o WebP.');
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'grande.png', {
      type: 'image/png',
    });
    await user.upload(input, big);
    expect(await screen.findByRole('alert')).toHaveTextContent(/más de 2 MB/);
    expect(calls.some((call) => call.path === '/settings/business/logo')).toBe(false);
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
