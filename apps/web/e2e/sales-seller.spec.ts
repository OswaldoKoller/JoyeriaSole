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
} from './sales-helpers.ts';

/**
 * Vendedor (D-01, D-02, B3): vende y ve solo sus ventas; no abre ni cierra la caja, no ve el
 * historial de cajas ni la lista de incidencias; puede reportar una incidencia.
 */
test.skip(!PASSWORD, 'Definir DEMO_USER_PASSWORD (npm run qa lo genera)');
test.describe.configure({ mode: 'serial' });

test('sin caja abierta el Vendedor no puede vender ni abrir la caja', async ({ page, request }) => {
  await apiLogin(request, USERS.admin);
  await ensureCashClosed(request);
  await login(page, USERS.vendedor);

  await expect(menu(page).getByRole('link', { name: 'Punto de venta' })).toBeVisible();
  await expect(menu(page).getByRole('link', { name: 'Historial de ventas' })).toBeVisible();
  for (const name of ['Caja', 'Incidencias', 'Datos del negocio']) {
    await expect(menu(page).getByRole('link', { name })).toHaveCount(0);
  }

  await menu(page).getByRole('link', { name: 'Punto de venta' }).click();
  await expect(page.getByRole('alert')).toContainText('No hay caja abierta. No se puede vender.');
  await expect(page.getByRole('link', { name: 'Abrir caja' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ver el estado de la caja' })).toBeVisible();

  for (const route of ['/caja/historial', '/caja/cierre', '/ventas/incidencias']) {
    await page.goto(route);
    await expect(page.getByText('No tiene permiso para ver esta sección.')).toBeVisible();
  }
  // La API también lo impide (la interfaz es solo comodidad).
  const open = await page.request.post('/api/v1/cash/sessions', {
    data: { openingAmount: '100' },
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
  expect(open.status()).toBe(403);
});

test('el Vendedor vende, solo ve sus ventas y reporta una incidencia', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await apiLogin(request, USERS.admin);
  await ensureCashClosed(request);
  await openCash(request, '50');
  const piece = await createPiece(request, `E2E Venta Pulsera Vendedor ${SUFFIX}`, '80', 3);
  // Una venta del Administrador que el Vendedor NO debe ver.
  const adminSale = await sellViaApi(request, piece);

  await login(page, USERS.vendedor);
  await menu(page).getByRole('link', { name: 'Punto de venta' }).click();
  await scan(page, piece.sku);
  await expect(page.getByRole('row', { name: new RegExp(piece.sku) })).toBeVisible();
  await page.getByLabel('Efectivo recibido (Bs)').fill('100');
  await expect(page.getByRole('status', { name: 'Estado del cobro' })).toContainText(/20,00/);
  await page.getByRole('button', { name: 'Revisar venta' }).click();
  await page.getByRole('button', { name: 'Confirmar venta' }).click();
  const done = page.getByRole('heading', { name: /^Venta VTA-\d{6} registrada$/ });
  await expect(done).toBeVisible();
  const ownLabel = /VTA-\d{6}/.exec((await done.textContent()) ?? '')?.[0] ?? '';

  // Historial: solo sus ventas.
  await menu(page).getByRole('link', { name: 'Historial de ventas' }).click();
  await expect(page.getByRole('link', { name: `Abrir la venta ${ownLabel}` })).toBeVisible();
  await expect(
    page.getByRole('link', { name: `Abrir la venta ${saleLabel(adminSale.number)}` }),
  ).toHaveCount(0);
  expect((await page.request.get(`/api/v1/sales/${adminSale.id}`)).status()).toBe(404);

  // Detalle de solo lectura y reporte de incidencia.
  await page.getByRole('link', { name: `Abrir la venta ${ownLabel}` }).click();
  await expect(page.getByRole('heading', { name: `Venta ${ownLabel}` })).toBeVisible();
  await expect(page.getByRole('button', { name: /anular|editar|devolver|eliminar/i })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Reportar incidencia' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reportar incidencia' });
  await expect(dialog).toContainText('La incidencia no modifica la venta, el stock ni la caja.');
  await dialog.getByLabel('Tipo de incidencia').selectOption('WRONG_PAYMENT');
  await dialog.getByLabel('Qué pasó').fill('El cliente pagó por QR, no en efectivo (E2E)');
  await dialog.getByRole('button', { name: 'Reportar incidencia' }).click();
  await expect(page.getByText(/Incidencia INC-\d{6} registrada/)).toBeVisible();
  // Quien reporta no lista incidencias.
  expect((await page.request.get('/api/v1/sale-incidents')).status()).toBe(403);

  await ensureCashClosed(request);
});
