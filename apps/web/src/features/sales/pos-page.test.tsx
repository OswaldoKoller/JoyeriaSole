import { SYSTEM_PAYMENT_METHODS } from '@joyeria/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiError, mockApi, type ApiCall } from '../../test/api-mock.ts';
import { renderWithProviders } from '../../test/render.tsx';
import { CHAIN, CLOSED_STATUS, OPEN_STATUS, RING, saleDetail } from '../../test/sales-fixtures.ts';
import { POS_DRAFT_STORAGE_KEY } from './cart.ts';
import { PosPage } from './pos-page.tsx';
import { NO_REVERSAL_WARNING } from './review-step.tsx';

const SELLER = ['sales:create', 'sales:read', 'catalog:read', 'inventory:read'];
const METHODS = SYSTEM_PAYMENT_METHODS.map(({ code, name, isCash }) => ({ code, name, isCash }));

type Routes = Parameters<typeof mockApi>[0];

function setup(extra: Routes = {}, { open = true, permissions = SELLER } = {}) {
  return mockApi(
    {
      'GET /cash/status': () => [200, { data: open ? OPEN_STATUS : CLOSED_STATUS }],
      'GET /payment-methods': () => [200, { data: METHODS }],
      'GET /catalog/variants/lookup': (call) => {
        const code = new URLSearchParams(call.path.split('?')[1]).get('code');
        const found = [RING, CHAIN].find((piece) => piece.barcode === code || piece.sku === code);
        return found ? [200, { data: found }] : [404, apiError('NOT_FOUND', 'No encontrada')];
      },
      'GET /products': () => [200, { data: [], meta: { page: 1, pageSize: 10, total: 0 } }],
      ...extra,
    },
    { permissions },
  );
}

/** Escanea como un lector: escribe el código y pulsa Enter. */
async function scan(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.type(screen.getByLabelText('Código de la pieza'), `${code}{Enter}`);
}

async function fillMixedSale(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByLabelText('Código de la pieza');
  await scan(user, RING.barcode ?? '');
  await screen.findByText(/Agregada: Anillo Sol/);
  await scan(user, CHAIN.sku);
  await screen.findByText(/Agregada: Cadena Luna/);
  await user.type(await screen.findByLabelText('QR (Bs)'), '50');
  await user.type(screen.getByLabelText('Efectivo recibido (Bs)'), '200');
}

function posts(calls: ApiCall[]) {
  return calls.filter((call) => call.method === 'POST' && call.path === '/sales');
}

beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(() => {
  window.sessionStorage.clear();
});

