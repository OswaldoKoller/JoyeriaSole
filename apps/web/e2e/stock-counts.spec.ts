import { expect, test, type Page } from '@playwright/test';

/**
 * Conteo físico a ciegas con segundo recuento (ADR-021), recorrido completo con el lector simulado
 * (teclear el código + Enter): crear → iniciar → capturar → cerrar → recontar → revisar → aprobar,
 * con tres usuarios (Responsable, Administrador y Vendedor). Usa los datos DEMO de «DEMO Aretes»
 * (nadie más los cuenta) y modifica su stock, por lo que corre después de dashboard/responsive
 * (orden alfabético, workers: 1).
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

interface StockRow {
  sku: string;
  productName: string;
  quantity: number;
}

/** Saldos actuales por la API (con la sesión del navegador). */
async function stockOf(page: Page, term: string): Promise<StockRow[]> {
  const response = await page.request.get(
    `/api/v1/inventory?q=${encodeURIComponent(term)}&pageSize=100&level=all`,
  );
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { data: StockRow[] };
  return body.data.sort((a, b) => a.sku.localeCompare(b.sku));
}

/** El lector de códigos es un teclado: texto + Enter. Espera a que la lectura quede guardada. */
async function readCode(page: Page, code: string) {
  const input = page.getByLabel('Código de la pieza');
  await input.fill(code);
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/scan') && response.request().method() === 'POST',
    ),
    input.press('Enter'),
  ]);
}

async function setQuantity(page: Page, sku: string, quantity: number) {
  const field = page.getByLabel(`Cantidad contada de ${sku}`);
  if ((await field.inputValue()) === String(quantity)) return; // ya tiene ese valor
  await field.fill(String(quantity));
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/items/') && response.request().method() === 'PUT',
    ),
    field.press('Enter'),
  ]);
}

async function closeRound(page: Page, button: 'Cerrar conteo' | 'Cerrar recuento') {
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: button }).click();
}

