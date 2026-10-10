import { expect, test } from '@playwright/test';

test('el administrador consulta usuarios desde el menú', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(process.env.SEED_ADMIN_EMAIL ?? '');
  await page.getByLabel('Contraseña').fill(process.env.SEED_ADMIN_PASSWORD ?? '');
  await page.getByRole('button', { name: 'Ingresar' }).click();

  const menu = page.getByRole('navigation', { name: 'Navegación principal' });
  await menu.getByRole('link', { name: 'Usuarios' }).click();
  await expect(page).toHaveURL(/\/usuarios$/);
  await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Administrador de pruebas/ })).toContainText(
    process.env.SEED_ADMIN_EMAIL ?? '',
  );
  await page.getByRole('button', { name: 'Editar Administrador de pruebas' }).click();
  await page.getByLabel('Responsable de inventario').check();
  await page.getByRole('button', { name: 'Guardar roles' }).click();
  await expect(page.getByRole('row', { name: /Administrador de pruebas/ })).toContainText(
    'Responsable de inventario',
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();
});
