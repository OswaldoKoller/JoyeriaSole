import { expect, test, type Page } from '@playwright/test';

/**
 * Ingreso de mercadería (roadmap, orden 2): borrador → ítems → reparto de costos → confirmación.
 * Usa los datos DEMO. Corre después de dashboard/responsive (orden alfabético), que dependen de
 * los totales originales del seed, y antes de suppliers/users, que no dependen del stock.
 */
const PASSWORD = process.env.DEMO_USER_PASSWORD ?? '';
test.skip(!PASSWORD, 'Definir DEMO_USER_PASSWORD (npm run qa lo genera)');

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
}

const SUPPLIER = 'DEMO Proveedor de ingresos';

async function ensureSupplier(page: Page) {
  const created = await page.request.post('/api/v1/suppliers', {
    data: { name: SUPPLIER, taxId: 'ING-E2E-1' },
  });
  expect([201, 409]).toContain(created.status());
}

async function addVariant(page: Page, term: string) {
  await page.getByLabel('Agregar variante por SKU, código de barras o nombre').fill(term);
  await page.getByRole('button', { name: 'Buscar variante' }).click();
  await page.getByRole('button', { name: /^Agregar SKU-/ }).click();
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

test('crea un borrador, reparte los costos, confirma y el stock sube', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, 'demo-inventario@example.invalid');
  await ensureSupplier(page);
  const riviera = await stockOf(page, 'Riviera');
  const tenis = await stockOf(page, 'Tenis');

  // 1) Borrador con proveedor, documento y costos adicionales
  await page.goto('/ingresos');
  await page.getByRole('link', { name: 'Nuevo ingreso' }).click();
  await page.getByLabel('Proveedor', { exact: true }).selectOption({ label: SUPPLIER });
  await page.getByLabel('Tipo de documento').fill('Factura');
  await page.getByLabel('Número de documento').fill('F-E2E-1');
  await page.getByLabel('Transporte').fill('10');
  await page.getByLabel('Embolsado').fill('0.5');
  await page.getByLabel('Valores extras').fill('0.5');
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page).toHaveURL(/\/ingresos\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: /Ingreso ING-\d{6}/ })).toContainText('Borrador');

  // 2) Ítems: 10 × Bs 10 y 5 × Bs 20 (valores iguales: cada línea absorbe 5,50)
  await addVariant(page, 'Riviera');
  const rivieraRow = page.getByRole('row', { name: /Riviera/ });
  await rivieraRow.getByLabel(/Cantidad recibida/).fill('10');
  await rivieraRow.getByLabel(/Costo unitario/).fill('10');
  await addVariant(page, 'Tenis');
  const tenisRow = page.getByRole('row', { name: /Tenis/ });
  await tenisRow.getByLabel(/Cantidad recibida/).fill('5');
  await tenisRow.getByLabel(/Cantidad esperada/).fill('6');
  await tenisRow.getByLabel(/Costo unitario/).fill('20');

  // Vista previa inmediata con el mismo algoritmo que la API.
  const totals = page.getByRole('term').filter({ hasText: 'Total del ingreso' });
  await expect(totals).toBeVisible();
  await expect(page.getByLabel('Totales del ingreso')).toContainText(/211[,.]00/);
  await expect(rivieraRow).toContainText(/10[,.]55/);
  await expect(tenisRow).toContainText(/21[,.]10/);
  await expect(tenisRow).toContainText('-1'); // diferencia: recibidas 5 de 6 esperadas

  // 3) No se puede confirmar con cambios sin guardar
  await expect(page.getByRole('button', { name: 'Confirmar ingreso' })).toBeDisabled();
  await expect(page.getByText('Guarde los ítems antes de confirmar.')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar ítems' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar ingreso' })).toBeEnabled();

  // El borrador todavía no cambió el stock.
  expect(await stockOf(page, 'Riviera')).toBe(riviera);
  await page.goBack();

  // 4) Confirmación
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Confirmar ingreso' }).click();
  await expect(page.getByRole('heading', { name: /Ingreso ING-\d{6}/ })).toContainText(
    'Confirmado',
  );
  await expect(page.getByRole('status').filter({ hasText: 'Confirmado por' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar ingreso' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guardar ítems' })).toHaveCount(0);
  await expect(page.getByLabel('Totales del ingreso')).toContainText(/211[,.]00/);

  // 5) El stock subió exactamente lo recibido y el movimiento quedó en el historial
  expect(await stockOf(page, 'Riviera')).toBe(riviera + 10);
  expect(await stockOf(page, 'Tenis')).toBe(tenis + 5);
  await page.goto('/inventario/movimientos');
  await expect(page.getByText(/Ingreso ING-\d{6}/).first()).toBeVisible();

  // 6) Aparece en la lista como confirmado
  await page.goto('/ingresos');
  await page.getByLabel('Buscar por número o documento').fill('F-E2E-1');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByRole('row', { name: /F-E2E-1/ })).toContainText('Confirmado');
});

test('con costos adicionales y valor de compra cero no se puede confirmar', async ({ page }) => {
  await login(page, 'demo-inventario@example.invalid');
  await ensureSupplier(page);
  await page.goto('/ingresos/nuevo');
  await page.getByLabel('Proveedor', { exact: true }).selectOption({ label: SUPPLIER });
  await page.getByLabel('Transporte').fill('5');
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page).toHaveURL(/\/ingresos\/[0-9a-f-]{36}$/);

  await addVariant(page, 'Riviera');
  // El costo queda en 0 (valor por defecto): no hay base para repartir el transporte.
  await page.getByRole('button', { name: 'Guardar ítems' }).click();
  // Guardado completo = sin cambios pendientes: el botón vuelve a quedar deshabilitado.
  await expect(page.getByRole('button', { name: 'Guardar ítems' })).toBeDisabled();
  await expect(page.getByText(/valor de compra es cero/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar ingreso' })).toBeDisabled();

  // Con un costo mayor que cero ya se puede.
  await page.getByLabel(/Costo unitario/).fill('3');
  await page.getByRole('button', { name: 'Guardar ítems' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar ingreso' })).toBeEnabled();

  // Y un borrador se puede cancelar sin tocar el stock.
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Cancelar borrador' }).click();
  await expect(page).toHaveURL(/\/ingresos$/);
});

test('el vendedor no accede a los ingresos, ni por la web ni por la API', async ({ page }) => {
  await login(page, 'demo-vendedor@example.invalid');
  await expect(
    page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', {
      name: 'Ingresos de mercadería',
    }),
  ).toHaveCount(0);
  await page.goto('/ingresos');
  await expect(page.getByText('No tiene permiso para ver esta sección.')).toBeVisible();
  expect((await page.request.get('/api/v1/stock-entries')).status()).toBe(403);
  expect((await page.request.post('/api/v1/stock-entries', { data: {} })).status()).toBe(403);
});
