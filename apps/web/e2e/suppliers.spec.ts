import { expect, test } from '@playwright/test';

test('registra, encuentra, edita y desactiva un proveedor', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(process.env.SEED_ADMIN_EMAIL ?? '');
  await page.getByLabel('Contraseña').fill(process.env.SEED_ADMIN_PASSWORD ?? '');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByRole('link', { name: 'Proveedores' }).click();
  await expect(page.getByRole('heading', { name: 'Proveedores' })).toBeVisible();

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
});