test('conteo a ciegas completo: captura, recuento, revisión y aprobación por usuarios distintos', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await login(page, USERS.inventario);
  const aretes = await stockOf(page, 'DEMO Arete');
  expect(aretes.length).toBe(5);
  // Roles según el saldo: cuatro con piezas (a, b, c, d) y una sin stock (e)
  const withStock = aretes.filter((item) => item.quantity > 0);
  const [a, b, c, d] = withStock;
  const e = aretes.find((item) => item.quantity === 0);
  if (!a || !b || !c || !d || !e) throw new Error('Faltan los datos DEMO de Aretes');
  const stranger = (await stockOf(page, 'DEMO Collar'))[0];
  if (!stranger) throw new Error('Faltan los datos DEMO de Collares');
  const categories = (await (await page.request.get('/api/v1/categories')).json()) as {
    data: { id: string; name: string }[];
  };
  const aretesCategory = categories.data.find((category) => category.name === 'DEMO Aretes');
  if (!aretesCategory) throw new Error('Falta la categoría DEMO Aretes');

  // Primer conteo: a correcto, b falta 1, c sobran 2, d se lee y se deshace (queda en 0), e sin stock
  const first = new Map<string, number>([
    [a.sku, a.quantity],
    [b.sku, b.quantity - 1],
    [c.sku, c.quantity + 2],
  ]);

  // 1) Crear el conteo desde el menú, eligiendo la categoría
  await menu(page).getByRole('link', { name: 'Conteo físico' }).click();
  await expect(page).toHaveURL(/\/inventario\/conteos$/);
  await expect(page.getByRole('heading', { name: 'Conteos físicos' })).toBeVisible();
  // Los conteos DEMO ya están en la lista
  await expect(page.getByRole('row').filter({ hasText: 'DEMO Collares' })).toBeVisible();
  await page.getByLabel('Categoría a contar').selectOption({ label: 'DEMO Aretes' });
  await page.getByRole('button', { name: 'Crear conteo' }).click();
  await expect(page).toHaveURL(/\/inventario\/conteos\/[0-9a-f-]{36}$/);
  const countUrl = page.url();
  const countId = countUrl.split('/').pop() ?? '';
  const heading = page.getByRole('heading', { name: /Conteo CNT-\d{6}/ });
  await expect(heading).toContainText('Borrador');
  const number = /CNT-\d{6}/.exec(await heading.innerText())?.[0];
  if (!number) throw new Error('No se leyó el número del conteo');

  // Otro conteo de la misma categoría se rechaza (no pueden compartir variantes)
  expect(
    (
      await page.request.post('/api/v1/inventory/counts', {
        data: { categoryId: aretesCategory.id },
      })
    ).status(),
  ).toBe(409);

  await page.getByRole('button', { name: 'Iniciar conteo' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Conteo ${number}`) })).toContainText(
    'En captura',
  );

  // 2) Captura a ciegas con el lector simulado
  await expect(page.getByLabel('Código de la pieza')).toBeFocused();
  await readCode(page, a.sku);
  await expect(page.getByRole('status').filter({ hasText: 'Última lectura' })).toContainText(
    `${a.sku} ·`,
  );
  await expect(page.getByLabel('Código de la pieza')).toBeFocused(); // sigue listo para la próxima
  await readCode(page, a.sku.toLowerCase()); // el SKU no distingue mayúsculas
  await readCode(page, b.sku);
  await readCode(page, c.sku);
  // Se lee d por error y se deshace: queda sin lecturas
  await readCode(page, d.sku);
  await page.getByRole('button', { name: 'Deshacer última lectura' }).click();
  await expect(page.getByText(/Se deshizo la última lectura/)).toBeVisible();
  // Hallazgos: código inexistente y pieza de otra categoría
  await readCode(page, 'NOEXISTE-123');
  await expect(
    page.getByRole('status').filter({ hasText: 'no existe en el sistema' }),
  ).toBeVisible();
  await readCode(page, stranger.sku);
  await expect(
    page.getByRole('status').filter({ hasText: 'pertenece a otra categoría' }),
  ).toBeVisible();
  await page.getByLabel('Nota sobre NOEXISTE-123').fill('Estaba en la vitrina');
  await page.getByLabel('Nota sobre NOEXISTE-123').blur();
  // Cantidades finales de la ronda: a mano para no teclear decenas de lecturas
  for (const [sku, quantity] of first) await setQuantity(page, sku, quantity);

  // A ciegas: nada del sistema en pantalla ni en la API
  const blind = page.getByRole('main');
  await expect(blind).not.toContainText('Esperado');
  await expect(blind).not.toContainText('Sistema');
  await expect(blind).not.toContainText('Diferencia');
  const apiBlind = await (await page.request.get(`/api/v1/inventory/counts/${countId}`)).text();
  for (const forbidden of ['systemQty', 'expectedQty', 'difference', 'currentQty', 'finalQty']) {
    expect(apiBlind).not.toContain(forbidden);
  }
  await expect(page.getByLabel(`Cantidad contada de ${a.sku}`)).toHaveValue(String(a.quantity));
  await expect(page.getByLabel(`Cantidad contada de ${d.sku}`)).toHaveCount(0); // sin lecturas: no aparece

  // 3) Cerrar el primer conteo: hay diferencias → segundo recuento obligatorio
  await closeRound(page, 'Cerrar conteo');
  await expect(page.getByRole('heading', { name: /Segundo recuento CNT-\d{6}/ })).toBeVisible();
  const recountRows = [b, c, d];
  await expect(page.getByRole('heading', { name: 'Piezas a recontar' })).toBeVisible();
  for (const row of recountRows) {
    await expect(page.getByLabel(`Cantidad contada de ${row.sku}`)).toHaveValue('0');
  }
  await expect(page.getByLabel(`Cantidad contada de ${a.sku}`)).toHaveCount(0); // sin diferencia: no se recuenta
  await expect(page.getByLabel(`Cantidad contada de ${e.sku}`)).toHaveCount(0);
  await logout(page);

  // 4) Otro usuario (Administrador) no captura a la vez: debe tomar el conteo
  await login(page, USERS.admin);
  await page.goto(countUrl);
  await expect(page.getByText(/lo está capturando/)).toBeVisible();
  await expect(page.getByLabel('Código de la pieza')).toHaveCount(0);
  expect(
    (
      await page.request.post(`/api/v1/inventory/counts/${countId}/scan`, { data: { code: b.sku } })
    ).status(),
  ).toBe(403);
  await page.getByRole('button', { name: 'Tomar el conteo' }).click();
  await expect(page.getByLabel('Código de la pieza')).toBeVisible();

  // 5) Segundo recuento (a ciegas): b vuelve a su saldo, c confirma el sobrante, d confirma 0
  await setQuantity(page, b.sku, b.quantity);
  await readCode(page, c.sku);
  await readCode(page, c.sku);
  await setQuantity(page, c.sku, c.quantity + 2);
  await expect(page.getByLabel(`Cantidad contada de ${d.sku}`)).toHaveValue('0');
  await closeRound(page, 'Cerrar recuento');

  // 6) Revisión: aquí sí aparecen el sistema, lo esperado y las diferencias
  await expect(
    page.getByRole('heading', { name: new RegExp(`Revisión del conteo ${number}`) }),
  ).toContainText('En revisión');
  const row = (sku: string) => page.getByRole('row').filter({ hasText: sku });
  await expect(row(a.sku)).toContainText(String(a.quantity));
  await expect(row(c.sku)).toContainText('+2');
  await expect(row(d.sku)).toContainText(`-${d.quantity}`);
  await expect(page.getByRole('columnheader', { name: 'Recuento' })).toBeVisible();
  // Hallazgos visibles, sin tocar el stock
  await expect(page.getByText('Código desconocido: NOEXISTE-123')).toBeVisible();
  await expect(page.getByText('Nota del operador: Estaba en la vitrina')).toBeVisible();
  const expectedStock = new Map<string, number>([
    [a.sku, a.quantity],
    [b.sku, b.quantity],
    [c.sku, c.quantity + 2],
    [d.sku, 0],
    [e.sku, 0],
  ]);
  // El stock todavía no cambió
  for (const entry of await stockOf(page, 'DEMO Arete')) {
    const original = aretes.find((item) => item.sku === entry.sku);
    expect(entry.quantity).toBe(original?.quantity);
  }
  await logout(page);

  // 7) El Vendedor no puede aprobar ni ver los conteos (web y API)
  await login(page, USERS.vendedor);
  await expect(menu(page).getByText('Conteo físico')).toHaveCount(0);
  await page.goto('/inventario/conteos');
  await expect(page.getByText('No tiene permiso para ver esta sección.')).toBeVisible();
  expect((await page.request.post(`/api/v1/inventory/counts/${countId}/approve`)).status()).toBe(
    403,
  );
  expect((await page.request.get('/api/v1/inventory/counts')).status()).toBe(403);
  await logout(page);

  // 8) El Responsable aprueba: el stock y el historial reflejan los ajustes
  await login(page, USERS.inventario);
  await page.goto(countUrl);
  await page.getByRole('button', { name: 'Marcar NOEXISTE-123 como regularizado' }).click();
  await page.getByLabel('Nota de regularización de NOEXISTE-123').fill('Se dio de alta aparte');
  await page.getByRole('button', { name: 'Confirmar regularización' }).click();
  await expect(page.getByText(/Regularizado por/)).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Aprobar conteo' }).click();
  await expect(page.getByRole('heading', { name: /Revisión del conteo/ })).toContainText(
    'Aprobado',
  );
  await expect(page.getByRole('status').filter({ hasText: 'Aprobado por' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aprobar conteo' })).toHaveCount(0);

  for (const entry of await stockOf(page, 'DEMO Arete')) {
    expect(entry.quantity, entry.sku).toBe(expectedStock.get(entry.sku));
  }
  // Una segunda aprobación (por la API) no duplica nada
  expect((await page.request.post(`/api/v1/inventory/counts/${countId}/approve`)).status()).toBe(
    422,
  );

  await page.goto('/inventario/movimientos');
  await expect(page.getByText(`Conteo ${number}`).first()).toBeVisible();
  // Solo se ajustaron las variantes con diferencia real: c (+2) y d (a cero)
  const movements = await (
    await page.request.get('/api/v1/inventory/movements?pageSize=100')
  ).json();
  const adjustments = (movements.data as { type: string; reason: string | null }[]).filter(
    (movement) => movement.type === 'COUNT_ADJUSTMENT' && movement.reason === `Conteo ${number}`,
  );
  expect(adjustments).toHaveLength(2);
});

test('el Vendedor no ve los conteos y los datos DEMO incluyen un conteo cerrado y uno en captura', async ({
  page,
}) => {
  await login(page, USERS.admin);
  await page.goto('/inventario/conteos');
  const closed = page.getByRole('row').filter({ hasText: 'DEMO Pulseras' });
  await expect(closed).toContainText('Aprobado');
  const open = page.getByRole('row').filter({ hasText: 'DEMO Collares' });
  await expect(open).toContainText('En captura');
  // El conteo en captura está a ciegas también para el Administrador
  await open.getByRole('link', { name: /Abrir conteo CNT-/ }).click();
  await expect(page.getByRole('heading', { name: /Conteo CNT-\d{6}/ })).toContainText('En captura');
  await expect(page.getByRole('main')).not.toContainText('Esperado');
});
