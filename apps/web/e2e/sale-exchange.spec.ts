import { expect, test } from '@playwright/test';
import {
  PASSWORD,
  SUFFIX,
  USERS,
  apiLogin,
  createPiece,
  ensureCashClosed,
  login,
  menu,
  openCash,
  saleLabel,
  scan,
  sellViaApi,
  stockOf,
} from './sales-helpers.ts';

/**
 * Cambio de pieza (ADR-026). La tienda no hace devoluciones: el Vendedor cambia una pieza por otra
 * de igual o mayor precio, con el comprobante de la venta; la diferencia se cobra y entra a la caja.
 * Nunca por una pieza más barata. El stock y el arqueo de la caja deben cuadrar.
 */
test.skip(!PASSWORD, 'Definir DEMO_USER_PASSWORD (npm run qa lo genera)');
test.describe.configure({ mode: 'serial' });

test('el Vendedor cambia una pieza por otra más cara, cobra la diferencia y la caja y el stock cuadran', async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  await apiLogin(request, USERS.admin);
  await ensureCashClosed(request);
  await openCash(request, '100');
  const bought = await createPiece(request, `E2E Cambio Anillo T10 ${SUFFIX}`, '100', 3);
  const dearer = await createPiece(request, `E2E Cambio Anillo T12 ${SUFFIX}`, '150', 3);
  const cheaper = await createPiece(request, `E2E Cambio Anillo T8 ${SUFFIX}`, '80', 3);
  const sale = await sellViaApi(request, bought);
  expect(await stockOf(request, bought.sku)).toBe(2);

  await login(page, USERS.vendedor);
  await expect(menu(page).getByRole('link', { name: 'Cambio de pieza' })).toBeVisible();
  await menu(page).getByRole('link', { name: 'Cambio de pieza' }).click();
  await expect(page.getByRole('heading', { name: 'Cambio de pieza' })).toBeVisible();

  // 1. La venta del comprobante: el Vendedor puede buscar una venta hecha por otra persona.
  await page.getByLabel('Número de la venta (VTA-…)').fill(String(sale.number));
  await page.getByRole('button', { name: 'Buscar venta' }).click();
  await expect(page.getByText(`Venta ${saleLabel(sale.number)}`)).toBeVisible();
  await expect(page.getByText(/El cliente pagó .*100,00/)).toBeVisible();

  // 2. Una pieza más barata NO se admite.
  await scan(page, cheaper.sku);
  await expect(page.getByRole('alert')).toContainText('cuesta menos');
  await expect(page.getByRole('button', { name: 'Registrar cambio' })).toHaveCount(0);

  // 3. Una pieza más cara: se cobra la diferencia (150 − 100 = 50) con vuelto.
  await scan(page, dearer.sku);
  await expect(page.getByText(/Diferencia a cobrar/)).toContainText('50,00');
  await expect(page.getByRole('button', { name: 'Registrar cambio' })).toBeDisabled();
  await page.getByLabel('Efectivo recibido (Bs)').fill('60');
  await expect(page.getByRole('status', { name: 'Estado del cobro' })).toContainText(/10,00/);
  await page.getByRole('button', { name: 'Registrar cambio' }).click();
  await expect(page.getByText(/Cambio CMB-\d{6} registrado/)).toBeVisible();
  await expect(page.getByText(/Diferencia cobrada/)).toContainText('50,00');

  // Stock: la devuelta vuelve (2 → 3) y la nueva sale (3 → 2).
  expect(await stockOf(request, bought.sku)).toBe(3);
  expect(await stockOf(request, dearer.sku)).toBe(2);
  expect(await stockOf(request, cheaper.sku)).toBe(3);

  // Caja: fondo 100 + venta 100 + diferencia 50 = 250 (el vuelto no cuenta).
  const current = (await (await request.get('/api/v1/cash/sessions/current')).json()) as {
    data: { liveExpectedCash: string; exchangesCount: number; exchangesTotal: string };
  };
  expect(current.data).toMatchObject({
    liveExpectedCash: '250.00',
    exchangesCount: 1,
    exchangesTotal: '50.00',
  });

  // La venta original no se tocó y el cambio figura en su detalle y en el historial.
  const original = (await (await request.get(`/api/v1/sales/${sale.id}`)).json()) as {
    data: { total: string; items: unknown[] };
  };
  expect(original.data.total).toBe('100.00');
  expect(original.data.items).toHaveLength(1);
  await menu(page).getByRole('link', { name: 'Historial de cambios' }).click();
  await expect(page.getByRole('link', { name: /Abrir el cambio CMB-\d{6}/ })).toBeVisible();

  await ensureCashClosed(request);
});

test('sin caja abierta el Vendedor no puede cambiar piezas y la API tampoco lo permite', async ({
  page,
  request,
}) => {
  await apiLogin(request, USERS.admin);
  await ensureCashClosed(request);
  await login(page, USERS.vendedor);
  await page.goto('/cambios/nuevo');
  await expect(page.getByRole('alert')).toContainText('No hay caja abierta. No se puede cambiar.');
});
