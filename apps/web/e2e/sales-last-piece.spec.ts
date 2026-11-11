import { expect, test } from '@playwright/test';
import {
  PASSWORD,
  SUFFIX,
  USERS,
  apiLogin,
  createPiece,
  ensureCashClosed,
  login,
  openCash,
  scan,
  stockOf,
} from './sales-helpers.ts';

/**
 * La última pieza no se vende dos veces (RK-18, P-08): dos personas tienen la misma pieza única
 * en su carrito y llegan a la revisión; la primera confirma; la segunda recibe «stock
 * insuficiente», vuelve al carrito con la línea marcada y el stock queda en 0, nunca negativo.
 */
test.skip(!PASSWORD, 'Definir DEMO_USER_PASSWORD (npm run qa lo genera)');

test('dos vendedores y una sola pieza: solo una venta se registra', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  await apiLogin(request, USERS.admin);
  await ensureCashClosed(request);
  await openCash(request, '0');
  const piece = await createPiece(request, `E2E Venta Pieza Unica ${SUFFIX}`, '99', 1);

  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  try {
    await login(page, USERS.vendedor);
    await login(other, USERS.inventario);
    for (const seller of [page, other]) {
      await seller.goto('/ventas/nueva');
      await scan(seller, piece.sku);
      await expect(seller.getByRole('row', { name: new RegExp(piece.sku) })).toBeVisible();
      await seller.getByLabel('Efectivo recibido (Bs)').fill('100');
      await seller.getByRole('button', { name: 'Revisar venta' }).click();
      await expect(seller.getByRole('button', { name: 'Confirmar venta' })).toBeEnabled();
    }

    await page.getByRole('button', { name: 'Confirmar venta' }).click();
    await expect(page.getByRole('heading', { name: /^Venta VTA-\d{6} registrada$/ })).toBeVisible();

    await other.getByRole('button', { name: 'Confirmar venta' }).click();
    await expect(
      other.getByText('No hay stock suficiente de una o más piezas.', { exact: false }),
    ).toBeVisible();
    await expect(other.getByRole('row', { name: new RegExp(piece.sku) })).toContainText(
      'Ya no hay stock de esta pieza: quítela del carrito.',
    );
    await expect(other.getByRole('button', { name: 'Revisar venta' })).toBeDisabled();

    expect(await stockOf(request, piece.sku)).toBe(0);
    const sales = (await (await request.get('/api/v1/sales?pageSize=100')).json()) as {
      data: { id: string }[];
    };
    let sold = 0;
    for (const sale of sales.data) {
      const detail = (await (await request.get(`/api/v1/sales/${sale.id}`)).json()) as {
        data: { items: { variantId: string; quantity: number }[] };
      };
      sold += detail.data.items
        .filter((item) => item.variantId === piece.variantId)
        .reduce((sum, item) => sum + item.quantity, 0);
    }
    expect(sold).toBe(1);
  } finally {
    await otherContext.close();
    await ensureCashClosed(request);
  }
});
