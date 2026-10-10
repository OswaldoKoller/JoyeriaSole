import { expect, test } from '@playwright/test';

test('registra, encuentra, edita y desactiva un proveedor', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(process.env.SEED_ADMIN_EMAIL ?? '');
  await page.getByLabel('Contraseña').fill(process.env.SEED_ADMIN_PASSWORD ?? '');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  const menu = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(menu.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
  await menu.getByRole('link', { name: 'Proveedores' }).click();
  await expect(page.getByRole('heading', { name: 'Proveedores' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Proveedores' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await page.getByRole('button', { name: 'Nuevo proveedor' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Proveedor de prueba');
  await page.getByLabel('NIT o identificador').fill('QA-123');
  await page.getByRole('button', { name: 'Guardar proveedor' }).click();
  await expect(page.getByRole('row', { name: /Proveedor de prueba/ })).toContainText('QA-123');

  await page.getByRole('button', { name: 'Editar Proveedor de prueba' }).click();
  await page.getByLabel('Persona de contacto').fill('María');
  await page.getByRole('button', { name: 'Guardar proveedor' }).click();
  await expect(page.getByRole('row', { name: /Proveedor de prueba/ })).toContainText('María');

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Desactivar Proveedor de prueba' }).click();
  await expect(page.getByRole('row', { name: /Proveedor de prueba/ })).toContainText('Inactivo');
  await page.getByLabel('Estado').selectOption('inactive');
  await expect(page.getByRole('row', { name: /Proveedor de prueba/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Proveedores' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(menu.getByRole('link', { name: 'Inicio' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Proveedores' })).toBeVisible();
  await menu.getByRole('link', { name: 'Inicio' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: /Bienvenido/ })).toBeVisible();
  await page.getByRole('link', { name: 'Proveedores →' }).click();
  await expect(page).toHaveURL('/proveedores');
  await page.goto('/pagina-inexistente');
  await expect(page.getByText('Página no encontrada.')).toBeVisible();
  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await expect(page).toHaveURL('/');
});
