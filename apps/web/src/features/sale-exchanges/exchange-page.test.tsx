import { SYSTEM_PAYMENT_METHODS, type SaleExchangeDetail } from '@joyeria/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { apiError, mockApi, type ApiCall } from '../../test/api-mock.ts';
import { renderWithProviders } from '../../test/render.tsx';
import { CLOSED_STATUS, OPEN_STATUS, RING, SESSION_ID } from '../../test/sales-fixtures.ts';
import { ExchangePage } from './exchange-page.tsx';

const SELLER = ['sales:exchange', 'sales:read', 'catalog:read', 'inventory:read'];
const METHODS = SYSTEM_PAYMENT_METHODS.map(({ code, name, isCash }) => ({ code, name, isCash }));
const SALE_ID = '01900000-0000-7000-8000-00000000e001';
const ITEM_ID = '01900000-0000-7000-8000-00000000f001';

/** Pulsera más cara (Bs 200,00) y pieza del mismo precio que el anillo (Bs 120,50). */
const BRACELET = {
  ...RING,
  variantId: '01900000-0000-7000-8000-00000000b003',
  productName: 'Pulsera Mar',
  label: null,
  sku: 'SKU-000003',
  barcode: null,
  salePrice: '200.00',
  stockQuantity: 4,
};
const RING_12 = {
  ...RING,
  variantId: '01900000-0000-7000-8000-00000000b004',
  label: 'Talla 12',
  sku: 'SKU-000004',
  barcode: null,
};
const CHEAP = {
  ...RING,
  variantId: '01900000-0000-7000-8000-00000000b005',
  productName: 'Dije',
  label: null,
  sku: 'SKU-000005',
  barcode: null,
  salePrice: '60.00',
};
const PIECES = [RING, BRACELET, RING_12, CHEAP];

const LOOKUP = {
  saleId: SALE_ID,
  number: 123,
  soldAt: '2026-11-11T15:30:00.000Z',
  holdings: [
    {
      origin: 'SALE',
      sourceItemId: ITEM_ID,
      sourceExchangeId: null,
      exchangeNumber: null,
      variantId: RING.variantId,
      sku: RING.sku,
      productName: RING.productName,
      variantLabel: RING.label,
      remaining: 2,
      creditUnitPrice: '120.50',
    },
  ],
};

function exchangeDetail(overrides: Partial<SaleExchangeDetail> = {}): SaleExchangeDetail {
  return {
    id: '01900000-0000-7000-8000-00000000a501',
    number: 5,
    saleId: SALE_ID,
    saleNumber: 123,
    createdAt: '2026-11-12T10:00:00.000Z',
    sellerId: '01900000-0000-7000-8000-0000000000a1',
    sellerName: 'Ana Cajera',
    cashSessionId: SESSION_ID,
    cashSessionNumber: 7,
    returned: {
      variantId: RING.variantId,
      sku: RING.sku,
      productName: RING.productName,
      variantLabel: RING.label,
    },
    delivered: {
      variantId: BRACELET.variantId,
      sku: BRACELET.sku,
      productName: BRACELET.productName,
      variantLabel: null,
    },
    quantity: 1,
    creditUnitPrice: '120.50',
    deliveredUnitPrice: '200.00',
    difference: '79.50',
    payments: [],
    changeGiven: '20.50',
    note: null,
    ...overrides,
  };
}

type Routes = Parameters<typeof mockApi>[0];

function setup(extra: Routes = {}, { open = true } = {}) {
  return mockApi(
    {
      'GET /cash/status': () => [200, { data: open ? OPEN_STATUS : CLOSED_STATUS }],
      'GET /payment-methods': () => [200, { data: METHODS }],
      'GET /sale-exchanges/lookup': () => [200, { data: LOOKUP }],
      'GET /catalog/variants/lookup': (call) => {
        const code = new URLSearchParams(call.path.split('?')[1]).get('code');
        const found = PIECES.find((piece) => piece.sku === code);
        return found ? [200, { data: found }] : [404, apiError('NOT_FOUND', 'No encontrada')];
      },
      'GET /products': () => [200, { data: [], meta: { page: 1, pageSize: 10, total: 0 } }],
      ...extra,
    },
    { permissions: SELLER },
  );
}

