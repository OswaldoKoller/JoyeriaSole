import { expect, test, type Page } from '@playwright/test';

/**
 * Flujo de importación (S5): proveedor del exterior → ingreso en USD con tipo de cambio →
 * costos de aduanización y comisiones → alta rápida de una pieza nueva → vista previa →
 * confirmar → stock y costos correctos → historial de costos. Más: tipos de costo (solo el
 * Administrador), código de proveedor repetido y entregas parciales con el mismo comprobante.
 * Los tests de este archivo son dependientes entre sí y corren en orden.
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

const SUPPLIER = 'DEMO Proveedor Exterior E2E';
const NEW_PIECE = 'E2E Anillo importado';
const NEW_PIECE_CODE = 'CN-E2E-001';
const DOCUMENT = 'IMP-E2E-1';

const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

async function ensureForeignSupplier(page: Page) {
  const created = await page.request.post('/api/v1/suppliers', {
    data: {
      name: SUPPLIER,
      type: 'FOREIGN',
      country: 'China',
      defaultCurrency: 'USD',
      taxId: 'IMP-E2E-TAX',
    },
  });
  expect([201, 409]).toContain(created.status());
}

async function addVariant(page: Page, term: string) {
  await page.getByLabel('Agregar variante por SKU, código de barras o nombre').fill(term);
  await page.getByRole('button', { name: 'Buscar variante' }).click();
  await page.getByRole('button', { name: /^Agregar SKU-/ }).click();
}

async function stockOf(page: Page, name: string) {
  await page.goto('/inventario');
  await page.getByLabel('Buscar por producto, SKU o código').fill(name);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  return Number(await row.getByRole('cell').nth(2).innerText());
}

async function quickCreate(
  page: Page,
  piece: { name: string; code?: string; quantity: string; price: string },
) {
  const form = page.getByRole('form', { name: 'Alta rápida de pieza nueva' });
  if (!(await form.isVisible())) {
    await page.getByRole('button', { name: 'Alta rápida de pieza nueva' }).click();
  }
  await form.getByLabel('Categoría de la pieza nueva').selectOption({ label: 'DEMO Anillos' });
  await form.getByLabel('Nombre de la pieza nueva').fill(piece.name);
  await form.getByLabel('Código del proveedor (opcional)').fill(piece.code ?? '');
  await form.getByLabel('Cantidad recibida de la pieza nueva').fill(piece.quantity);
  await form.getByLabel(/Precio de compra \(USD\) de la pieza nueva/).fill(piece.price);
  await form.getByRole('button', { name: 'Crear pieza y agregar al ingreso' }).click();
}

test('el Administrador agrega un tipo de costo; el Responsable no lo gestiona', async ({
  page,
}) => {
  await login(page, 'demo-admin@example.invalid');
  const menu = page.getByRole('navigation', { name: 'Navegación principal' });
  await menu.getByRole('link', { name: 'Tipos de costo' }).click();
  await expect(page.getByRole('heading', { name: 'Tipos de costo de ingreso' })).toBeVisible();
  for (const name of ['Transporte', 'Embolsado', 'Aduanización', 'Comisiones', 'Otro']) {
    await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('Del sistema');
  }
  await page.getByLabel('Nombre del nuevo tipo de costo').fill('Seguro E2E');
  await page.getByRole('button', { name: 'Agregar tipo' }).click();
  await expect(page.getByRole('row', { name: /Seguro E2E/ })).toContainText('Activo');
  await page.getByRole('button', { name: 'Desactivar Seguro E2E' }).click();
  await expect(page.getByRole('row', { name: /Seguro E2E/ })).toContainText('Inactivo');
  await page.getByRole('button', { name: 'Activar Seguro E2E' }).click();
  await expect(page.getByRole('row', { name: /Seguro E2E/ })).toContainText('Activo');

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, 'demo-inventario@example.invalid');
  await expect(
    page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Tipos de costo' }),
  ).toHaveCount(0);
  await page.goto('/configuracion/tipos-de-costo');
  await expect(page.getByText('No tiene permiso para ver esta sección.')).toBeVisible();
  expect(
    (
      await page.request.post('/api/v1/stock-entry-cost-types', { data: { name: 'Intruso' } })
    ).status(),
  ).toBe(403);
});

test('importación: ingreso en USD con aduanización, comisiones y pieza nueva', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, 'demo-inventario@example.invalid');
  await ensureForeignSupplier(page);
  const alianza = await stockOf(page, 'Alianza Lisa');

  // 1) Cabecera: el proveedor del exterior sugiere dólares; se indica el tipo de cambio
  await page.goto('/ingresos/nuevo');
  await page.getByLabel('Proveedor', { exact: true }).selectOption({ label: SUPPLIER });
  await expect(page.getByLabel('Moneda', { exact: true })).toHaveValue('USD');
  await expect(page.getByText(/Moneda habitual del proveedor: Dólares/)).toBeVisible();
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page.getByRole('alert')).toContainText(/Tipo de cambio/);
  await page.getByLabel('Tipo de cambio (Bs por USD)').fill('6.96');
  await page.getByLabel('Tipo de documento').fill('Factura de importación');
  await page.getByLabel('Número de documento').fill(DOCUMENT);
  await page.getByLabel('Fecha del documento').fill(today());
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page).toHaveURL(/\/ingresos\/[0-9a-f-]{36}$/);
  const entryUrl = page.url();

  // 2) Costos adicionales: aduanización y comisiones (monto en Bs, con nota)
  await page.getByRole('button', { name: 'Agregar costo' }).click();
  const customs = page.getByRole('group', { name: 'Costo adicional 1' });
  await customs.getByLabel('Tipo de costo').selectOption({ label: 'Aduanización' });
  await customs.getByLabel('Monto (Bs)').fill('100');
  await customs.getByLabel('Nota (opcional)').fill('DUI 4521');
  await page.getByRole('button', { name: 'Agregar costo' }).click();
  const commissions = page.getByRole('group', { name: 'Costo adicional 2' });
  await commissions.getByLabel('Tipo de costo').selectOption({ label: 'Comisiones' });
  await commissions.getByLabel('Monto (Bs)').fill('20.5');
  await page.getByRole('button', { name: 'Guardar costos' }).click();
  await expect(page.getByText('Guarde los costos adicionales antes de confirmar.')).toHaveCount(0);
  await expect(page.locator('p').filter({ hasText: 'Total de costos adicionales' })).toContainText(
    /120[,.]50/,
  );

  // 3) Una pieza que ya existe: 10 × USD 5
  const items = page.getByRole('region', { name: 'Ítems recibidos' });
  await addVariant(page, 'Alianza Lisa');
  const existing = items.getByRole('row', { name: /Alianza Lisa/ });
  await existing.getByLabel(/Cantidad recibida/).fill('10');
  await existing.getByLabel(/Precio de compra de/).fill('5');
  await expect(items.getByRole('columnheader', { name: 'Precio de compra (USD)' })).toBeVisible();

  // El alta rápida pide guardar antes los ítems pendientes
  await page.getByRole('button', { name: 'Alta rápida de pieza nueva' }).click();
  await expect(page.getByText(/Guarde los ítems y los costos antes de dar de alta/)).toBeVisible();
  await page.getByRole('button', { name: 'Guardar ítems' }).click();
  await expect(page.getByRole('button', { name: 'Guardar ítems' })).toBeDisabled();

  // 4) Alta rápida de pieza nueva: 4 × USD 12,5 con código del proveedor
  await quickCreate(page, {
    name: NEW_PIECE,
    code: NEW_PIECE_CODE,
    quantity: '4',
    price: '12.5',
  });
  const created = page.getByRole('status').filter({ hasText: /Pieza creada con el SKU/ });
  await expect(created).toBeVisible();
  await expect(created).toContainText(/SKU-\d{6}/);
  await expect(created).not.toContainText('Aviso');
  const newRow = items.getByRole('row', { name: new RegExp(NEW_PIECE) });
  await expect(newRow).toContainText('Ficha incompleta');

  // 5) Vista previa: valores en USD y en Bs, costos asignados y costo unitario total
  const panel = page.getByRole('region', { name: 'Panel de costos' });
  const totals = panel.getByLabel('Totales del ingreso');
  await expect(totals).toContainText(/100[,.]00/); // compra en USD
  await expect(totals).toContainText(/696[,.]00/); // compra en Bs
  await expect(totals).toContainText(/120[,.]50/); // costos adicionales
  await expect(totals).toContainText(/816[,.]50/); // total
  const alianzaCost = panel.getByRole('row', { name: /Alianza Lisa/ });
  await expect(alianzaCost).toContainText(/34[,.]80/); // 5 USD × 6,96
  await expect(alianzaCost).toContainText(/60[,.]25/); // costos adicionales asignados
  await expect(alianzaCost).toContainText(/408[,.]25/); // costo total del ítem
  await expect(alianzaCost).toContainText(/40[,.]825/); // costo unitario total
  const newCost = panel.getByRole('row', { name: new RegExp(NEW_PIECE) });
  await expect(newCost).toContainText(/87[,.]00/); // 12,5 USD × 6,96
  await expect(newCost).toContainText(/102[,.]0625/);

  // 6) Confirmación
  await expect(page.getByRole('button', { name: 'Confirmar ingreso' })).toBeEnabled();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Confirmar ingreso' }).click();
  await expect(page.getByRole('heading', { name: /Ingreso ING-\d{6}/ })).toContainText(
    'Confirmado',
  );
  await expect(page.getByLabel('Totales del ingreso')).toContainText(/816[,.]50/);
  await expect(page.getByRole('button', { name: 'Agregar costo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Alta rápida de pieza nueva' })).toHaveCount(0);

  // 7) Stock correcto: lo existente subió 10 y la pieza nueva entró con 4
  expect(await stockOf(page, 'Alianza Lisa')).toBe(alianza + 10);
  expect(await stockOf(page, NEW_PIECE)).toBe(4);

  // 8) Historial de costos en la ficha de la pieza nueva y marca de ficha incompleta
  await page.goto('/productos');
  await page.getByLabel('Buscar por nombre, SKU o código de barras').fill(NEW_PIECE);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const card = page.getByRole('article').filter({ hasText: NEW_PIECE });
  await expect(card).toContainText('Ficha incompleta');
  await expect(card).toContainText(NEW_PIECE_CODE); // el código del proveedor quedó como código de barras
  await expect(card).toContainText('Sin precio');
  await card.getByRole('button', { name: /^Ver historial de costos de SKU-/ }).click();
  const history = card.getByRole('region', { name: /^Historial de costos de SKU-/ });
  await expect(history).toContainText(SUPPLIER);
  await expect(history).toContainText(/102[,.]0625/);
  await expect(history).toContainText(/6\.9600/);
  await card.getByRole('button', { name: /como completa/ }).click();
  await expect(card).not.toContainText('Ficha incompleta');

  // 9) Entrega parcial: otro ingreso con el mismo comprobante muestra el anterior
  const second = await page.request.post('/api/v1/stock-entries', {
    data: {
      supplierId: (
        (await (await page.request.get('/api/v1/suppliers?q=IMP-E2E-TAX')).json()) as {
          data: { id: string }[];
        }
      ).data[0]?.id,
      documentNumber: DOCUMENT,
      currency: 'USD',
      exchangeRate: '7',
    },
  });
  expect(second.status()).toBe(201);
  const secondId = ((await second.json()) as { data: { id: string } }).data.id;
  await page.goto(`/ingresos/${secondId}`);
  const related = page.getByRole('region', { name: 'Otros ingresos con el mismo comprobante' });
  await expect(related).toContainText(DOCUMENT);
  await expect(related.getByRole('link', { name: /ING-\d{6}/ })).toBeVisible();
  // Y el primero quedó inmutable.
  await page.goto(entryUrl);
  await expect(page.getByRole('button', { name: 'Confirmar ingreso' })).toHaveCount(0);
});

test('un código de proveedor repetido avisa y no se guarda como código de barras', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await login(page, 'demo-inventario@example.invalid');
  const suppliers = await page.request.get('/api/v1/suppliers?q=IMP-E2E-TAX');
  const supplierId = ((await suppliers.json()) as { data: { id: string }[] }).data[0]?.id;
  const draft = await page.request.post('/api/v1/stock-entries', {
    data: { supplierId, currency: 'USD', exchangeRate: '7', documentNumber: 'IMP-E2E-2' },
  });
  expect(draft.status()).toBe(201);
  const draftId = ((await draft.json()) as { data: { id: string } }).data.id;

  await page.goto(`/ingresos/${draftId}`);
  await quickCreate(page, {
    name: 'E2E Anillo repetido',
    code: NEW_PIECE_CODE,
    quantity: '2',
    price: '1',
  });
  const created = page.getByRole('status').filter({ hasText: /Pieza creada con el SKU/ });
  await expect(created).toContainText(/Aviso: .*no se guardó como código de barras/);
  await expect(created).toContainText(/Aviso: .*otra pieza de este proveedor/);

  await page.goto('/productos');
  await page.getByLabel('Buscar por nombre, SKU o código de barras').fill('E2E Anillo repetido');
  await page.getByRole('button', { name: 'Buscar' }).click();
  const card = page.getByRole('article').filter({ hasText: 'E2E Anillo repetido' });
  await expect(card).toContainText('Sin código');
});
