import { expect, test, type Page } from '@playwright/test';

/**
 * S2 · Catálogo completo, con los usuarios DEMO de `npm run db:seed:demo` (se ejecuta dentro de
 * `npm run qa:e2e`). Recorridos: el Responsable crea una ficha con atributos y variantes e imprime
 * etiquetas; el Administrador elimina una ficha sin movimientos; el Vendedor solo consulta.
 */
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD ?? '';
const USERS = {
  admin: 'demo-admin@example.invalid',
  inventario: 'demo-inventario@example.invalid',
  vendedor: 'demo-vendedor@example.invalid',
};

test.skip(!DEMO_PASSWORD, 'Definir DEMO_USER_PASSWORD (npm run qa lo genera)');

const menu = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' });

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(menu(page)).toBeVisible();
}

async function addAttributeValue(page: Page, attribute: string, value: string) {
  await page.getByRole('button', { name: `Agregar valor a ${attribute}` }).click();
  await page.getByLabel(`Nuevo valor de ${attribute}`).fill(value);
  await page.getByRole('button', { name: 'Guardar valor' }).click();
  await expect(
    page.getByRole('region', { name: attribute }).getByText(value, { exact: true }),
  ).toBeVisible();
}

const card = (page: Page, name: string) => page.getByRole('article').filter({ hasText: name });

test.describe.configure({ mode: 'serial' });

