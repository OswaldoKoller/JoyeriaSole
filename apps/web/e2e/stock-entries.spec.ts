import { expect, test, type Page } from '@playwright/test';

/**
 * Ingreso de mercadería: borrador → costos adicionales → ítems → reparto → confirmación.
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
  // La lista conserva la anterior mientras carga la búsqueda: se espera a la respuesta filtrada.
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/api/v1/inventory?') && response.url().includes('q='),
    ),
    page.getByRole('button', { name: 'Buscar' }).click(),
  ]);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
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

  // 1) Borrador con proveedor y documento (el proveedor compra en Bs por defecto)
  await page.goto('/ingresos');
  await page.getByRole('link', { name: 'Nuevo ingreso' }).click();
  await page.getByLabel('Proveedor', { exact: true }).selectOption({ label: SUPPLIER });
  await expect(page.getByLabel('Moneda', { exact: true })).toHaveValue('BOB');
  await page.getByLabel('Tipo de documento').fill('Factura');
  await page.getByLabel('Número de documento').fill('F-E2E-1');
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page).toHaveURL(/\/ingresos\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: /Ingreso ING-\d{6}/ })).toContainText('Borrador');

  // 2) Lista abierta de costos adicionales: transporte, embolsado y otro (11,00 Bs en total)
  const costs = [
    ['Transporte', '10'],
    ['Embolsado', '0.5'],
    ['Otro', '0.5'],
  ] as const;
  for (const [index, [type, amount]] of costs.entries()) {
    await page.getByRole('button', { name: 'Agregar costo' }).click();
    const group = page.getByRole('group', { name: `Costo adicional ${index + 1}` });
    await group.getByLabel('Tipo de costo').selectOption({ label: type });
    await group.getByLabel('Monto (Bs)').fill(amount);
  }
  await expect(page.getByText('Guarde los costos adicionales antes de confirmar.')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar costos' }).click();
  await expect(page.getByRole('group', { name: 'Costo adicional 3' })).toBeVisible();
  await expect(page.getByText('Guarde los costos adicionales antes de confirmar.')).toHaveCount(0);

  // 3) Ítems: 10 × Bs 10 y 5 × Bs 20 (valores iguales: cada línea absorbe 5,50)
  const items = page.getByRole('region', { name: 'Ítems recibidos' });
  const panel = page.getByRole('region', { name: 'Panel de costos' });
  await addVariant(page, 'Riviera');
  const rivieraRow = items.getByRole('row', { name: /Riviera/ });
  await rivieraRow.getByLabel(/Cantidad recibida/).fill('10');
  await rivieraRow.getByLabel(/Precio de compra de/).fill('10');
  await addVariant(page, 'Tenis');
  const tenisRow = items.getByRole('row', { name: /Tenis/ });
  await tenisRow.getByLabel(/Cantidad recibida/).fill('5');
  await tenisRow.getByLabel(/Cantidad esperada/).fill('6');
  await tenisRow.getByLabel(/Precio de compra de/).fill('20');
  await expect(tenisRow).toContainText('-1'); // diferencia: recibidas 5 de 6 esperadas

  // Vista previa inmediata con el mismo algoritmo que la API.
  await expect(panel.getByLabel('Totales del ingreso')).toContainText(/211[,.]00/);
  await expect(panel.getByRole('row', { name: /Riviera/ })).toContainText(/10[,.]55/);
  await expect(panel.getByRole('row', { name: /Tenis/ })).toContainText(/21[,.]10/);

  // 4) La diferencia exige una justificación y no se confirma con cambios sin guardar
  await expect(page.getByRole('button', { name: 'Confirmar ingreso' })).toBeDisabled();
  await expect(page.getByText('Guarde los ítems antes de confirmar.')).toBeVisible();
  await expect(
    page.getByText(/Justifique la diferencia de SKU-\d+ para poder confirmar/),
  ).toBeVisible();
  await tenisRow.getByLabel(/Justificación de la diferencia/).fill('Faltó una pieza en la caja');
  await page.getByRole('button', { name: 'Guardar ítems' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar ingreso' })).toBeEnabled();

  // El borrador todavía no cambió el stock.
  expect(await stockOf(page, 'Riviera')).toBe(riviera);
  await page.goBack();

  // 5) Confirmación
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Confirmar ingreso' }).click();
  await expect(page.getByRole('heading', { name: /Ingreso ING-\d{6}/ })).toContainText(
    'Confirmado',
  );
  await expect(page.getByRole('status').filter({ hasText: 'Confirmado por' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar ingreso' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guardar ítems' })).toHaveCount(0);
  await expect(page.getByLabel('Totales del ingreso')).toContainText(/211[,.]00/);

  // 6) El stock subió exactamente lo recibido y el movimiento quedó en el historial
  expect(await stockOf(page, 'Riviera')).toBe(riviera + 10);
  expect(await stockOf(page, 'Tenis')).toBe(tenis + 5);
  await page.goto('/inventario/movimientos');
  await expect(page.getByText(/Ingreso ING-\d{6}/).first()).toBeVisible();

  // 7) Aparece en la lista como confirmado
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
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page).toHaveURL(/\/ingresos\/[0-9a-f-]{36}$/);

  await page.getByRole('button', { name: 'Agregar costo' }).click();
  const cost = page.getByRole('group', { name: 'Costo adicional 1' });
  await cost.getByLabel('Tipo de costo').selectOption({ label: 'Transporte' });
  await cost.getByLabel('Monto (Bs)').fill('5');
  await page.getByRole('button', { name: 'Guardar costos' }).click();
  await expect(page.getByText('Guarde los costos adicionales antes de confirmar.')).toHaveCount(0);

  await addVariant(page, 'Riviera');
  // El precio queda en 0 (valor por defecto): no hay base para repartir el transporte.
  await page.getByRole('button', { name: 'Guardar ítems' }).click();
  // Guardado completo = sin cambios pendientes: el botón vuelve a quedar deshabilitado.
  await expect(page.getByRole('button', { name: 'Guardar ítems' })).toBeDisabled();
  await expect(page.getByText(/valor de compra es cero/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar ingreso' })).toBeDisabled();

  // Con un precio mayor que cero ya se puede.
  await page.getByLabel(/Precio de compra de/).fill('3');
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
  // Tampoco ve costos en el catálogo ni en el historial de costos.
  const products = await page.request.get('/api/v1/products?q=Riviera');
  expect(products.status()).toBe(200);
  expect(await products.text()).not.toMatch(/costPrice|unitCost/);
  const variantId = ((await products.json()) as { data: { variants: { id: string }[] }[] }).data[0]
    ?.variants[0]?.id;
  expect(
    (await page.request.get(`/api/v1/products/variants/${variantId}/cost-history`)).status(),
  ).toBe(403);
});
