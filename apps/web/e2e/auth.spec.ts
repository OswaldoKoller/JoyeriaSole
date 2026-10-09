import { expect, test } from '@playwright/test';

const email = process.env.SEED_ADMIN_EMAIL ?? '';
const password = process.env.SEED_ADMIN_PASSWORD ?? '';

test.describe('autenticación', () => {
  test('redirige a /login cuando no hay sesión', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Joyería Sole' })).toBeVisible();
  });

  test('el administrador inicia y cierra sesión', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña').fill(password);
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page.getByRole('heading', { name: /Bienvenido/ })).toBeVisible();

    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
