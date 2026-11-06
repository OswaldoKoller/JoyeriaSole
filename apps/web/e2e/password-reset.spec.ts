import { expect, test, type Page } from '@playwright/test';

/**
 * F2: el Administrador restablece la clave de otra persona con una clave temporal; esa persona debe
 * cambiarla antes de usar el sistema. Se crea un usuario propio para no alterar los usuarios DEMO.
 */
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? '';

const email = 'olvido-qa@example.invalid';
const initialPassword = 'clave-inicial-123';
const temporaryPassword = 'clave-temporal-456';
const definitivePassword = 'clave-definitiva-789';

const menu = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' });

async function login(page: Page, mail: string, password: string) {
  await page.getByLabel('Correo electrónico').fill(mail);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

test('restablecer clave → login con temporal → cambio forzado → login normal', async ({ page }) => {
  // El Administrador crea a la persona y le restablece la clave.
  await page.goto('/login');
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await menu(page).getByRole('link', { name: 'Usuarios' }).click();
  await page.getByRole('button', { name: 'Nuevo usuario' }).click();
  await page.getByLabel('Nombre del nuevo usuario').fill('Persona Olvidadiza');
  await page.getByLabel('Correo del nuevo usuario').fill(email);
  await page.getByLabel('Contraseña inicial', { exact: true }).fill(initialPassword);
  await page.getByLabel('Confirmar contraseña inicial').fill(initialPassword);
  await page.getByLabel('Vendedor').check();
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  await expect(page.getByRole('row', { name: /Persona Olvidadiza/ })).toContainText(email);

  await page.getByRole('button', { name: 'Editar Persona Olvidadiza' }).click();
  // Una clave corta se rechaza antes de llamar a la API.
  await page.getByLabel('Contraseña temporal').fill('corta');
  await page.getByRole('button', { name: 'Restablecer contraseña' }).click();
  await expect(page.getByRole('alert')).toContainText(/10 caracteres/);

  await page.getByLabel('Contraseña temporal').fill(temporaryPassword);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Restablecer contraseña' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Contraseña restablecida' }),
  ).toBeVisible();
  await expect(page.getByRole('row', { name: /Persona Olvidadiza/ })).toContainText(
    'Debe cambiar su clave',
  );
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // La clave anterior ya no sirve; la temporal lleva a la pantalla de cambio obligatorio.
  await login(page, email, initialPassword);
  await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos');
  await login(page, email, temporaryPassword);
  await expect(page.getByText('El Administrador le asignó una contraseña temporal')).toBeVisible();
  await expect(menu(page)).toHaveCount(0);

  // Ninguna otra ruta se puede usar mientras tanto, ni en la web ni en la API.
  for (const route of ['/productos', '/inventario', '/mi-cuenta']) {
    await page.goto(route);
    await expect(
      page.getByText('El Administrador le asignó una contraseña temporal'),
    ).toBeVisible();
  }
  const blocked = await page.request.get('/api/v1/products');
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).error.code).toBe('PASSWORD_CHANGE_REQUIRED');

  // Repetir la temporal no sirve; una clave nueva sí y obliga a volver a entrar.
  await page.getByLabel('Contraseña temporal').fill(temporaryPassword);
  await page.getByLabel('Contraseña nueva', { exact: true }).fill(temporaryPassword);
  await page.getByLabel('Confirmar contraseña nueva').fill(temporaryPassword);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByRole('alert')).toContainText('distinta de la temporal');

  await page.getByLabel('Contraseña nueva', { exact: true }).fill(definitivePassword);
  await page.getByLabel('Confirmar contraseña nueva').fill(definitivePassword);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // Acceso normal: sin pantalla obligatoria y con el menú del Vendedor.
  await login(page, email, temporaryPassword);
  await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos');
  await login(page, email, definitivePassword);
  await expect(menu(page).getByRole('link', { name: 'Productos' })).toBeVisible();
  await expect(page.getByText('El Administrador le asignó una contraseña temporal')).toHaveCount(0);
});
