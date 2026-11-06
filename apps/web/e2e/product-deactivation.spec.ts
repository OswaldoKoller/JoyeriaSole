import { expect, test, type Page } from '@playwright/test';
import { openProduct, productTile } from './product-pages.ts';

/**
 * P-22: no se desactiva un producto ni una variante con stock. Usa el Administrador DEMO y crea
 * productos propios (no toca los datos DEMO ni los totales del dashboard).
 */
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD ?? '';
test.skip(!DEMO_PASSWORD, 'Definir DEMO_USER_PASSWORD (npm run qa lo genera)');

const menu = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' });

async function createProduct(page: Page, name: string) {
  await page.getByRole('button', { name: 'Nuevo producto' }).click();
  await page.getByLabel('Categoría').selectOption({ label: 'DEMO Anillos' });
  await page.getByLabel('Nombre del producto').fill(name);
  await page.getByRole('button', { name: 'Guardar producto' }).click();
  await expect(productTile(page, name)).toBeVisible();
}

test('un producto con stock no se desactiva; sin stock sí', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill('demo-admin@example.invalid');
  await page.getByLabel('Contraseña').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(menu(page)).toBeVisible();

  const stocked = 'E2E Desactivar Con Stock';
  const empty = 'E2E Desactivar Sin Stock';
  await menu(page).getByRole('link', { name: 'Productos' }).click();
  await createProduct(page, stocked);
  await createProduct(page, empty);

  // Carga 4 piezas al primero (stock inicial).
  await menu(page).getByRole('link', { name: 'Saldos y alertas' }).click();
  await page.getByLabel('Buscar por producto, SKU o código').fill(stocked);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page
    .getByRole('row', { name: new RegExp(stocked) })
    .getByRole('button', { name: /stock inicial/i })
    .click();
  await page.getByLabel('Cantidad en piezas').fill('4');
  await page.getByLabel('Motivo').fill('Apertura E2E desactivación');
  await page.getByRole('button', { name: 'Registrar entrada' }).click();
  await expect(page.getByRole('row', { name: new RegExp(stocked) })).toContainText('Disponible');

  // Con stock: el botón está deshabilitado y se explica el motivo.
  await menu(page).getByRole('link', { name: 'Productos' }).click();
  await page.getByLabel('Buscar por nombre, SKU o código de barras').fill(stocked);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await openProduct(page, stocked);
  const stockedCard = page.getByRole('article').filter({ hasText: stocked });
  await expect(stockedCard.getByRole('button', { name: `Desactivar ${stocked}` })).toBeDisabled();
  await expect(stockedCard).toContainText('No se puede desactivar el producto: tiene 4 piezas');
  await expect(stockedCard.getByRole('button', { name: /^Desactivar variante/ })).toBeDisabled();

  // La API también lo rechaza aunque se salte la interfaz.
  const productId = await page.evaluate(async (name) => {
    const response = await fetch(`/api/v1/products?q=${encodeURIComponent(name)}`);
    const body = (await response.json()) as { data: { id: string }[] };
    return body.data[0]?.id ?? '';
  }, stocked);
  const blocked = await page.request.patch(`/api/v1/products/${productId}`, {
    data: { status: 'INACTIVE' },
  });
  expect(blocked.status()).toBe(422);
  expect((await blocked.json()).error.code).toBe('STOCK_BLOCKS_DEACTIVATION');

  // Sin stock: se desactiva y se puede volver a activar.
  await page.getByRole('link', { name: '← Volver a Productos' }).click();
  await page.getByLabel('Buscar por nombre, SKU o código de barras').fill(empty);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await openProduct(page, empty);
  const emptyCard = page.getByRole('article').filter({ hasText: empty });
  await emptyCard.getByRole('button', { name: `Desactivar ${empty}` }).click();
  await expect(emptyCard).toContainText('Inactivo');
  await emptyCard.getByRole('button', { name: `Activar ${empty}` }).click();
  await expect(emptyCard.getByRole('button', { name: `Desactivar ${empty}` })).toBeVisible();
});
