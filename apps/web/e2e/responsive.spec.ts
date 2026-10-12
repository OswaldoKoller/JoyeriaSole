import { expect, test, type Page } from '@playwright/test';

/**
 * Regresión responsive: en 5 anchos (teléfono pequeño → escritorio) ninguna pantalla debe
 *  1) desbordar la página horizontalmente, ni
 *  2) dejar controles (botones, enlaces, campos) cortados por un contenedor con scroll horizontal
 *     — el fallo que el simple «sin scroll de página» no detecta (acciones fuera de pantalla).
 */
const PASSWORD = process.env.DEMO_USER_PASSWORD ?? '';
test.skip(!PASSWORD, 'Definir DEMO_USER_PASSWORD (npm run qa lo genera)');

const WIDTHS = [320, 390, 768, 1024, 1440];
const ROUTES = [
  ['Inicio', '/'],
  ['Productos', '/productos'],
  ['Categorías', '/categorias'],
  ['Atributos', '/atributos'],
  ['Inventario', '/inventario'],
  ['Movimientos', '/inventario/movimientos'],
  ['Proveedores', '/proveedores'],
  ['Usuarios', '/usuarios'],
  ['Mi cuenta', '/mi-cuenta'],
  ['Ingresos', '/ingresos'],
  ['Nuevo ingreso', '/ingresos/nuevo'],
] as const;

/** Controles visibles de la página que quedan fuera de la pantalla o recortados por un ancestro. */
async function clippedControls(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const clipped: string[] = [];
    const selector = 'main a[href], main button, main input, main select, main textarea';
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden') continue;
      let out = rect.right > vw + 1 || rect.left < -1;
      for (let n = el.parentElement; n && n !== document.body && !out; n = n.parentElement) {
        if (getComputedStyle(n).overflowX === 'visible') continue;
        const box = n.getBoundingClientRect();
        if (rect.right > box.right + 1 || rect.left < box.left - 1) out = true;
      }
      if (out) {
        const text = (el.textContent || el.getAttribute('aria-label') || el.tagName).trim();
        clipped.push(`${text.slice(0, 40)} [${Math.round(rect.left)}→${Math.round(rect.right)}]`);
      }
    }
    return clipped;
  });
}

/** Ingreso en borrador con ítems y costos: se crea una sola vez y se reutiliza en los 5 anchos. */
let entryRoute: string | undefined;

async function prepareData(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill('demo-admin@example.invalid');
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: /Bienvenido/ })).toBeVisible();
  if (entryRoute) return;

  // Un proveedor para que su tabla tenga filas que medir.
  const created = await page.request.post('/api/v1/suppliers', {
    data: { name: 'DEMO Proveedor Responsive con un nombre bastante largo', taxId: 'RESP-001' },
  });
  expect([201, 409]).toContain(created.status());

  const suppliers = await page.request.get('/api/v1/suppliers?q=RESP-001');
  const supplierId = ((await suppliers.json()) as { data: { id: string }[] }).data[0]?.id;
  const products = await page.request.get('/api/v1/products?q=Riviera');
  const variantId = ((await products.json()) as { data: { variants: { id: string }[] }[] }).data[0]
    ?.variants[0]?.id;
  expect(supplierId && variantId).toBeTruthy();
  const entry = await page.request.post('/api/v1/stock-entries', {
    data: { supplierId, freightCost: '3', documentNumber: 'RESP-DOC-001' },
  });
  expect(entry.status()).toBe(201);
  const entryId = ((await entry.json()) as { data: { id: string } }).data.id;
  const withItems = await page.request.put(`/api/v1/stock-entries/${entryId}/items`, {
    data: { items: [{ variantId, expectedQty: 12, receivedQty: 10, unitCost: '10' }] },
  });
  expect(withItems.status()).toBe(200);
  entryRoute = `/ingresos/${entryId}`;
}

// Un caso por ancho: cada uno tiene su propio tiempo y, si falla, se ve en cuál.
for (const width of WIDTHS) {
  test(`ninguna pantalla desborda ni recorta controles a ${width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await prepareData(page);
    const routes = [...ROUTES, ['Detalle de ingreso', entryRoute ?? '/ingresos'] as const];

    const problems: string[] = [];
    await page.setViewportSize({ width, height: 900 });
    for (const [name, path] of routes) {
      await page.goto(path);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 0) problems.push(`${name}: la página desborda ${overflow}px`);
      for (const control of await clippedControls(page)) {
        problems.push(`${name}: control recortado → ${control}`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
}

test('en móvil las filas de las tablas son tarjetas con sus acciones visibles', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill('demo-admin@example.invalid');
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: /Bienvenido/ })).toBeVisible();

  await page.goto('/inventario');
  await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible();
  // Sin encabezados de columna (se pasan a etiquetas de cada tarjeta) y con la acción al alcance.
  await expect(page.getByRole('columnheader', { name: 'Acciones' })).toBeHidden();
  const historial = page.getByRole('button', { name: /Historial de/ }).first();
  await expect(historial).toBeInViewport({ ratio: 1 });

  // Escritorio: vuelve la tabla con sus encabezados.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('columnheader', { name: 'Acciones' })).toBeVisible();
});

test('el dashboard conserva el ordenamiento en móvil mediante el selector', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill('demo-vendedor@example.invalid');
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: /Bienvenido/ })).toBeVisible();

  const sort = page.getByLabel('Ordenar por');
  await expect(sort).toBeVisible();
  await sort.selectOption('quantity');
  await page.getByRole('button', { name: 'Orden ascendente' }).click();
  await expect(page.getByRole('button', { name: 'Orden descendente' })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(sort).toBeHidden();
  await expect(page.getByRole('columnheader', { name: /Piezas/ })).toBeVisible();
});
