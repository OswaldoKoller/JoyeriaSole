import { expect, test, type Page } from '@playwright/test';

/**
 * Ajustes de inventario con solicitud y aprobación (ADR-017): el Responsable solicita, el
 * Administrador aprueba o rechaza, y el stock cambia ÚNICAMENTE al aprobar.
 * Usa los datos DEMO. Corre después de dashboard/responsive (orden alfabético), que dependen de
 * los totales originales del seed, y antes de stock-entries, que usa otras piezas.
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

/** Piezas en inventario de la variante cuyo producto contiene `name`. */
async function stockOf(page: Page, name: string) {
  await page.goto('/inventario');
  await page.getByLabel('Buscar por producto, SKU o código').fill(name);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  return Number(await row.getByRole('cell').nth(2).innerText());
}

async function pickReason(page: Page, reason: string) {
  await page.getByLabel('Motivo del ajuste').selectOption({ label: reason });
}

test('el Responsable solicita, el Administrador aprueba y recién entonces cambia el stock', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await login(page, USERS.inventario);
  const before = await stockOf(page, 'Dije Luna');

  // 1) Solicitud: buscar la variante (como lo haría un lector de códigos), diferencia y motivo
  await menu(page).getByRole('link', { name: 'Ajustes' }).click();
  await expect(page).toHaveURL(/\/inventario\/ajustes$/);
  await page.getByRole('link', { name: 'Solicitar ajuste' }).click();
  await page.getByLabel('Agregar variante por SKU, código de barras o nombre').fill('Dije Luna');
  await page.getByRole('button', { name: 'Buscar variante' }).click();
  await page.getByRole('button', { name: /^Agregar SKU-/ }).click();
  const line = page.getByRole('row', { name: /Dije Luna/ });
  await expect(line).toContainText(String(before)); // saldo actual
  await line.getByLabel(/^Diferencia de SKU-/).fill('-2');
  await expect(line).toContainText(String(before - 2)); // «Quedaría»
  await pickReason(page, 'Rotura');
  await page.getByLabel('Observación (opcional)').fill('E2E: se rompió el broche');
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();

  // 2) Queda pendiente: el Responsable no puede aprobar y el stock NO cambió
  await expect(page).toHaveURL(/\/inventario\/ajustes\/[0-9a-f-]{36}$/);
  const detailUrl = page.url();
  const heading = page.getByRole('heading', { name: /Ajuste AJ-\d{6}/ });
  await expect(heading).toContainText('Pendiente de aprobación');
  await expect(page.getByText(/Esperando la aprobación del Administrador/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aprobar ajuste' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rechazar ajuste' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancelar solicitud' })).toBeVisible();
  const number = /AJ-\d{6}/.exec(await heading.innerText())?.[0];
  if (!number) throw new Error('No se leyó el número del ajuste');
  expect(await stockOf(page, 'Dije Luna')).toBe(before);

  // La API tampoco deja aprobar al Responsable
  const id = detailUrl.split('/').pop();
  expect((await page.request.post(`/api/v1/inventory/adjustments/${id}/approve`)).status()).toBe(
    403,
  );
  await logout(page);

  // 3) El Administrador ve el pendiente, lo abre y aprueba
  await login(page, USERS.admin);
  await page.goto('/inventario/ajustes');
  await expect(page.getByRole('region', { name: 'Pendientes de aprobación' })).toContainText(
    /pendiente/,
  );
  await page.getByRole('button', { name: 'Ver pendientes' }).click();
  await page.getByRole('link', { name: `Abrir ajuste ${number}` }).click();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Aprobar ajuste' }).click();
  await expect(page.getByRole('heading', { name: /Ajuste AJ-\d{6}/ })).toContainText('Aprobado');
  await expect(page.getByRole('status').filter({ hasText: 'Aprobado por' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aprobar ajuste' })).toHaveCount(0);
  // Cantidad anterior y nueva quedaron registradas
  await expect(page.getByRole('columnheader', { name: 'Cantidad anterior' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Dije Luna/ })).toContainText(String(before));
  await expect(page.getByRole('row', { name: /Dije Luna/ })).toContainText(String(before - 2));

  // 4) El stock cambió exactamente lo solicitado y el movimiento está en el historial
  expect(await stockOf(page, 'Dije Luna')).toBe(before - 2);
  await page.goto('/inventario/movimientos');
  await expect(page.getByText(`Ajuste ${number} · Rotura`).first()).toBeVisible();
});

test('«Ajustar a cero» desde Inventario pide sacar todo el saldo; el Administrador rechaza otro', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await login(page, USERS.inventario);
  const before = await stockOf(page, 'Cadena Rolo');
  expect(before).toBeGreaterThan(0);

  // Atajo desde la fila del inventario: abre la solicitud con la salida total ya escrita
  await page.getByRole('link', { name: /^Ajustar a cero SKU-/ }).click();
  await expect(page).toHaveURL(/\/inventario\/ajustes\/nuevo\?sku=SKU-\d{6}&cero=1$/);
  const line = page.getByRole('row', { name: /Cadena Rolo/ });
  await expect(line.getByLabel(/^Diferencia de SKU-/)).toHaveValue(String(-before));
  await expect(line).toContainText('0'); // «Quedaría» 0

  // «Otro» exige observación
  await pickReason(page, 'Otro');
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'exige una observación' })).toBeVisible();
  await pickReason(page, 'Pérdida');
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page).toHaveURL(/\/inventario\/ajustes\/[0-9a-f-]{36}$/);
  const url = page.url();
  await logout(page);

  // El Administrador la rechaza (el comentario es obligatorio): el stock no cambia
  await login(page, USERS.admin);
  await page.goto(url);
  await page.getByRole('button', { name: 'Rechazar ajuste' }).click();
  await page.getByLabel('Motivo del rechazo').fill('Primero verifique el estante');
  await page.getByRole('button', { name: 'Confirmar rechazo' }).click();
  await expect(page.getByRole('heading', { name: /Ajuste AJ-\d{6}/ })).toContainText('Rechazado');
  await expect(page.getByText(/Primero verifique el estante/)).toBeVisible();
  expect(await stockOf(page, 'Cadena Rolo')).toBe(before);

  // Una nueva solicitud igual sí se aprueba: la pieza queda sin stock
  await page.goto('/inventario');
  await page.getByLabel('Buscar por producto, SKU o código').fill('Cadena Rolo');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('link', { name: /^Ajustar a cero SKU-/ }).click();
  await pickReason(page, 'Pérdida');
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page).toHaveURL(/\/inventario\/ajustes\/[0-9a-f-]{36}$/);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Aprobar ajuste' }).click(); // el Administrador aprueba lo suyo
  await expect(page.getByRole('heading', { name: /Ajuste AJ-\d{6}/ })).toContainText('Aprobado');
  expect(await stockOf(page, 'Cadena Rolo')).toBe(0);
  await expect(page.getByRole('row', { name: /Cadena Rolo/ })).toContainText('Sin stock');
});

test('el vendedor no ve ni usa los ajustes, ni por la web ni por la API', async ({ page }) => {
  await login(page, USERS.vendedor);
  await expect(menu(page).getByRole('link', { name: 'Ajustes' })).toHaveCount(0);
  await expect(menu(page).getByText('Ajustes')).toHaveCount(0);
  for (const route of ['/inventario/ajustes', '/inventario/ajustes/nuevo']) {
    await page.goto(route);
    await expect(page.getByText('No tiene permiso para ver esta sección.')).toBeVisible();
  }
  // Tampoco ve el atajo en el inventario
  await page.goto('/inventario');
  await expect(page.getByRole('link', { name: /^Ajustar a cero/ })).toHaveCount(0);
  expect((await page.request.get('/api/v1/inventory/adjustments')).status()).toBe(403);
  expect((await page.request.get('/api/v1/inventory/adjustments/pending-count')).status()).toBe(
    403,
  );
  expect((await page.request.post('/api/v1/inventory/adjustments', { data: {} })).status()).toBe(
    403,
  );
});
