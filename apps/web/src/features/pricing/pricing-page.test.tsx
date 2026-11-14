import { DEFAULT_ROLE_PERMISSIONS, type PriceChange, type PricingVariant } from '@joyeria/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../test/render.tsx';
import { formatBsPrecise } from '../../lib/format.ts';
import { parsePriceInput, profitView } from './price-math.ts';
import { PricingPage } from './pricing-page.tsx';

const ID_A = '01900000-0000-7000-8000-00000000000a';
const ID_B = '01900000-0000-7000-8000-00000000000b';
const CATEGORY = '01900000-0000-7000-8000-0000000000c1';

const withCosts: PricingVariant = {
  variantId: ID_A,
  sku: 'SKU-000001',
  barcode: null,
  productId: ID_A,
  productName: 'Anillo Luna',
  variantLabel: 'Única',
  categoryId: CATEGORY,
  categoryName: 'Anillos',
  salePrice: '100.00',
  stockQuantity: 5,
  costs: {
    purchaseUnitCost: '30.0000',
    purchaseQty: 10,
    purchaseSubtotal: '300.0000',
    extraUnitCost: '10.0000',
    totalUnitCost: '40.0000',
    lastEntryId: ID_B,
    lastEntryNumber: 7,
    lastEntryAt: '2026-11-01T12:00:00.000Z',
  },
  pending: null,
};
const noPrice: PricingVariant = {
  ...withCosts,
  variantId: ID_B,
  sku: 'SKU-000002',
  productName: 'Collar Sol',
  salePrice: '0.00',
};

const pendingChange: PriceChange = {
  id: ID_B,
  variantId: ID_A,
  sku: 'SKU-000001',
  productName: 'Anillo Luna',
  variantLabel: 'Única',
  previousPrice: '100.00',
  newPrice: '120.00',
  status: 'PENDING',
  origin: 'REQUEST',
  requestedBy: { id: ID_A, name: 'Rosa Responsable' },
  decidedBy: null,
  createdAt: '2026-11-05T12:00:00.000Z',
  decidedAt: null,
  reason: 'Temporada',
  decisionComment: null,
  costSnapshot: '40.0000',
  batchId: null,
};

interface Call {
  method: string;
  url: string;
  body?: unknown;
}

function mockApi(permissions: string[], variants: PricingVariant[], calls: Call[] = []) {
  const showCosts = permissions.includes('costs:read');
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    if (url.endsWith('/auth/me')) {
      return Promise.resolve(
        jsonResponse(200, {
          data: { id: ID_A, name: 'Usuario', email: 'u@test.local', roles: [], permissions },
        }),
      );
    }
    calls.push({ method, url, body });
    if (url.startsWith('/api/v1/pricing/variants?')) {
      const data = variants.map((row) => (showCosts ? row : { ...row, costs: null }));
      return Promise.resolve(
        jsonResponse(200, { data, meta: { page: 1, pageSize: 25, total: data.length } }),
      );
    }
    if (url.startsWith('/api/v1/pricing/changes?status=PENDING')) {
      return Promise.resolve(
        jsonResponse(200, {
          data: [pendingChange],
          meta: { page: 1, pageSize: 100, total: 1 },
        }),
      );
    }
    if (url === '/api/v1/pricing/pending-count') {
      return Promise.resolve(jsonResponse(200, { data: { count: 1 } }));
    }
    if (url.startsWith('/api/v1/categories')) {
      return Promise.resolve(jsonResponse(200, { data: [] }));
    }
    if (method === 'POST') {
      return Promise.resolve(jsonResponse(201, { data: [] }));
    }
    throw new Error(`Petición inesperada: ${method} ${url}`);
  });
  return calls;
}

/** Rol que solo SOLICITA precios (p. ej. un rol personalizado): sin `prices:approve`. */
const PROPOSER = ['catalog:read', 'costs:read', 'inventory:read', 'prices:propose'];
const ADMIN = [...PROPOSER, 'prices:approve'];
/** Responsable de inventario con sus permisos por defecto (regla 2026-11-05: también aprueba). */
const RESPONSABLE = [...DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions];

