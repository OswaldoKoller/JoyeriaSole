import { expect, test, type Page } from '@playwright/test';

/**
 * Cambios de pieza (ADR-019): no hay pantalla de registro en la Fase 1 (el punto de venta no es de
 * esta fase), así que el cambio se registra por la API y se comprueba lo visible: las etiquetas
 * en español del historial de movimientos y el 403 del Vendedor. Hace un cambio y el inverso, de
 * modo que el stock queda como estaba. Corre después de stock-entries y antes de suppliers.
 */
const PASSWORD = process.env.DEMO_USER_PASSWORD ?? '';
test.skip(!PASSWORD, 'Definir DEMO_USER_PASSWORD (npm run qa lo genera)');

const USERS = {
  inventario: 'demo-inventario@example.invalid',
  vendedor: 'demo-vendedor@example.invalid',
};

const menu = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' });

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(menu(page)).toBeVisible();
}

interface StockRow {
  variantId: string;
  sku: string;
  quantity: number;
}

async function demoStock(page: Page): Promise<StockRow[]> {
  const response = await page.request.get('/api/v1/inventory?q=DEMO&pageSize=100');
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { data: StockRow[] }).data;
}

async function exchange(page: Page, returnedId: string, deliveredId: string) {
  return page.request.post('/api/v1/inventory/exchanges', {
    data: {
      returned: { variantId: returnedId, quantity: 1 },
      delivered: { variantId: deliveredId, quantity: 1 },
      reason: 'Cambio de talla E2E',
    },
  });
}

test('el Responsable registra un cambio por la API y el historial lo muestra en español', async ({
  page,
}) => {
  await login(page, USERS.inventario);
  const stock = await demoStock(page);
  const withStock = stock.filter((row) => row.quantity >= 1);
  expect(withStock.length).toBeGreaterThanOrEqual(2);
  const [a, b] = withStock;
  if (!a || !b) throw new Error('Se necesitan dos piezas DEMO con stock');

  // a vuelve (entra), b se entrega (sale); luego el cambio inverso deja todo como estaba.
  const first = await exchange(page, a.variantId, b.variantId);
  expect(first.status()).toBe(201);
  const created = (await first.json()) as { data: { referenceId: string } };
  expect((await exchange(page, b.variantId, a.variantId)).status()).toBe(201);

  const detail = await page.request.get(`/api/v1/inventory/exchanges/${created.data.referenceId}`);
  expect(detail.status()).toBe(200);

  await page.goto('/inventario/movimientos');
  await expect(page.getByText('Cambio: entrada de pieza devuelta').first()).toBeVisible();
  await expect(page.getByText('Cambio: salida de pieza entregada').first()).toBeVisible();

  const after = await demoStock(page);
  for (const row of [a, b]) {
    expect(after.find((item) => item.sku === row.sku)?.quantity, row.sku).toBe(row.quantity);
  }
});

test('el Vendedor no puede registrar cambios de pieza (403)', async ({ page }) => {
  await login(page, USERS.vendedor);
  const response = await exchange(
    page,
    '01900000-0000-7000-8000-000000000001',
    '01900000-0000-7000-8000-000000000002',
  );
  expect(response.status()).toBe(403);
});
