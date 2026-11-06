import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../test/render.tsx';
import { SuppliersPage } from './suppliers-page.tsx';

const base = {
  taxId: null,
  contactName: null,
  phone: null,
  whatsapp: null,
  email: null,
  address: null,
  paymentTerms: null,
  notes: null,
  isActive: true,
  createdAt: '2026-11-05T00:00:00.000Z',
  updatedAt: '2026-11-05T00:00:00.000Z',
};
const national = {
  ...base,
  id: '1',
  name: 'Taller Luna',
  type: 'NATIONAL',
  country: null,
  defaultCurrency: 'BOB',
};
const foreign = {
  ...base,
  id: '2',
  name: 'Importadora Sol',
  type: 'FOREIGN',
  country: 'China',
  whatsapp: '+86 130 0000 0000',
  defaultCurrency: 'USD',
};

function mockApi(permissions: string[], requests: { url: string; body?: unknown }[] = []) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith('/auth/me')) {
      return jsonResponse(200, {
        data: { id: 'user', name: 'Usuario', email: 'u@test.local', roles: [], permissions },
      });
    }
    if (url.startsWith('/api/v1/suppliers?')) {
      requests.push({ url });
      const type = new URL(url, 'http://test.local').searchParams.get('type');
      const data = [national, foreign].filter((item) => type === 'all' || item.type === type);
      return jsonResponse(200, { data, meta: { page: 1, pageSize: 25, total: data.length } });
    }
    if (url === '/api/v1/suppliers' && init?.method === 'POST') {
      requests.push({ url, body: JSON.parse(typeof init.body === 'string' ? init.body : '{}') });
      return jsonResponse(201, { data: { ...foreign, id: '3' } });
    }
    throw new Error(`Petición inesperada: ${url}`);
  });
}

describe('pantalla de proveedores', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('permite consultar proveedores sin mostrar acciones a quien solo puede leer', async () => {
    mockApi(['suppliers:read']);
    renderWithProviders(<SuppliersPage />);
    expect(await screen.findByText('Taller Luna')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo proveedor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar Taller Luna/ })).not.toBeInTheDocument();
  });

  it('muestra tipo, país y moneda de cada proveedor', async () => {
    mockApi(['suppliers:read']);
    renderWithProviders(<SuppliersPage />);
    const foreignRow = (await screen.findByText('Importadora Sol')).closest('tr');
    expect(foreignRow).toHaveTextContent('Del exterior');
    expect(foreignRow).toHaveTextContent('China');
    expect(foreignRow).toHaveTextContent('Dólares (USD)');
    expect(screen.getByText('Taller Luna').closest('tr')).toHaveTextContent('Nacional');
    expect(screen.getByText('Taller Luna').closest('tr')).toHaveTextContent('Bolivianos (Bs)');
  });

  it('filtra por tipo enviando el parámetro a la API', async () => {
    const requests: { url: string }[] = [];
    mockApi(['suppliers:read'], requests);
    renderWithProviders(<SuppliersPage />);
    await screen.findByText('Taller Luna');
    await userEvent.selectOptions(screen.getByLabelText('Filtrar por tipo'), 'FOREIGN');
    expect(await screen.findByText('Importadora Sol')).toBeInTheDocument();
    expect(screen.queryByText('Taller Luna')).not.toBeInTheDocument();
    expect(requests.at(-1)?.url).toContain('type=FOREIGN');
  });

  it('envía tipo, país, WhatsApp, moneda y condiciones al crear un proveedor del exterior', async () => {
    const requests: { url: string; body?: unknown }[] = [];
    mockApi(['suppliers:read', 'suppliers:manage'], requests);
    renderWithProviders(<SuppliersPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo proveedor' }));
    expect(screen.getByLabelText('Tipo de proveedor')).toHaveValue('NATIONAL');
    expect(screen.getByLabelText('Moneda habitual de compra')).toHaveValue('BOB');
    await userEvent.type(screen.getByLabelText('Nombre'), 'Importadora Sol');
    await userEvent.selectOptions(screen.getByLabelText('Tipo de proveedor'), 'FOREIGN');
    await userEvent.type(screen.getByLabelText('País'), 'China');
    await userEvent.type(screen.getByLabelText('WhatsApp'), '+86 130 0000 0000');
    await userEvent.selectOptions(screen.getByLabelText('Moneda habitual de compra'), 'USD');
    await userEvent.type(screen.getByLabelText('Condiciones de pago'), '50% anticipo');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar proveedor' }));
    const post = requests.find((request) => request.body !== undefined);
    expect(post?.body).toMatchObject({
      name: 'Importadora Sol',
      type: 'FOREIGN',
      country: 'China',
      whatsapp: '+86 130 0000 0000',
      defaultCurrency: 'USD',
      paymentTerms: '50% anticipo',
    });
  });
});
