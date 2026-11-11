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
  scan,
  stockOf,
} from './sales-helpers.ts';

/**
 * Recorrido completo del Responsable de inventario (quien abre y cierra la caja, B3): abre la caja
 * con fondo → vende con pago mixto (QR + efectivo con vuelto) pasando por la revisión obligatoria
 * → imprime el comprobante en 80 mm (original y «COPIA») → cierra con una diferencia y observación.
 */
test.skip(!PASSWORD, 'Definir DEMO_USER_PASSWORD (npm run qa lo genera)');

declare global {
  interface Window {
    __prints?: number;
  }
}

test('el Responsable abre la caja, vende con pago mixto, imprime y cierra con diferencia', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await apiLogin(request, USERS.admin);
  await ensureCashClosed(request);
  const piece = await createPiece(request, `E2E Venta Anillo Mixto ${SUFFIX}`, '150.50', 3);

  // window.print sustituido por un contador (el diálogo real no se puede automatizar).
  await page.addInitScript(() => {
    window.__prints = 0;
    window.print = () => {
      window.__prints = (window.__prints ?? 0) + 1;
    };
  });
  await login(page, USERS.inventario);

  // 1. Abrir la caja con fondo inicial.
  await menu(page).getByRole('link', { name: 'Caja' }).click();
  await expect(page.getByRole('heading', { name: 'La caja está cerrada' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir caja' }).click();
  const openDialog = page.getByRole('dialog', { name: 'Abrir caja' });
  await openDialog.getByLabel('Fondo inicial (Bs)').fill('100');
  await openDialog.getByRole('button', { name: 'Abrir caja' }).click();
  await expect(page.getByText(/abierta con un fondo de/)).toBeVisible();

  // 2. Vender con el lector (texto + Enter) y pago mixto.
  await menu(page).getByRole('link', { name: 'Punto de venta' }).click();
  await expect(page.getByLabel('Código de la pieza')).toBeFocused();
  await scan(page, piece.sku);
  await expect(page.getByText(`Agregada: ${piece.name} (${piece.sku}).`)).toBeVisible();
  await page.getByLabel('QR (Bs)').fill('50');
  await page.getByLabel('Referencia del QR (opcional)').fill('OP-E2E-1');
  await page.getByLabel('Efectivo recibido (Bs)').fill('120');
  await expect(page.getByRole('status', { name: 'Estado del cobro' })).toContainText(/19,50/);
  await page.getByRole('button', { name: 'Revisar venta' }).click();

  const review = page.getByRole('region', { name: 'Revise la venta antes de confirmar' });
  await expect(review).toContainText(
    'Una venta confirmada no se puede anular ni modificar. Revise las piezas y los importes antes de confirmar.',
  );
  await expect(review.getByRole('row', { name: new RegExp(piece.sku) })).toBeVisible();
  await expect(review.getByLabel('Pagos')).toContainText(/Suma de pagos.*150,50/);
  await expect(review.getByLabel('Pagos')).toContainText(/Vuelto.*19,50/);
  await review.getByRole('button', { name: 'Confirmar venta' }).click();
  const done = page.getByRole('heading', { name: /^Venta VTA-\d{6} registrada$/ });
  await expect(done).toBeVisible();
  await expect(page.getByText(/Vuelto a entregar/)).toContainText('19,50');
  expect(await stockOf(request, piece.sku)).toBe(2);

  // 3. Comprobante en 80 mm: el original y luego una «COPIA».
  await page.getByRole('link', { name: 'Ver comprobante' }).click();
  await page.getByRole('radio', { name: 'Rollo de 80 mm' }).check();
  await page.getByRole('button', { name: /^Imprimir comprobante de la venta VTA-/ }).click();
  await expect(page.getByText('Impresión del original registrada.')).toBeVisible();
  expect(await page.evaluate(() => window.__prints)).toBe(1);
  const printArea = page.locator('#print-receipt');
  await expect(printArea).not.toContainText('COPIA');
  expect(await printArea.locator('style').textContent()).toContain(
    '@page { size: 80mm auto; margin: 0; }',
  );
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#root')).toBeHidden();
  await expect(printArea).toBeVisible();
  await expect(printArea).toContainText('Comprobante interno');
  await expect(printArea).toContainText('No válido como factura fiscal');
  await expect(printArea).not.toContainText('OP-E2E-1'); // la referencia no se imprime
  await page.emulateMedia({ media: 'screen' });

  // El formato se recuerda tras recargar; la segunda impresión es una copia.
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Rollo de 80 mm' })).toBeChecked();
  await page.getByRole('button', { name: /^Imprimir comprobante de la venta VTA-/ }).click();
  await expect(page.getByText('Impresión registrada como copia n.º 2.')).toBeVisible();
  await expect(printArea).toContainText('COPIA');
  expect(await page.evaluate(() => window.__prints)).toBe(1); // contador nuevo tras recargar
  // Imprimir no vendió nada: el stock sigue igual.
  expect(await stockOf(request, piece.sku)).toBe(2);

  // 4. Cierre con diferencia: esperado 100 + 100,50 = 200,50; contado 195,50.
  await menu(page).getByRole('link', { name: 'Caja' }).click();
  await expect(page.getByLabel('Cifras de la caja')).toContainText(/200,50/);
  await page.getByRole('link', { name: 'Cerrar caja' }).click();
  await page.getByLabel('Efectivo contado (Bs)').fill('195,50');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText(/Faltante de .*5,00/).first()).toBeVisible();
  await expect(page.getByText(/QR y transferencia se informan aparte/)).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar caja' }).click();
  await expect(page.getByRole('alert')).toContainText(/explique el motivo/);
  await page.getByLabel(/Observación \(obligatoria/).fill('Faltan 5 Bs; se revisará el vuelto');
  await page.getByRole('button', { name: 'Cerrar caja' }).click();
  const confirm = page.getByRole('dialog', { name: '¿Cerrar la caja?' });
  await expect(confirm).toContainText('El cierre no se puede reabrir');
  await confirm.getByRole('button', { name: 'Confirmar cierre' }).click();
  await expect(page.getByRole('heading', { name: /^Caja CAJ-\d{6} cerrada$/ })).toBeVisible();

  await page.getByRole('link', { name: 'Ver el detalle del cierre' }).click();
  await expect(page.getByLabel('Cierre original')).toContainText(/Faltante de .*5,00/);
  await expect(page.getByText(/Faltan 5 Bs; se revisará el vuelto/)).toBeVisible();
  // El Responsable no corrige cierres ni gestiona incidencias (solo el Administrador).
  await expect(page.getByRole('button', { name: 'Corregir cierre' })).toHaveCount(0);
  await expect(menu(page).getByRole('link', { name: 'Incidencias' })).toHaveCount(0);
  await expect(menu(page).getByRole('link', { name: 'Historial de ventas' })).toBeVisible();
});