test.describe('Responsable de inventario', () => {
  test('gestiona valores de atributos y crea una ficha con atributos y variantes', async ({
    page,
  }) => {
    await login(page, USERS.inventario);

    // Los 12 atributos base traen un uso sugerido (B2) y el Responsable carga los valores.
    await menu(page).getByRole('link', { name: 'Atributos' }).click();
    await expect(page.getByRole('heading', { name: 'Ejes de variante sugeridos' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Características', level: 2 })).toBeVisible();
    await addAttributeValue(page, 'Material', 'E2E Plata 925');
    await addAttributeValue(page, 'Talla', 'E2E 16');
    await addAttributeValue(page, 'Talla', 'E2E 18');
    await addAttributeValue(page, 'Piedra', 'E2E Circonia');

    // Renombrar y desactivar un valor.
    await addAttributeValue(page, 'Acabado', 'E2E Mate');
    await page.getByRole('button', { name: 'Editar valor E2E Mate de Acabado' }).click();
    await page.getByLabel('Valor (E2E Mate)').fill('E2E Mate fino');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    const acabado = page.getByRole('region', { name: 'Acabado' });
    await expect(acabado.getByText('E2E Mate fino')).toBeVisible();
    await acabado
      .getByRole('button', { name: 'Desactivar valor E2E Mate fino de Acabado' })
      .click();
    await expect(acabado.getByText('Inactivo')).toBeVisible();

    // Definición nueva (no se borran las del sistema).
    await page.getByRole('button', { name: 'Nuevo atributo' }).click();
    await page.getByLabel('Nombre del atributo').fill('E2E Largo de cadena');
    await page.getByRole('button', { name: 'Guardar atributo' }).click();
    await expect(page.getByRole('region', { name: 'E2E Largo de cadena' })).toBeVisible();

    // Ficha nueva con ejes y característica.
    await menu(page).getByRole('link', { name: 'Productos' }).click();
    await page.getByRole('button', { name: 'Nuevo producto' }).click();
    await expect(page.getByText('<Tipo de pieza> <rasgo principal> <modelo>')).toBeVisible();
    await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'DEMO Anillos' });
    await page.getByLabel('Nombre del producto').fill('E2E Anillo corazón con circonia');
    await expect(page.getByLabel('Precio de venta (neto)')).toHaveCount(0); // sin prices:manage
    await page.getByLabel('Variante por Material').check();
    await page
      .getByLabel('Valor de Material (primera variante)')
      .selectOption({ label: 'E2E Plata 925' });
    await page.getByLabel('Variante por Talla').check();
    await page.getByLabel('Valor de Talla (primera variante)').selectOption({ label: 'E2E 16' });
    await page.getByLabel('Piedra', { exact: true }).selectOption({ label: 'E2E Circonia' });
    await page.getByLabel('Código del proveedor (si tiene)').fill('E2E-PROV-001');
    await page.getByRole('button', { name: 'Guardar producto' }).click();

    const ring = card(page, 'E2E Anillo corazón con circonia');
    await expect(ring).toContainText('Piedra:');
    await expect(ring).toContainText('E2E Circonia');
    await expect(ring).toContainText('E2E Plata 925 / E2E 16');
    await expect(ring).toContainText(/SKU-\d{6}/);
    await expect(ring).toContainText('E2E-PROV-001');
    // Tiene una característica: no está incompleta; el precio quedó en 0.
    await expect(ring.getByText('Ficha incompleta')).toHaveCount(0);
    await expect(ring.getByText('Sin precio', { exact: true })).toBeVisible();
    await expect(ring).toContainText('Stock mínimo: 0 (sin alerta)');

    // Segunda combinación: SKU correlativo propio.
    await page
      .getByRole('button', { name: 'Nueva variante de E2E Anillo corazón con circonia' })
      .click();
    await page.getByLabel('Talla', { exact: true }).selectOption({ label: 'E2E 18' });
    await page.getByLabel('Material', { exact: true }).selectOption({ label: 'E2E Plata 925' });
    await page.getByRole('button', { name: 'Guardar variante' }).click();
    await expect(ring.getByText(/^SKU:/)).toHaveCount(2);
    await expect(ring).toContainText('E2E Plata 925 / E2E 18');

    // Stock mínimo por variante (B10): lo modifica el Responsable.
    const skuLine = await ring.locator('p').filter({ hasText: /^SKU:/ }).first().textContent();
    const sku = skuLine?.match(/SKU-\d{6}/)?.[0] ?? '';
    expect(sku).toMatch(/^SKU-\d{6}$/);
    await ring.getByRole('spinbutton', { name: `Stock mínimo de ${sku}` }).fill('4');
    await ring.getByRole('button', { name: `Guardar stock mínimo de ${sku}` }).click();
    await expect(ring).toContainText('Stock mínimo: 4 piezas');

    // El Responsable no puede eliminar fichas (B11).
    await expect(page.getByRole('button', { name: /^Eliminar / })).toHaveCount(0);
    expect(
      (await page.request.delete('/api/v1/products/01900000-0000-7000-8000-000000000000')).status(),
    ).toBe(403);
  });

  test('un código de proveedor repetido no se guarda: avisa y la pieza se identifica por su SKU', async ({
    page,
  }) => {
    await login(page, USERS.inventario);
    await menu(page).getByRole('link', { name: 'Productos' }).click();
    await page.getByRole('button', { name: 'Nuevo producto' }).click();
    await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'DEMO Anillos' });
    await page.getByLabel('Nombre del producto').fill('E2E Anillo repetido');
    await page.getByLabel('Código del proveedor (si tiene)').fill('E2E-PROV-001');
    await page.getByRole('button', { name: 'Guardar producto' }).click();

    await expect(
      page.getByRole('status').filter({ hasText: 'ya pertenece a la pieza' }),
    ).toContainText('esta pieza se identifica por su SKU');
    const repeated = card(page, 'E2E Anillo repetido');
    await expect(repeated).toContainText('Sin código');
    // Sin descripción ni características: ficha incompleta.
    await expect(repeated.getByText('Ficha incompleta')).toBeVisible();

    // La búsqueda unificada encuentra la pieza original por el código del proveedor.
    await page.getByLabel('Buscar por nombre, SKU o código de barras').fill('E2E-PROV-001');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Encontrada por el código de barras' }),
    ).toBeVisible();
    await expect(card(page, 'E2E Anillo corazón con circonia')).toBeVisible();

    // Filtro de fichas incompletas.
    await page.getByLabel('Buscar por nombre, SKU o código de barras').fill('');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.getByLabel('Estado de la ficha').selectOption('incomplete');
    await expect(card(page, 'E2E Anillo repetido')).toBeVisible();
    await expect(card(page, 'E2E Anillo corazón con circonia')).toHaveCount(0);
  });

  test('imprime la vista previa de etiquetas: @page y un SVG por etiqueta', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => {
        (window as unknown as { printed: number }).printed += 1;
      };
    });
    await login(page, USERS.inventario);
    await menu(page).getByRole('link', { name: 'Productos' }).click();
    await page
      .getByRole('link', { name: 'Imprimir etiquetas de E2E Anillo corazón con circonia' })
      .click();

    await expect(page).toHaveURL(/\/catalogo\/etiquetas\?codes=/);
    await expect(page.getByRole('heading', { name: 'Etiquetas' })).toBeVisible();
    const copies = page.getByLabel(/^Copias de SKU-/);
    await expect(copies).toHaveCount(2);
    await copies.first().fill('2');

    // Tamaño por defecto 50 × 25 y vista previa con el SVG del SKU (sin precio ni nombre).
    await expect(page.getByLabel('Ancho (mm)')).toHaveValue('50');
    await expect(page.getByLabel('Alto (mm)')).toHaveValue('25');
    const preview = page.getByLabel('Vista previa de etiquetas');
    await expect(
      preview.getByRole('img', { name: /Código de barras Code 128 del SKU SKU-/ }),
    ).toHaveCount(2);
    await expect(preview).not.toContainText('Anillo');

    // Cambiar el tamaño: se guarda en el navegador y llega al @page.
    await page.getByLabel('Ancho (mm)').fill('60');
    await page.getByLabel('Alto (mm)').fill('30');
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('joyeria.labelSize')))
      .toContain('"widthMm":60');
    const css = await page.locator('#print-labels style').textContent();
    expect(css).toContain('@page { size: 60mm 30mm; margin: 0; }');
    await expect(page.locator('#print-labels .label-page')).toHaveCount(3); // 2 + 1 copias
    await expect(page.locator('#print-labels svg')).toHaveCount(3);

    await page.getByRole('button', { name: 'Imprimir 3 etiquetas' }).click();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);

    // Vista de impresión: toda la aplicación se oculta y solo quedan las etiquetas.
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#root')).toBeHidden();
    await expect(page.locator('#print-labels')).toBeVisible();
    await expect(page.locator('#print-labels .label-page').first()).toBeVisible();
    await page.emulateMedia({ media: 'screen' });
    await expect(page.locator('#print-labels')).toBeHidden();

    // El tamaño se recuerda al volver.
    await page.reload();
    await expect(page.getByLabel('Ancho (mm)')).toHaveValue('60');
  });

  test('el Inicio avisa de las fichas incompletas y de las piezas sin precio', async ({ page }) => {
    await login(page, USERS.inventario);
    await page.goto('/');
    const notice = page.getByRole('region', { name: 'Fichas por completar' });
    await expect(notice).toContainText('incompleta');
    await expect(notice).toContainText('sin precio');
    await notice.getByRole('link', { name: 'Ver fichas incompletas' }).click();
    await expect(page).toHaveURL(/incomplete=1/);
    await expect(page.getByLabel('Estado de la ficha')).toHaveValue('incomplete');
    await expect(card(page, 'E2E Anillo repetido')).toBeVisible();
  });

  test('gestiona categorías de dos niveles', async ({ page }) => {
    await login(page, USERS.inventario);
    await menu(page).getByRole('link', { name: 'Categorías' }).click();
    await page.getByRole('button', { name: 'Nueva categoría' }).click();
    await page.getByLabel('Nombre de categoría').fill('E2E Relojes');
    await page.getByRole('button', { name: 'Guardar categoría' }).click();
    await page.getByRole('button', { name: 'Nueva subcategoría de E2E Relojes' }).click();
    await expect(page.getByLabel('Categoría principal')).toHaveValue(/.+/);
    await page.getByLabel('Nombre de categoría').fill('E2E Digitales');
    await page.getByRole('button', { name: 'Guardar categoría' }).click();
    const root = page.locator('section').filter({ hasText: 'E2E Relojes' }).last();
    await expect(root.getByText('E2E Digitales', { exact: true })).toBeVisible();
    // Una subcategoría no ofrece «Nueva subcategoría»: no hay tercer nivel.
    await expect(
      page.getByRole('button', { name: 'Nueva subcategoría de E2E Digitales' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Nueva categoría' }).click();
    await expect(
      page.getByLabel('Categoría principal').getByRole('option', { name: 'E2E Digitales' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancelar' }).click();

    // Desactivar: primero la subcategoría.
    await page.getByRole('button', { name: 'Desactivar E2E Relojes' }).click();
    await expect(page.getByRole('alert')).toContainText('Desactive primero las subcategorías');
    await page.getByRole('button', { name: 'Desactivar E2E Digitales' }).click();
    await expect(root.getByText('Inactiva')).toBeVisible();

    // Asignar atributos a la categoría.
    await page.getByRole('button', { name: 'Atributos de E2E Relojes' }).click();
    await page.getByLabel('Usar Material').check();
    await page.getByLabel('Material como eje de variante').check();
    await page.getByRole('button', { name: 'Guardar atributos' }).click();
    await expect(page.getByRole('form', { name: 'Atributos de E2E Relojes' })).toHaveCount(0);
  });
});

test.describe('Administrador', () => {
  test('elimina una ficha sin movimientos y no una con historial', async ({ page }) => {
    await login(page, USERS.admin);
    const categories = (await (await page.request.get('/api/v1/categories')).json()) as {
      data: { id: string; name: string }[];
    };
    const categoryId = categories.data.find((item) => item.name === 'DEMO Anillos')?.id;
    const created = await page.request.post('/api/v1/products', {
      data: { categoryId, name: 'E2E Ficha para eliminar' },
    });
    expect(created.status()).toBe(201);

    await menu(page).getByRole('link', { name: 'Productos' }).click();
    await page
      .getByLabel('Buscar por nombre, SKU o código de barras')
      .fill('E2E Ficha para eliminar');
    await page.getByRole('button', { name: 'Buscar' }).click();
    const target = card(page, 'E2E Ficha para eliminar');
    await target.getByRole('button', { name: 'Eliminar E2E Ficha para eliminar' }).click();
    // Confirmación explícita: cancelar no elimina.
    await expect(page.getByRole('alertdialog')).toContainText('no se puede deshacer');
    await page.getByRole('button', { name: 'Cancelar eliminación' }).click();
    await expect(target).toBeVisible();
    await target.getByRole('button', { name: 'Eliminar E2E Ficha para eliminar' }).click();
    await page.getByRole('button', { name: 'Sí, eliminar definitivamente' }).click();
    await expect(target).toHaveCount(0);
    await page.reload();
    await page
      .getByLabel('Buscar por nombre, SKU o código de barras')
      .fill('E2E Ficha para eliminar');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('No se encontraron productos.')).toBeVisible();

    // Una pieza DEMO con stock (tiene movimientos): la API lo rechaza con el motivo.
    await page
      .getByLabel('Buscar por nombre, SKU o código de barras')
      .fill('Anillo Solitario Circona');
    await page.getByRole('button', { name: 'Buscar' }).click();
    const stocked = card(page, 'DEMO Anillo Solitario Circona');
    await stocked.getByRole('button', { name: 'Eliminar DEMO Anillo Solitario Circona' }).click();
    await page.getByRole('button', { name: 'Sí, eliminar definitivamente' }).click();
    await expect(page.getByRole('alert')).toContainText('No se puede eliminar el producto');
    await expect(stocked).toBeVisible();
  });
});

test.describe('Vendedor', () => {
  test('solo consulta: ve fichas, códigos y etiquetas pero no gestiona ni elimina', async ({
    page,
  }) => {
    await login(page, USERS.vendedor);
    await expect(menu(page).getByRole('link', { name: 'Etiquetas' })).toBeVisible();
    await menu(page).getByRole('link', { name: 'Productos' }).click();
    await expect(page.getByRole('heading', { name: 'Productos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo producto' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Editar / })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Eliminar / })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Desactivar / })).toHaveCount(0);
    await expect(page.getByLabel(/^Stock mínimo de /)).toHaveCount(0);
    await expect(page.getByText('Precio de venta (neto)').first()).toBeVisible();
    await expect(page.getByText(/costo/i)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Imprimir etiquetas de / }).first()).toBeVisible();

    await menu(page).getByRole('link', { name: 'Atributos' }).click();
    await expect(page.getByRole('button', { name: 'Nuevo atributo' })).toHaveCount(0);
    await menu(page).getByRole('link', { name: 'Categorías' }).click();
    await expect(page.getByRole('button', { name: 'Nueva categoría' })).toHaveCount(0);

    // Sin aviso de fichas por completar (solo para quien gestiona el catálogo).
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Bienvenido/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Fichas por completar' })).toHaveCount(0);

    // La API lo confirma.
    expect(
      (await page.request.delete('/api/v1/products/01900000-0000-7000-8000-000000000000')).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post('/api/v1/attributes', { data: { name: 'X', dataType: 'TEXT' } })
      ).status(),
    ).toBe(403);
    const lookup = await page.request.get('/api/v1/catalog/variants/lookup?code=NO-EXISTE');
    expect(lookup.status()).toBe(404);
  });
});