describe('cálculo de ganancia en la interfaz', () => {
  it('interpreta el precio con coma o punto y lo normaliza a 2 decimales', () => {
    expect(parsePriceInput('115,5')).toEqual({ status: 'valid', value: '115.50' });
    expect(parsePriceInput(' 97.9 ')).toEqual({ status: 'valid', value: '97.90' });
    expect(parsePriceInput('0')).toEqual({ status: 'valid', value: '0.00' });
    expect(parsePriceInput('')).toEqual({ status: 'empty' });
    expect(parsePriceInput('abc').status).toBe('invalid');
    expect(parsePriceInput('-5').status).toBe('invalid');
    expect(parsePriceInput('1,234').status).toBe('invalid');
  });

  it('calcula la ganancia exacta y deja el porcentaje vacío con costo 0 o sin costo', () => {
    expect(profitView('100.00', '40.0000')).toEqual({ profit: '60.00', percent: '150.00' });
    expect(profitView('50.00', '0.0000')).toEqual({ profit: '50.00', percent: null });
    expect(profitView('50.00', null)).toEqual({ profit: null, percent: null });
    expect(formatBsPrecise(null)).toBe('—');
  });
});

describe('pantalla de precios', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('muestra el panel de costos y calcula la ganancia en vivo al escribir el nuevo precio', async () => {
    mockApi(PROPOSER, [withCosts]);
    renderWithProviders(<PricingPage />);
    const row = (await screen.findByText('Anillo Luna')).closest('tr');
    if (!row) throw new Error('Falta la fila');
    const scope = within(row);

    // Panel de costos: precio de compra, subtotal, costos adicionales y costo total.
    expect(scope.getByText('ING-000007')).toBeInTheDocument();
    expect(scope.getByText('10 piezas')).toBeInTheDocument();
    // Ganancia del precio vigente: 100 - 40 = 60 (150 %).
    expect(
      scope.getByLabelText(/Ganancia del precio vigente: .*60,00.*150,00 % sobre el costo total/),
    ).toBeInTheDocument();

    const input = scope.getByLabelText('Nuevo precio de SKU-000001');
    await userEvent.setup().type(input, '97,9');
    // 97,90 - 40 = 57,90 (144,75 %): se actualiza mientras se escribe.
    expect(
      scope.getByLabelText(/Ganancia del nuevo precio: .*57,90.*144,75 % sobre el costo total/),
    ).toBeInTheDocument();
  });

  it('avisa cuando el nuevo precio es menor al costo y no lo bloquea', async () => {
    mockApi(PROPOSER, [withCosts]);
    renderWithProviders(<PricingPage />);
    const input = await screen.findByLabelText('Nuevo precio de SKU-000001');
    await userEvent.setup().type(input, '25');
    expect(screen.getAllByText('Precio menor al costo').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Solicitar cambio \(1\)/ })).toBeEnabled();
  });

  it('marca «Sin precio» y rotula el precio como neto', async () => {
    mockApi(PROPOSER, [noPrice]);
    renderWithProviders(<PricingPage />);
    expect(await screen.findByText('Sin precio')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Precio de venta (neto)' }),
    ).toBeInTheDocument();
  });

  it('sin costs:read no hay panel de costos ni ganancia', async () => {
    mockApi(['catalog:read', 'prices:propose'], [withCosts]);
    renderWithProviders(<PricingPage />);
    expect(await screen.findByText('Anillo Luna')).toBeInTheDocument();
    for (const name of ['Costo total unitario', 'Ganancia vigente', 'Precio de compra (Bs)']) {
      expect(screen.queryByRole('columnheader', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/Ganancia/)).not.toBeInTheDocument();
  });

  it('un rol sin permiso de aprobar ve «Solicitar cambio» y envía las solicitudes en lote', async () => {
    const calls = mockApi(PROPOSER, [withCosts, noPrice]);
    renderWithProviders(<PricingPage />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nuevo precio de SKU-000001'), '120');
    await user.type(screen.getByLabelText('Nuevo precio de SKU-000002'), '80,5');
    expect(screen.queryByRole('button', { name: /Aplicar ahora/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Pendientes \(/ })).not.toBeInTheDocument();
    expect(
      screen.getByText(/no rige hasta que lo apruebe quien autoriza precios/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Solicitar cambio \(2\)/ }));
    expect(
      await screen.findByText('Se enviaron 2 solicitudes de cambio de precio para su aprobación.'),
    ).toBeInTheDocument();
    const post = calls.find((call) => call.method === 'POST');
    expect(post?.url).toBe('/api/v1/pricing/requests');
    expect(post?.body).toEqual({
      items: [
        { variantId: ID_A, newPrice: '120.00' },
        { variantId: ID_B, newPrice: '80.50' },
      ],
      reason: null,
    });
  });

  it('el Administrador ve «Aplicar ahora» y el contador de pendientes', async () => {
    const calls = mockApi(ADMIN, [withCosts]);
    renderWithProviders(<PricingPage />);
    const user = userEvent.setup();
    expect(await screen.findByRole('tab', { name: 'Pendientes (1)' })).toBeInTheDocument();
    await user.type(await screen.findByLabelText('Nuevo precio de SKU-000001'), '130');
    await user.click(screen.getByRole('button', { name: /Aplicar ahora \(1\)/ }));
    expect(await screen.findByText('Se aplicó 1 precio nuevo.')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'POST')?.url).toBe('/api/v1/pricing/apply');
  });

  it('el Responsable de inventario (permisos por defecto) aplica el precio sin solicitarlo', async () => {
    expect(RESPONSABLE).toContain('prices:approve');
    const calls = mockApi(RESPONSABLE, [withCosts]);
    renderWithProviders(<PricingPage />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nuevo precio de SKU-000001'), '125');
    expect(screen.queryByRole('button', { name: /Solicitar cambio/ })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Usted autoriza precios: el cambio rige de inmediato/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Aplicar ahora \(1\)/ }));
    expect(await screen.findByText('Se aplicó 1 precio nuevo.')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'POST')?.url).toBe('/api/v1/pricing/apply');
  });

  it('no deja enviar sin un precio válido seleccionado', async () => {
    mockApi(PROPOSER, [withCosts]);
    renderWithProviders(<PricingPage />);
    const input = await screen.findByLabelText('Nuevo precio de SKU-000001');
    await userEvent.setup().type(input, 'abc');
    expect(await screen.findByText(/hasta 2 decimales/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Solicitar cambio \(0\)/ })).toBeDisabled();
  });

  it('el Administrador aprueba en masa y el rechazo exige comentario', async () => {
    const calls = mockApi(ADMIN, [withCosts]);
    renderWithProviders(<PricingPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: /Pendientes/ }));
    expect(await screen.findByText('Rosa Responsable')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Seleccionar todas'));
    await user.click(screen.getByRole('button', { name: /Rechazar seleccionadas/ }));
    await user.click(screen.getByRole('button', { name: /Confirmar rechazo/ }));
    expect(
      await screen.findByText('Indique el motivo del rechazo (obligatorio).'),
    ).toBeInTheDocument();
    expect(calls.some((call) => call.url.includes('/reject'))).toBe(false);

    await user.type(screen.getByLabelText(/Motivo del rechazo/), 'Muy caro');
    await user.click(screen.getByRole('button', { name: /Confirmar rechazo/ }));
    await screen.findByText('Se rechazó 1 solicitud.');
    const reject = calls.find((call) => call.url.endsWith('/changes/reject'));
    expect(reject?.body).toEqual({ ids: [ID_B], comment: 'Muy caro' });

    await user.click(screen.getByLabelText('Seleccionar todas'));
    await user.click(screen.getByRole('button', { name: /Aprobar seleccionadas \(1\)/ }));
    await screen.findByText('Se aprobó 1 cambio de precio.');
    expect(calls.find((call) => call.url.endsWith('/changes/approve'))?.body).toEqual({
      ids: [ID_B],
    });
  });

  it('quien solo solicita no ve controles de aprobación en Pendientes', async () => {
    mockApi(PROPOSER, [withCosts]);
    renderWithProviders(<PricingPage />);
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Pendientes' }));
    expect(await screen.findByText('Rosa Responsable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aprobar seleccionadas/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Seleccionar todas')).not.toBeInTheDocument();
    // La solicitud es suya (mismo id de usuario): puede cancelarla.
    expect(screen.getByRole('button', { name: 'Cancelar solicitud de SKU-000001' })).toBeVisible();
  });
});