describe('punto de venta', () => {
  it('el lector (texto + Enter) agrega piezas con su foto junto al nombre y suma al repetir', async () => {
    setup();
    renderWithProviders(<PosPage />);
    const user = userEvent.setup();
    const field = await screen.findByLabelText('Código de la pieza');
    expect(field).toHaveFocus();

    await scan(user, RING.barcode ?? '');
    const table = await screen.findByRole('table', { name: 'Piezas del carrito' });
    const row = within(table).getByRole('row', { name: /Anillo Sol/ });
    expect(row).toHaveTextContent('Talla 7');
    expect(row).toHaveTextContent('SKU-000001');
    // La foto (o su marcador) va en la misma celda que el nombre.
    expect(
      within(row).getAllByRole('cell')[0]?.querySelector('[aria-hidden="true"], img'),
    ).not.toBeNull();
    // El campo se vacía y conserva el foco para la próxima lectura.
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();

    await scan(user, RING.barcode ?? '');
    expect(
      await screen.findByLabelText('Cantidad de Anillo Sol · Talla 7 (SKU-000001)'),
    ).toHaveValue(2);
    // Stock 2: una tercera lectura se rechaza con un aviso.
    await scan(user, RING.barcode ?? '');
    expect(await screen.findByRole('alert')).toHaveTextContent(/No hay más stock de Anillo Sol/);
  });

  it('un código desconocido avisa con role="alert" y no agrega nada', async () => {
    setup();
    renderWithProviders(<PosPage />);
    const user = userEvent.setup();
    await screen.findByLabelText('Código de la pieza');
    await scan(user, '999999');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se encontró ninguna pieza con «999999»',
    );
    expect(screen.getByText('El carrito está vacío.')).toBeVisible();
  });

  it('calcula falta y vuelto y solo habilita «Revisar venta» si el cobro cuadra', async () => {
    setup();
    renderWithProviders(<PosPage />);
    const user = userEvent.setup();
    await screen.findByLabelText('Código de la pieza');
    await scan(user, RING.sku);
    await user.type(await screen.findByLabelText('Efectivo recibido (Bs)'), '100');
    const cobro = screen.getByRole('complementary', { name: 'Cobro' });
    expect(
      within(within(cobro).getByRole('status', { name: 'Estado del cobro' })).getByText('Falta')
        .parentElement,
    ).toHaveTextContent(/20,50/);
    expect(within(cobro).getByRole('button', { name: 'Revisar venta' })).toBeDisabled();

    await user.clear(screen.getByLabelText('Efectivo recibido (Bs)'));
    await user.type(screen.getByLabelText('Efectivo recibido (Bs)'), '150');
    expect(
      within(within(cobro).getByRole('status', { name: 'Estado del cobro' })).getByText('Vuelto')
        .parentElement,
    ).toHaveTextContent(/29,50/);
    expect(within(cobro).getByRole('button', { name: 'Revisar venta' })).toBeEnabled();
  });

  it('pago mixto: revisión obligatoria y confirmación con Idempotency-Key guardada en sessionStorage', async () => {
    const calls = setup({ 'POST /sales': () => [201, { data: saleDetail() }] });
    renderWithProviders(<PosPage />);
    const user = userEvent.setup();
    await fillMixedSale(user);
    await user.click(screen.getByRole('button', { name: 'Revisar venta' }));

    const review = screen.getByRole('region', { name: 'Revise la venta antes de confirmar' });
    expect(
      within(review).getByRole('heading', { name: 'Revise la venta antes de confirmar' }),
    ).toHaveFocus();
    expect(review).toHaveTextContent(NO_REVERSAL_WARNING);
    expect(within(review).getByRole('row', { name: /Anillo Sol/ })).toBeVisible();
    expect(within(review).getByRole('row', { name: /Cadena Luna/ })).toBeVisible();
    const pagos = within(review).getByLabelText('Pagos');
    expect(pagos).toHaveTextContent(/Efectivo.*150,50/);
    expect(pagos).toHaveTextContent(/QR.*50,00/);
    expect(pagos).toHaveTextContent(/Suma de pagos.*200,50/);
    expect(pagos).toHaveTextContent(/Vuelto.*49,50/);
    // Nada se envía hasta confirmar.
    expect(posts(calls)).toHaveLength(0);
    const stored = JSON.parse(window.sessionStorage.getItem(POS_DRAFT_STORAGE_KEY) ?? '{}') as {
      attempt: { key: string };
    };
    expect(stored.attempt.key).toMatch(/^[0-9a-f-]{36}$/);

    await user.click(within(review).getByRole('button', { name: 'Confirmar venta' }));
    expect(
      await screen.findByRole('heading', { name: 'Venta VTA-000123 registrada' }),
    ).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Ver comprobante' })).toHaveAttribute(
      'href',
      `/ventas/${saleDetail().id}/comprobante`,
    );
    const [post] = posts(calls);
    expect(post?.idempotencyKey).toBe(stored.attempt.key);
    expect(post?.body).toEqual({
      items: [
        { variantId: RING.variantId, quantity: 1, expectedUnitPrice: '120.50' },
        { variantId: CHAIN.variantId, quantity: 1, expectedUnitPrice: '80.00' },
      ],
      payments: [
        { methodCode: 'CASH', amount: '150.50', tendered: '200.00' },
        { methodCode: 'QR', amount: '50.00' },
      ],
      expectedTotal: '200.50',
    });
    // Venta registrada: se borran carrito y clave.
    expect(window.sessionStorage.getItem(POS_DRAFT_STORAGE_KEY)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Nueva venta' }));
    expect(await screen.findByLabelText('Código de la pieza')).toHaveFocus();
    expect(screen.getByText('El carrito está vacío.')).toBeVisible();
  });

  it('el doble clic en «Confirmar venta» envía una sola petición', async () => {
    let release: () => void = () => undefined;
    const calls = setup({
      'POST /sales': () =>
        new Promise((resolve) => {
          release = () => {
            resolve([201, { data: saleDetail() }]);
          };
        }),
    });
    renderWithProviders(<PosPage />);
    const user = userEvent.setup();
    await fillMixedSale(user);
    await user.click(screen.getByRole('button', { name: 'Revisar venta' }));
    await user.dblClick(screen.getByRole('button', { name: 'Confirmar venta' }));
    release();
    await screen.findByRole('heading', { name: /registrada/ });
    expect(posts(calls)).toHaveLength(1);
  });

  it('tras un corte de red muestra «resultado incierto» y reintenta con la MISMA clave y cuerpo', async () => {
    let attempts = 0;
    const calls = setup({
      'POST /sales': () => {
        attempts += 1;
        return attempts === 1 ? new TypeError('Failed to fetch') : [200, { data: saleDetail() }];
      },
    });
    renderWithProviders(<PosPage />);
    const user = userEvent.setup();
    await fillMixedSale(user);
    await user.click(screen.getByRole('button', { name: 'Revisar venta' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }));

    expect(
      await screen.findByRole('heading', { name: 'Resultado incierto: no cobre de nuevo' }),
    ).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Ver ventas del día' })).toHaveAttribute(
      'href',
      '/ventas',
    );
    // No se puede editar el carrito mientras el resultado es incierto.
    expect(screen.queryByLabelText('Código de la pieza')).not.toBeInTheDocument();
    const stored = JSON.parse(window.sessionStorage.getItem(POS_DRAFT_STORAGE_KEY) ?? '{}') as {
      attempt: { uncertain: boolean };
    };
    expect(stored.attempt.uncertain).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('heading', { name: 'Venta VTA-000123 registrada' });
    const [first, second] = posts(calls);
    expect(second?.idempotencyKey).toBe(first?.idempotencyKey);
    expect(second?.body).toEqual(first?.body);
  });

  it('tras recargar en «resultado incierto» se conserva la clave', async () => {
    const calls = setup({ 'POST /sales': () => new TypeError('Failed to fetch') });
    const first = renderWithProviders(<PosPage />);
    const user = userEvent.setup();
    await fillMixedSale(user);
    await user.click(screen.getByRole('button', { name: 'Revisar venta' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }));
    await screen.findByRole('heading', { name: /Resultado incierto/ });
    first.unmount();

    renderWithProviders(<PosPage />);
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('heading', { name: /Resultado incierto/ });
    const keys = posts(calls).map((call) => call.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it('si cambió el precio vuelve al carrito con la línea marcada y la próxima vez usa clave nueva', async () => {
    const calls = setup({
      'POST /sales': (_call, all) =>
        posts(all).length === 1
          ? [
              409,
              apiError('PRICE_CHANGED', 'Cambió el precio', {
                items: [
                  {
                    variantId: CHAIN.variantId,
                    expectedUnitPrice: '80.00',
                    currentUnitPrice: '90.00',
                  },
                ],
                expectedTotal: '200.50',
                currentTotal: '210.50',
              }),
            ]
          : [201, { data: saleDetail() }],
    });
    renderWithProviders(<PosPage />);
    const user = userEvent.setup();
    await fillMixedSale(user);
    await user.click(screen.getByRole('button', { name: 'Revisar venta' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }));

    const alert = await screen.findByText(/Cambió el precio de una o más piezas/);
    expect(alert).toHaveFocus();
    const row = screen.getByRole('row', { name: /Cadena Luna/ });
    expect(row).toHaveTextContent(/El precio cambió: antes .*80,00, ahora .*90,00/);
    // Total y vuelto se recalculan con el precio nuevo: hay que volver a revisar.
    const cobro = screen.getByRole('complementary', { name: 'Cobro' });
    expect(cobro).toHaveTextContent(/210,50/);
    expect(within(cobro).getByRole('status', { name: 'Estado del cobro' })).toHaveTextContent(
      /Vuelto.*39,50/,
    );
    await user.click(screen.getByRole('button', { name: 'Revisar venta' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }));
    await screen.findByRole('heading', { name: /registrada/ });
    const [first, second] = posts(calls);
    expect(second?.idempotencyKey).not.toBe(first?.idempotencyKey);
    expect(second?.body).toMatchObject({ expectedTotal: '210.50' });
  });

  it('la última pieza vendida por otra persona: stock insuficiente y clave nueva', async () => {
    const calls = setup({
      'POST /sales': () => [
        422,
        apiError('INSUFFICIENT_STOCK', 'Stock insuficiente', {
          items: [{ variantId: RING.variantId, sku: RING.sku, available: 0, requested: 1 }],
        }),
      ],
    });
    renderWithProviders(<PosPage />);
    const user = userEvent.setup();
    await fillMixedSale(user);
    await user.click(screen.getByRole('button', { name: 'Revisar venta' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }));
    expect(await screen.findByText(/No hay stock suficiente/)).toHaveFocus();
    expect(screen.getByRole('row', { name: /Anillo Sol/ })).toHaveTextContent(
      'Ya no hay stock de esta pieza: quítela del carrito.',
    );
    const stored = JSON.parse(window.sessionStorage.getItem(POS_DRAFT_STORAGE_KEY) ?? '{}') as {
      attempt: unknown;
    };
    expect(stored.attempt).toBeNull();
    expect(posts(calls)).toHaveLength(1);
  });

  it('sin caja abierta no se puede vender y se ofrece abrirla a quien puede', async () => {
    setup({}, { open: false, permissions: [...SELLER, 'cash:open'] });
    renderWithProviders(<PosPage />);
    const user = userEvent.setup();
    const alert = await screen.findByText('No hay caja abierta. No se puede vender.');
    expect(alert.closest('[role="alert"]')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Abrir caja' })).toHaveAttribute('href', '/caja');
    await scan(user, RING.sku);
    await user.type(await screen.findByLabelText('Efectivo recibido (Bs)'), '200');
    expect(screen.getByRole('button', { name: 'Revisar venta' })).toBeDisabled();
    expect(screen.getByText('No hay caja abierta.')).toBeVisible();
  });

  it('el Vendedor sin caja abierta no ve «Abrir caja»', async () => {
    setup({}, { open: false });
    renderWithProviders(<PosPage />);
    await screen.findByText('No hay caja abierta. No se puede vender.');
    expect(screen.queryByRole('link', { name: 'Abrir caja' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver el estado de la caja' })).toBeVisible();
  });

  it('si la caja se cerró al confirmar, conserva carrito y clave', async () => {
    let open = true;
    const calls = setup({
      'GET /cash/status': () => [200, { data: open ? OPEN_STATUS : CLOSED_STATUS }],
      'POST /sales': () => {
        open = false;
        return [422, apiError('CASH_SESSION_REQUIRED', 'No hay caja abierta')];
      },
    });
    renderWithProviders(<PosPage />);
    const user = userEvent.setup();
    await fillMixedSale(user);
    await user.click(screen.getByRole('button', { name: 'Revisar venta' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }));
    expect(await screen.findByText(/La caja se cerró mientras cobraba/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirmar venta' })).toBeDisabled();
    const stored = JSON.parse(window.sessionStorage.getItem(POS_DRAFT_STORAGE_KEY) ?? '{}') as {
      attempt: { key: string } | null;
      lines: unknown[];
    };
    expect(stored.attempt?.key).toBe(posts(calls)[0]?.idempotencyKey);
    expect(stored.lines).toHaveLength(2);
  });

  it('no ofrece ninguna acción de anular, devolver o eliminar ventas', async () => {
    setup({ 'POST /sales': () => [201, { data: saleDetail() }] });
    renderWithProviders(<PosPage />);
    const user = userEvent.setup();
    await fillMixedSale(user);
    await user.click(screen.getByRole('button', { name: 'Revisar venta' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }));
    await screen.findByRole('heading', { name: /registrada/ });
    expect(
      screen.queryByRole('button', { name: /anular|devolver|eliminar|editar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /anular|devolver|eliminar|editar/i }),
    ).not.toBeInTheDocument();
  });
});
