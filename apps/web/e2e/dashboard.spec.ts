import { expect, test, type Page } from '@playwright/test';

/**
 * Dashboard con los datos DEMO de `npm run db:seed:demo`: 20 variantes, de las cuales
 * 10 disponibles, 5 bajo mínimo y 5 sin stock. Este archivo corre antes que las pruebas que
 * crean productos (orden alfabético), por eso los totales son exactos.
 */
const PASSWORD = process.env.DEMO_USER_PASSWORD ?? '';
test.skip(!PASSWORD, 'Definir DEMO_USER_PASSWORD (npm run qa lo genera)');

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: /Bienvenido/ })).toBeVisible();
}

const metric = (page: Page, name: string) =>
  page
    .getByRole('region', { name: 'Métricas principales' })
    .getByRole('article')
    .filter({ hasText: name });

test('el vendedor ve las métricas reales y ordena la tabla', async ({ page }) => {
  await login(page, 'demo-vendedor@example.invalid');

  await expect(metric(page, 'Variantes activas')).toContainText('20');
  await expect(metric(page, 'Disponibles')).toContainText('10');
  await expect(metric(page, 'Bajo mínimo')).toContainText('5');
  await expect(metric(page, 'Sin stock')).toContainText('5');
  await expect(
    page.getByRole('img', { name: /10 disponibles, 5 bajo mínimo, 5 sin stock/ }),
  ).toBeVisible();

  // Tabla: 10 piezas en alerta, las agotadas primero.
  const rows = page.getByRole('table').getByRole('row');
  await expect(rows).toHaveCount(11); // encabezado + 10
  await expect(rows.nth(1)).toContainText('Sin stock');

  const piezas = page.getByRole('columnheader', { name: /Piezas/ });
  await piezas.getByRole('button').click();
  await expect(piezas).toHaveAttribute('aria-sort', 'ascending');
  await expect(rows.nth(1).getByRole('cell').nth(2)).toHaveText('0');
  await piezas.getByRole('button').click();
  await expect(piezas).toHaveAttribute('aria-sort', 'descending');
  await expect(rows.nth(1).getByRole('cell').nth(2)).not.toHaveText('0');
});

test('el panel lateral navega, marca la página y funciona en móvil', async ({ page }) => {
  await login(page, 'demo-inventario@example.invalid');
  const menu = page.getByRole('navigation', { name: 'Navegación principal' });

  await menu.getByRole('link', { name: 'Movimientos' }).click();
  await expect(page).toHaveURL(/\/inventario\/movimientos$/);
  await expect(menu.getByRole('link', { name: 'Movimientos' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(menu.getByRole('link', { name: 'Saldos y alertas' })).not.toHaveAttribute(
    'aria-current',
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(menu).toBeHidden();
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await expect(menu.getByRole('link', { name: 'Inicio' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await menu.getByRole('link', { name: 'Inicio' }).click();
  await expect(page.getByRole('heading', { name: /Bienvenido/ })).toBeVisible();
  await expect(menu).toBeHidden();
});
