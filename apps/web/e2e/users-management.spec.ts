import { expect, test } from '@playwright/test';

test('crea usuario, cambia contraseña y desactiva su acceso', async ({ page }) => {
  const email = 'nuevo-qa@example.invalid';
  const firstPassword = 'clave-primera-123';
  const secondPassword = 'clave-segunda-456';

  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(process.env.SEED_ADMIN_EMAIL ?? '');
  await page.getByLabel('Contraseña').fill(process.env.SEED_ADMIN_PASSWORD ?? '');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Usuarios' })
    .click();
  await page.getByRole('button', { name: 'Nuevo usuario' }).click();
  await page.getByLabel('Nombre del nuevo usuario').fill('Nuevo usuario');
  await page.getByLabel('Correo del nuevo usuario').fill(email);
  await page.getByLabel('Contraseña inicial', { exact: true }).fill(firstPassword);
  await page.getByLabel('Confirmar contraseña inicial').fill(firstPassword);
  await page.getByLabel('Vendedor').check();
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  await expect(page.getByRole('row', { name: /Nuevo usuario/ })).toContainText(email);

  await page.getByRole('button', { name: 'Salir' }).click();
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(firstPassword);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Mi cuenta' })
    .click();
  await page.getByLabel('Contraseña actual').fill(firstPassword);
  await page.getByLabel('Contraseña nueva', { exact: true }).fill(secondPassword);
  await page.getByLabel('Confirmar contraseña nueva').fill(secondPassword);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(firstPassword);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos');
  await page.getByLabel('Contraseña').fill(secondPassword);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Mi cuenta' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Salir' }).click();

  await page.getByLabel('Correo electrónico').fill(process.env.SEED_ADMIN_EMAIL ?? '');
  await page.getByLabel('Contraseña').fill(process.env.SEED_ADMIN_PASSWORD ?? '');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Usuarios' })
    .click();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Desactivar Nuevo usuario' }).click();
  await expect(page.getByRole('row', { name: /Nuevo usuario/ })).toContainText('Inactivo');
  await page.getByRole('button', { name: 'Salir' }).click();
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(secondPassword);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos');
});
