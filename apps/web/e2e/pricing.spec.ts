import { expect, test, type Page } from '@playwright/test';
import { openProduct } from './product-pages.ts';

/**
 * Precios de venta (S7, ADR-018): desde la regla de 2026-11-05 el Responsable y el Administrador
 * autorizan, así que ambos aplican precios directamente; el precio nuevo aparece en el catálogo para
 * el Vendedor, que no ve costos, y todo queda en el historial. El flujo solicitar → aprobar (para
 * roles con solo `prices:propose`) se prueba en la API (pricing.test.ts). Los tests de este archivo son
 * dependientes entre sí y corren en orden; las piezas se crean por API con nombres propios.
 */
const PASSWORD = process.env.DEMO_USER_PASSWORD ?? '';
test.skip(!PASSWORD, 'Definir DEMO_USER_PASSWORD (npm run qa lo genera)');

const USERS = {
  admin: 'demo-admin@example.invalid',
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

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

const SUFFIX = String(Date.now()).slice(-6);
const RING = `E2E Precio Anillo ${SUFFIX}`;
const NECKLACE = `E2E Precio Collar ${SUFFIX}`;
const skus: Record<string, string> = {};

async function createPiece(page: Page, name: string) {
  const categories = await page.request.get('/api/v1/categories');
  const category = (
    (await categories.json()) as { data: { id: string; name: string }[] }
  ).data.find((item) => item.name === 'DEMO Anillos');
  expect(category).toBeTruthy();
  const created = await page.request.post('/api/v1/products', {
    data: { categoryId: category?.id, name },
  });
  expect(created.status()).toBe(201);
  const body = (await created.json()) as { data: { variants: { sku: string }[] } };
  const sku = body.data.variants[0]?.sku ?? '';
  expect(sku).toMatch(/^SKU-\d{6}$/);
  return sku;
}

async function searchPrices(page: Page, term: string) {
  await page.getByLabel('Buscar por SKU, nombre o código de barras').fill(term);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
}

test.describe.configure({ mode: 'serial' });

test('el Responsable aplica precios en lote y ve la ganancia al escribir', async ({ page }) => {
  await login(page, USERS.inventario);
  skus[RING] = await createPiece(page, RING);
  skus[NECKLACE] = await createPiece(page, NECKLACE);

  await menu(page).getByRole('link', { name: 'Precios' }).click();
  await expect(page.getByRole('heading', { name: 'Precios de venta' })).toBeVisible();
  await searchPrices(page, `E2E Precio`);
  const ring = page.getByRole('row').filter({ hasText: skus[RING] });
  const necklace = page.getByRole('row').filter({ hasText: skus[NECKLACE] });
  await expect(ring).toContainText('Sin precio');
  await expect(necklace).toContainText('Sin precio');

  // Ganancia en vivo (costo 0: el porcentaje no existe)
  await ring.getByLabel(`Nuevo precio de ${skus[RING]}`).fill('120,5');
  await expect(ring.getByLabel(/Ganancia del nuevo precio: .*120,50/)).toBeVisible();
  await necklace.getByLabel(`Nuevo precio de ${skus[NECKLACE]}`).fill('80');

  // El Responsable autoriza: el cambio rige de inmediato y queda en el historial.
  await page.getByLabel('Motivo del cambio (opcional)').fill('Precio de lanzamiento');
  await page.getByRole('button', { name: 'Aplicar ahora (2)' }).click();
  await expect(page.getByText('Se aplicaron 2 precios nuevos.')).toBeVisible();
  await expect(ring).toContainText('120,50');
  await expect(ring).not.toContainText('Sin precio');
  await logout(page);
});

test('el Vendedor ve el precio nuevo en el catálogo, sin costos ni acceso a Precios', async ({
  page,
}) => {
  await login(page, USERS.vendedor);
  await menu(page).getByRole('link', { name: 'Productos' }).click();
  await page.getByLabel('Buscar por nombre, SKU o código de barras').fill(RING);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await openProduct(page, RING);
  const card = page.getByRole('article').filter({ hasText: RING });
  await expect(card).toContainText('Precio de venta (neto)');
  await expect(card).toContainText('120,50');
  await expect(card).not.toContainText(/costo|ganancia|Precios/i);
  await expect(card.getByRole('button', { name: /historial/i })).toHaveCount(0);

  await expect(menu(page).getByRole('link', { name: 'Precios' })).toHaveCount(0);
  await page.goto('/precios');
  await expect(page.getByText('No tiene permiso para ver esta sección.')).toBeVisible();
  for (const url of ['/api/v1/pricing/variants', '/api/v1/pricing/changes']) {
    const response = await page.request.get(url);
    expect(response.status()).toBe(403);
    expect(await response.text()).not.toMatch(/cost/i);
  }
  await logout(page);
});

test('el Administrador cambia un precio directamente y queda en el historial', async ({ page }) => {
  await login(page, USERS.admin);
  await menu(page).getByRole('link', { name: 'Precios' }).click();
  await searchPrices(page, skus[NECKLACE] ?? '');
  const necklace = page.getByRole('row').filter({ hasText: skus[NECKLACE] });
  await expect(necklace).toContainText('80,00');

  await necklace.getByLabel(`Nuevo precio de ${skus[NECKLACE]}`).fill('95');
  await page.getByRole('button', { name: 'Aplicar ahora (1)' }).click();
  await expect(page.getByText('Se aplicó 1 precio nuevo.')).toBeVisible();
  await expect(necklace).toContainText('95,00');

  // Historial de la variante: el cambio del Responsable y el del Administrador.
  await necklace
    .getByRole('button', { name: `Ver historial de precios de ${skus[NECKLACE]}` })
    .click();
  const history = page.getByRole('region', { name: `Historial de precios de ${skus[NECKLACE]}` });
  await expect(history).toContainText('Cambio directo (con autorización)');
  await expect(history.getByRole('row').filter({ hasText: 'Aprobado' })).toHaveCount(2);

  // Historial global.
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByLabel('Buscar en el historial por SKU o nombre').fill(skus[NECKLACE] ?? '');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: NECKLACE })).toHaveCount(2);

  // El historial también se ve desde la ficha del producto.
  await menu(page).getByRole('link', { name: 'Productos' }).click();
  await page.getByLabel('Buscar por nombre, SKU o código de barras').fill(NECKLACE);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await openProduct(page, NECKLACE);
  const card = page.getByRole('article').filter({ hasText: NECKLACE });
  await expect(card).toContainText('95,00');
  await card.getByRole('button', { name: `Ver historial de precios de ${skus[NECKLACE]}` }).click();
  await expect(card).toContainText('Cambio directo (con autorización)');
  await expect(card.getByRole('link', { name: /Cambiar el precio de/ })).toBeVisible();
  await logout(page);
});

test('la ganancia se calcula en vivo contra el costo total real de una pieza importada', async ({
  page,
}) => {
  await login(page, USERS.admin);
  await menu(page).getByRole('link', { name: 'Precios' }).click();
  await searchPrices(page, 'DEMO Anillo Alianza Lisa');
  const row = page.getByRole('row').filter({ hasText: 'Alianza Lisa' });
  await expect(row).toBeVisible();

  // Panel de costos con el costo total unitario del ingreso DEMO en dólares.
  const costText = await row.getByRole('cell').nth(5).innerText();
  expect(costText).toMatch(/Bs/);
  const cost = Number(costText.replace(/[^\d,]/g, '').replace(',', '.'));
  expect(cost).toBeGreaterThan(0);

  await row.getByLabel(/Nuevo precio de SKU-/).fill('100');
  const label = await row.getByLabel(/Ganancia del nuevo precio/).getAttribute('aria-label');
  const shown = Number(/Bs\s?(-?[\d.]+,\d+)/.exec(label ?? '')?.[1]?.replace(',', '.'));
  expect(Math.abs(shown - (100 - cost))).toBeLessThan(0.011);
  expect(label).toMatch(/% sobre el costo total/);
});
