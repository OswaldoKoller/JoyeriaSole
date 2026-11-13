import { expect, test, type Page } from '@playwright/test';

/**
 * Gestión de roles (P-46): el Administrador crea un rol, lo asigna a un usuario nuevo y ese usuario
 * ve solo lo que el rol permite; al ampliar el rol, la sesión abierta lo refleja sin volver a entrar.
 */
const ROLE = 'E2E Consulta proveedores';
const EMAIL = 'e2e-roles@example.invalid';
const PASSWORD = 'clave-e2e-roles-123';

const menu = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' });

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(menu(page)).toBeVisible();
}

test('crear rol, asignarlo a un usuario y que ese usuario vea solo lo permitido', async ({
  page,
  browser,
}) => {
  await login(page, process.env.SEED_ADMIN_EMAIL ?? '', process.env.SEED_ADMIN_PASSWORD ?? '');

  await menu(page).getByRole('link', { name: 'Roles' }).click();
  await expect(page.getByRole('heading', { name: 'Roles', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo rol' }).click();
  const form = page.getByRole('form', { name: 'Nuevo rol' });
  await form.getByLabel('Nombre del rol').fill(ROLE);
  await form.getByLabel('Descripción del rol').fill('Solo consulta proveedores');
  await form.getByLabel('Ver proveedores').check();
  await form.getByRole('button', { name: 'Crear rol' }).click();
  await expect(page.getByRole('row', { name: new RegExp(ROLE) })).toContainText('Personalizado');

  await menu(page).getByRole('link', { name: 'Usuarios' }).click();
  await page.getByRole('button', { name: 'Nuevo usuario' }).click();
  await page.getByLabel('Nombre del nuevo usuario').fill('Usuario de rol E2E');
  await page.getByLabel('Correo del nuevo usuario').fill(EMAIL);
  await page.getByLabel('Contraseña inicial', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirmar contraseña inicial').fill(PASSWORD);
  // El selector de roles se carga desde la API: incluye el rol recién creado.
  await page.getByLabel(ROLE).check();
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  await expect(page.getByRole('row', { name: /Usuario de rol E2E/ })).toContainText(ROLE);

  // El nuevo usuario, en otra sesión del navegador.
  const other = await browser.newContext();
  const userPage = await other.newPage();
  await login(userPage, EMAIL, PASSWORD);
  await expect(menu(userPage).getByRole('link', { name: 'Proveedores' })).toBeVisible();
  for (const name of ['Productos', 'Usuarios', 'Roles', 'Auditoría']) {
    await expect(menu(userPage).getByRole('link', { name })).toHaveCount(0);
  }
  await menu(userPage).getByRole('link', { name: 'Proveedores' }).click();
  await expect(userPage.getByRole('heading', { name: 'Proveedores', level: 1 })).toBeVisible();

  // El Administrador amplía el rol; el usuario no cierra sesión.
  await menu(page).getByRole('link', { name: 'Roles' }).click();
  await page.getByRole('button', { name: `Editar ${ROLE}` }).click();
  const edit = page.getByRole('form', { name: `Editar rol ${ROLE}` });
  await edit.getByLabel('Ver catálogo').check();
  await edit.getByRole('button', { name: 'Guardar rol' }).click();
  await expect(edit).toHaveCount(0);

  await userPage.reload();
  await expect(menu(userPage).getByRole('link', { name: 'Productos' })).toBeVisible();
  await expect(menu(userPage).getByRole('link', { name: 'Roles' })).toHaveCount(0);
  await other.close();
});