const posts = (calls: ApiCall[]) =>
  calls.filter((call) => call.method === 'POST' && call.path === '/sale-exchanges');

async function chooseNewPiece(user: ReturnType<typeof userEvent.setup>, sku: string) {
  await user.type(await screen.findByLabelText('Código de la pieza'), `${sku}{Enter}`);
}

afterEach(() => {
  window.sessionStorage.clear();
});

describe('cambio de pieza', () => {
  it('busca la venta por su número y muestra lo que el cliente pagó por la pieza', async () => {
    const calls = setup();
    renderWithProviders(<ExchangePage />, { route: '/cambios/nuevo?venta=VTA-000123' });
    expect(await screen.findByText(/El cliente pagó/)).toHaveTextContent(/120,50/);
    expect(screen.getByText(/quedan 2 por cambiar/)).toBeVisible();
    expect(calls.find((call) => call.path.startsWith('/sale-exchanges/lookup'))?.path).toBe(
      '/sale-exchanges/lookup?number=123',
    );
  });

  it('avisa si el número no es válido y si la venta no existe', async () => {
    setup({
      'GET /sale-exchanges/lookup': () => [
        404,
        apiError('NOT_FOUND', 'No existe la venta VTA-000999.'),
      ],
    });
    renderWithProviders(<ExchangePage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Número de la venta (VTA-…)'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Buscar venta' }));
    expect(await screen.findByText(/Escriba el número del comprobante/)).toBeVisible();
    await user.clear(screen.getByLabelText('Número de la venta (VTA-…)'));
    await user.type(screen.getByLabelText('Número de la venta (VTA-…)'), '999');
    await user.click(screen.getByRole('button', { name: 'Buscar venta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No existe la venta VTA-000999.');
  });

  it('NO deja cambiar por una pieza más barata: avisa y no habilita registrar', async () => {
    const calls = setup();
    renderWithProviders(<ExchangePage />, { route: '/cambios/nuevo?venta=123' });
    const user = userEvent.setup();
    await chooseNewPiece(user, CHEAP.sku);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/cuesta menos/);
    expect(alert).toHaveTextContent(/igual o mayor precio/);
    expect(screen.queryByRole('button', { name: 'Registrar cambio' })).not.toBeInTheDocument();
    expect(posts(calls)).toHaveLength(0);
  });

  it('la misma pieza que devuelve el cliente no se puede entregar', async () => {
    const calls = setup();
    renderWithProviders(<ExchangePage />, { route: '/cambios/nuevo?venta=123' });
    const user = userEvent.setup();
    await chooseNewPiece(user, RING.sku);
    expect(await screen.findByRole('alert')).toHaveTextContent(/misma pieza/);
    expect(screen.queryByRole('button', { name: 'Registrar cambio' })).not.toBeInTheDocument();
    expect(posts(calls)).toHaveLength(0);
  });

  it('sin diferencia de precio no pide cobro y registra con una Idempotency-Key', async () => {
    const calls = setup({
      'POST /sale-exchanges': () => [
        201,
        {
          data: exchangeDetail({
            difference: '0.00',
            deliveredUnitPrice: '120.50',
            changeGiven: '0.00',
          }),
        },
      ],
    });
    renderWithProviders(<ExchangePage />, { route: '/cambios/nuevo?venta=123' });
    const user = userEvent.setup();
    await chooseNewPiece(user, RING_12.sku);
    expect(await screen.findByText(/Sin diferencia de precio/)).toBeVisible();
    expect(screen.queryByLabelText('Efectivo recibido (Bs)')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar cambio' }));
    expect(await screen.findByText(/Cambio CMB-000005 registrado/)).toBeVisible();
    const [post] = posts(calls);
    expect(post?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(post?.body).toMatchObject({
      saleId: SALE_ID,
      sourceItemId: ITEM_ID,
      deliveredVariantId: RING_12.variantId,
      quantity: 1,
      expectedDeliveredUnitPrice: '120.50',
      payments: [],
    });
  });

  it('con diferencia cobra en efectivo con vuelto y registra el cuerpo exacto', async () => {
    const calls = setup({ 'POST /sale-exchanges': () => [201, { data: exchangeDetail() }] });
    renderWithProviders(<ExchangePage />, { route: '/cambios/nuevo?venta=123' });
    const user = userEvent.setup();
    await chooseNewPiece(user, BRACELET.sku);
    expect(await screen.findByText(/Diferencia a cobrar/)).toHaveTextContent(/79,50/);
    // Hasta cobrar la diferencia completa no se puede registrar.
    expect(screen.getByRole('button', { name: 'Registrar cambio' })).toBeDisabled();
    await user.type(screen.getByLabelText('Efectivo recibido (Bs)'), '100');
    const estado = screen.getByRole('status', { name: 'Estado del cobro' });
    expect(within(estado).getByText('Vuelto').parentElement).toHaveTextContent(/20,50/);
    await user.click(screen.getByRole('button', { name: 'Registrar cambio' }));

    expect(await screen.findByText(/Cambio CMB-000005 registrado/)).toBeVisible();
    expect(screen.getByText(/Diferencia cobrada/)).toHaveTextContent(/79,50/);
    expect(screen.getByText(/Vuelto a entregar/)).toHaveTextContent(/20,50/);
    expect(screen.getByRole('link', { name: /Ver e imprimir comprobante/ })).toHaveAttribute(
      'href',
      `/cambios/${exchangeDetail().id}`,
    );
    const [post] = posts(calls);
    expect(post?.body).toMatchObject({
      saleId: SALE_ID,
      sourceItemId: ITEM_ID,
      deliveredVariantId: BRACELET.variantId,
      quantity: 1,
      expectedDeliveredUnitPrice: '200.00',
      payments: [{ methodCode: 'CASH', amount: '79.50', tendered: '100.00' }],
    });
  });

  it('tras un corte de red avisa que no se repita y reintenta con la MISMA clave', async () => {
    let attempts = 0;
    const calls = setup({
      'POST /sale-exchanges': () => {
        attempts += 1;
        return attempts === 1 ? new Error('Failed to fetch') : [201, { data: exchangeDetail() }];
      },
    });
    renderWithProviders(<ExchangePage />, { route: '/cambios/nuevo?venta=123' });
    const user = userEvent.setup();
    await chooseNewPiece(user, BRACELET.sku);
    await user.type(await screen.findByLabelText('Efectivo recibido (Bs)'), '80');
    await user.click(screen.getByRole('button', { name: 'Registrar cambio' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/pudo registrarse o no/);
    await user.click(screen.getByRole('button', { name: 'Registrar cambio' }));
    expect(await screen.findByText(/Cambio CMB-000005 registrado/)).toBeVisible();
    const [first, second] = posts(calls);
    expect(second?.idempotencyKey).toBe(first?.idempotencyKey);
    expect(second?.body).toEqual(first?.body);
  });

  it('muestra el error de la API (precio cambió) y pide volver a buscar la pieza', async () => {
    setup({
      'POST /sale-exchanges': () => [409, apiError('PRICE_CHANGED', 'El precio cambió.')],
    });
    renderWithProviders(<ExchangePage />, { route: '/cambios/nuevo?venta=123' });
    const user = userEvent.setup();
    await chooseNewPiece(user, BRACELET.sku);
    await user.type(await screen.findByLabelText('Efectivo recibido (Bs)'), '80');
    await user.click(screen.getByRole('button', { name: 'Registrar cambio' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Búsquela otra vez/);
    expect(screen.queryByRole('button', { name: 'Registrar cambio' })).not.toBeInTheDocument();
  });

  it('sin caja abierta avisa y no deja registrar', async () => {
    setup({}, { open: false });
    renderWithProviders(<ExchangePage />, { route: '/cambios/nuevo?venta=123' });
    expect(await screen.findByText('No hay caja abierta. No se puede cambiar.')).toBeVisible();
    const user = userEvent.setup();
    await chooseNewPiece(user, RING_12.sku);
    expect(await screen.findByRole('button', { name: 'Registrar cambio' })).toBeDisabled();
  });
});
