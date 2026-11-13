import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  PASSWORD,
  SUFFIX,
  USERS,
  apiLogin,
  closeCash,
  createPiece,
  ensureCashClosed,
  login,
  menu,
  openCash,
  saleLabel,
  sellViaApi,
  stockOf,
} from './sales-helpers.ts';

/**
 * Administrador: datos del negocio en el comprobante, corrección append-only de un cierre
 * («Corregida (1)» con cifras originales y vigentes) y cierre de una incidencia, que no cambia la
 * venta ni el stock.
 */
test.skip(!PASSWORD, 'Definir DEMO_USER_PASSWORD (npm run qa lo genera)');

test('el Administrador edita los datos del negocio, corrige un cierre y cierra una incidencia', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await apiLogin(request, USERS.admin);
  await ensureCashClosed(request);
  const session = await openCash(request, '100');
  const piece = await createPiece(request, `E2E Venta Collar Admin ${SUFFIX}`, '60', 2);
  const sale = await sellViaApi(request, piece);
  // Contado 150 frente a un esperado de 160: faltan 10.
  await closeCash(request, session.id, '150');
  const incident = await request.post('/api/v1/sale-incidents', {
    data: {
      kind: 'WRONG_SALE',
      description: 'Se registró la pieza equivocada (E2E)',
      saleNumber: sale.number,
    },
    headers: { 'Idempotency-Key': randomUUID() },
  });
  expect(incident.status()).toBe(201);
  const incidentNumber = ((await incident.json()) as { data: { number: number } }).data.number;
  const stockBefore = await stockOf(request, piece.sku);

  await login(page, USERS.admin);

  // 1. Datos del negocio → aparecen en el comprobante.
  await menu(page).getByRole('link', { name: 'Datos del negocio' }).click();
  const address = `Calle E2E ${SUFFIX}`;
  await page.getByLabel('Dirección (opcional)').fill(address);
  await page.getByRole('button', { name: 'Guardar datos' }).click();
  await expect(page.getByText('Datos guardados', { exact: false })).toBeVisible();
  await page.goto(`/ventas/${sale.id}/comprobante`);
  await expect(
    page.getByRole('article', { name: `Comprobante de la venta ${saleLabel(sale.number)}` }),
  ).toContainText(address);

  // 2. Corrección del contado (error de captura): queda registrada junto al cierre original.
  await page.goto(`/caja/sesiones/${session.id}`);
  await expect(page.getByLabel('Cierre original')).toContainText(/Faltante de .*10,00/);
  await page.getByRole('button', { name: 'Corregir cierre' }).click();
  const dialog = page.getByRole('dialog', { name: 'Corregir cierre' });
  await dialog.getByLabel('Qué se corrige').selectOption('COUNTED_CASH');
  await dialog.getByLabel('Valor correcto (Bs)').fill('160');
  await expect(dialog).toContainText('Sin diferencia');
  await dialog.getByLabel('Motivo de la corrección').fill('Se contó mal un billete de 10 Bs');
  await dialog.getByRole('button', { name: 'Registrar corrección' }).click();
  await expect(page.getByText('Corrección registrada', { exact: false })).toBeVisible();
  await expect(page.getByText('Corregida (1)')).toBeVisible();
  await expect(page.getByLabel('Cierre original')).toContainText(/Faltante de .*10,00/);
  await expect(page.getByLabel('Cifras vigentes')).toContainText('Sin diferencia');

  // 3. Incidencia: se atiende y se cierra; la venta y el stock no cambian.
  await menu(page).getByRole('link', { name: 'Incidencias' }).click();
  const label = `INC-${String(incidentNumber).padStart(6, '0')}`;
  await page.getByRole('button', { name: `Ver la incidencia ${label}` }).click();
  const incidentDialog = page.getByRole('dialog', { name: `Incidencia ${label}` });
  await expect(incidentDialog).toContainText(
    'La incidencia no modifica la venta, el stock ni la caja.',
  );
  await incidentDialog
    .getByLabel(/Resolución/)
    .fill('Se habló con el cliente; sin cambios en el sistema');
  await incidentDialog.getByRole('button', { name: 'Cerrar incidencia' }).click();
  await expect(incidentDialog.getByText(/Cerrada por/)).toBeVisible();

  const after = (await (await request.get(`/api/v1/sales/${sale.id}`)).json()) as {
    data: { total: string };
  };
  expect(after.data.total).toBe(sale.total);
  expect(await stockOf(request, piece.sku)).toBe(stockBefore);
});
