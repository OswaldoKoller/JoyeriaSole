import { expect, test, type Page } from '@playwright/test';

/**
 * S10 · Auditoría solo para el Administrador (Q-15.3), con los usuarios DEMO de
 * `npm run db:seed:demo`. El Administrador provoca una acción (alta y edición de un proveedor
 * con nombre propio, que luego desactiva) y la encuentra en la pantalla con su antes/después;
 * el Responsable y el Vendedor no ven la entrada de menú y la API les responde 403.
 */
const PASSWORD = process.env.DEMO_USER_PASSWORD ?? '';
test.skip(!PASSWORD, 'Definir DEMO_USER_PASSWORD (npm run qa lo genera)');

const USERS = {
  admin: 'demo-admin@example.invalid',
  inventario: 'demo-inventario@example.invalid',
  vendedor: 'demo-vendedor@example.invalid',
};
const SUPPLIER = `Proveedor Auditoría E2E ${Date.now()}`;
const menu = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' });

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: /Bienvenido/ })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('el Administrador provoca una acción y la encuentra en la auditoría con su antes/después', async ({
  page,
}) => {
  await login(page, USERS.admin);

  // Acción propia: alta y edición de un proveedor (todo queda auditado).
  await menu(page).getByRole('link', { name: 'Proveedores' }).click();
  await page.getByRole('button', { name: 'Nuevo proveedor' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill(SUPPLIER);
  await page.getByRole('button', { name: 'Guardar proveedor' }).click();
  const row = page.getByRole('row', { name: new RegExp(SUPPLIER) });
  await expect(row).toBeVisible();
  await page.getByRole('button', { name: `Editar ${SUPPLIER}` }).click();
  await page.getByLabel('Persona de contacto').fill('Rosario Auditoría');
  await page.getByRole('button', { name: 'Guardar proveedor' }).click();
  await expect(row).toContainText('Rosario Auditoría');

  // La entrada de menú existe y lleva a la pantalla.
  await menu(page).getByRole('link', { name: 'Auditoría' }).click();
  await expect(page.getByRole('heading', { name: 'Auditoría' })).toBeVisible();
  await expect(menu(page).getByRole('link', { name: 'Auditoría' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // Filtra por acción y tipo de entidad (los selectores se llenan con lo que existe).
  await expect(page.getByRole('option', { name: 'Proveedor modificado' })).toBeAttached();
  await page.getByLabel('Acción', { exact: true }).selectOption('supplier.updated');
  await page.getByLabel('Tipo de entidad').selectOption('Supplier');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(page).toHaveURL(/action=supplier\.updated/);

  const table = page.getByRole('table', { name: /Registros de auditoría/ });
  const first = table.getByRole('row').nth(1);
  await expect(first).toContainText('Proveedor modificado');
  await first.getByRole('button', { name: /Ver detalle/ }).click();

  // Detalle: antes/después con el campo que cambió resaltado.
  const dialog = page.getByRole('dialog', { name: 'Detalle del registro' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Proveedor modificado');
  const changed = dialog.getByRole('row', { name: /Persona de contacto/ });
  await expect(changed).toHaveAttribute('data-changed', 'true');
  await expect(changed).toContainText('vacío');
  await expect(changed).toContainText('Rosario Auditoría');
  await expect(dialog.getByRole('row', { name: /^Nombre/ })).toHaveAttribute(
    'data-changed',
    'false',
  );

  // JSON completo, escapado, sin datos sensibles.
  await dialog.getByRole('button', { name: 'Ver JSON completo' }).click();
  const json = dialog.getByLabel('JSON completo del registro');
  await expect(json).toContainText('"contactName": "Rosario Auditoría"');
  await expect(json).not.toContainText('passwordHash');

  // Escape cierra el detalle y devuelve el foco al botón que lo abrió.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(first.getByRole('button', { name: /Ver detalle/ })).toBeFocused();

  // Los filtros se leen de la URL: enlace directo a la auditoría de una entidad.
  const logs = await page.request.get('/api/v1/audit?action=supplier.created&pageSize=100');
  const created = (
    (await logs.json()) as { data: { entityId: string; after: { name: string } }[] }
  ).data.find((entry) => entry.after.name === SUPPLIER);
  expect(created).toBeDefined();
  await page.goto(`/auditoria?entityType=Supplier&entityId=${created?.entityId ?? ''}`);
  await expect(page.getByLabel('ID de la entidad')).toHaveValue(created?.entityId ?? '');
  await expect(page.getByText('2 registros con 2 filtros')).toBeVisible();
  const entityTable = page.getByRole('table', { name: /Registros de auditoría/ });
  await expect(entityTable.getByText('Proveedor creado')).toBeVisible();
  await expect(entityTable.getByText('Proveedor modificado')).toBeVisible();

  // Limpieza: el proveedor de la prueba queda inactivo.
  await menu(page).getByRole('link', { name: 'Proveedores' }).click();
  page.once('dialog', (confirm) => void confirm.accept());
  await page.getByRole('button', { name: `Desactivar ${SUPPLIER}` }).click();
  await expect(page.getByRole('row', { name: new RegExp(SUPPLIER) })).toContainText('Inactivo');
});

for (const width of [320, 768, 1440]) {
  test(`la tabla (tarjetas en móvil) y el detalle no desbordan a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, USERS.admin);
    await page.goto('/auditoria');
    const table = page.getByRole('table', { name: /Registros de auditoría/ });
    await expect(table).toBeVisible();
    const overflow = () =>
      page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dialog: (() => {
          const el = document.querySelector('[role=dialog]');
          return el ? el.scrollWidth - el.clientWidth : 0;
        })(),
      }));
    expect((await overflow()).page).toBeLessThanOrEqual(0);
    // En móvil no hay encabezados de columna: cada fila es una tarjeta con sus etiquetas.
    await expect(table.getByRole('columnheader', { name: 'Usuario' })).toBeVisible({
      visible: width >= 1024,
    });

    await table
      .getByRole('button', { name: /Ver detalle/ })
      .first()
      .click();
    await expect(page.getByRole('dialog', { name: 'Detalle del registro' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver JSON completo' })).toBeVisible();
    await page.getByRole('button', { name: 'Ver JSON completo' }).click();
    const sizes = await overflow();
    expect(sizes.page).toBeLessThanOrEqual(0);
    expect(sizes.dialog).toBeLessThanOrEqual(0);
  });
}

for (const [name, email] of [
  ['Responsable de inventario', USERS.inventario],
  ['Vendedor', USERS.vendedor],
] as const) {
  test(`${name}: sin entrada de menú, sin pantalla y la API responde 403`, async ({ page }) => {
    await login(page, email);
    await expect(menu(page).getByRole('link', { name: 'Auditoría' })).toHaveCount(0);

    await page.goto('/auditoria');
    await expect(page.getByText('No tiene permiso para ver esta sección.')).toBeVisible();

    for (const url of ['/api/v1/audit', '/api/v1/audit/actions', '/api/v1/audit/1']) {
      const response = await page.request.get(url);
      expect(response.status(), url).toBe(403);
    }
  });
}
