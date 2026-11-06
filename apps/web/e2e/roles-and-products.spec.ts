import { expect, test, type Page } from '@playwright/test';
import { openProduct } from './product-pages.ts';

/**
 * E2E por roles con los usuarios DEMO de `npm run db:seed:demo` (se ejecuta dentro de `npm run qa`).
 * El rol «cliente» no existe en este sistema: el Vendedor es el usuario con acceso restringido.
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
  // Tras cerrar sesión, la app devuelve a la página anterior (no siempre al Inicio): basta el menú.
  await expect(menu(page)).toBeVisible();
}

test.describe('login y menú según el rol', () => {
  test('el administrador ve todos los módulos', async ({ page }) => {
    await login(page, USERS.admin);
    for (const name of [
      'Proveedores',
      'Usuarios',
      'Categorías',
      'Productos',
      'Saldos y alertas',
      'Movimientos',
    ]) {
      await expect(menu(page).getByRole('link', { name })).toBeVisible();
    }
    await expect(menu(page).getByText('Punto de venta')).toBeVisible();
    await expect(menu(page).getByRole('link', { name: 'Punto de venta' })).toHaveCount(0);
  });

  test('el responsable de inventario no ve Usuarios', async ({ page }) => {
    await login(page, USERS.inventario);
    for (const name of ['Proveedores', 'Productos', 'Saldos y alertas']) {
      await expect(menu(page).getByRole('link', { name })).toBeVisible();
    }
    await expect(menu(page).getByRole('link', { name: 'Usuarios' })).toHaveCount(0);
  });

  test('el vendedor solo consulta catálogo e inventario', async ({ page }) => {
    await login(page, USERS.vendedor);
    await expect(menu(page).getByRole('link', { name: 'Productos' })).toBeVisible();
    await expect(menu(page).getByRole('link', { name: 'Saldos y alertas' })).toBeVisible();
    await expect(menu(page).getByText('Compras', { exact: true })).toHaveCount(0);
    for (const name of ['Proveedores', 'Usuarios']) {
      await expect(menu(page).getByRole('link', { name })).toHaveCount(0);
    }
  });

  test('rechaza credenciales incorrectas', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(USERS.admin);
    await page.getByLabel('Contraseña').fill('contraseña-incorrecta');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('rutas protegidas', () => {
  test('sin sesión cualquier ruta interna redirige al login', async ({ page }) => {
    for (const route of ['/', '/usuarios', '/productos', '/inventario', '/proveedores']) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test('el vendedor no accede a Usuarios ni Proveedores aunque escriba la URL', async ({
    page,
  }) => {
    await login(page, USERS.vendedor);
    for (const route of ['/usuarios', '/proveedores']) {
      await page.goto(route);
      await expect(page.getByText('No tiene permiso para ver esta sección.')).toBeVisible();
    }
  });

  test('la API rechaza al vendedor aunque se salte la interfaz', async ({ page }) => {
    await login(page, USERS.vendedor);
    const users = await page.request.get('/api/v1/users');
    expect(users.status()).toBe(403);
    const create = await page.request.post('/api/v1/products', {
      data: { categoryId: '01900000-0000-7000-8000-000000000000', name: 'Intruso' },
    });
    expect(create.status()).toBe(403);
  });

  test('el vendedor no ve acciones de gestión en Productos', async ({ page }) => {
    await login(page, USERS.vendedor);
    await menu(page).getByRole('link', { name: 'Productos' }).click();
    await expect(page.getByRole('heading', { name: 'Productos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo producto' })).toHaveCount(0);
  });

  test('tras cerrar sesión no se puede volver a una ruta protegida', async ({ page }) => {
    await login(page, USERS.inventario);
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/productos');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('productos e inventario desde la interfaz', () => {
  test('el catálogo DEMO trae 20 productos con stock variado', async ({ page }) => {
    await login(page, USERS.admin);
    await menu(page).getByRole('link', { name: 'Saldos y alertas' }).click();
    await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible();

    const level = page.getByLabel('Estado de stock');
    await level.selectOption('OUT');
    await expect(page.getByRole('row', { name: /DEMO/ }).first()).toContainText('Sin stock');
    await level.selectOption('LOW');
    await expect(page.getByRole('row', { name: /DEMO/ }).first()).toContainText('Bajo mínimo');
    await level.selectOption('OK');
    await expect(page.getByRole('row', { name: /DEMO/ }).first()).toContainText('Disponible');
  });

  test('crea, edita y verifica un producto; carga su stock inicial', async ({ page }) => {
    await login(page, USERS.inventario);
    await menu(page).getByRole('link', { name: 'Productos' }).click();
    await page.getByRole('button', { name: 'Nuevo producto' }).click();

    await page.getByLabel('Categoría').selectOption({ label: 'DEMO Anillos' });
    await page.getByLabel('Nombre del producto').fill('E2E Anillo Prueba');
    await page.getByLabel('Stock mínimo en piezas').fill('3');
    await page.getByRole('button', { name: 'Guardar producto' }).click();

    // La tarjeta resume (solo nombre, precio, disponibilidad y stock); el detalle está en su ficha.
    await expect(page.getByRole('link', { name: 'Ver ficha de E2E Anillo Prueba' })).toContainText(
      'Sin stock',
    );
    await openProduct(page, 'E2E Anillo Prueba');
    const card = page.getByRole('article').filter({ hasText: 'E2E Anillo Prueba' });
    await expect(card).toContainText('DEMO Anillos');
    await expect(card).toContainText(/SKU-\d{6}/);
    await expect(card).toContainText('Sin código');

    // Edición
    await page.getByRole('button', { name: 'Editar E2E Anillo Prueba' }).click();
    await page.getByLabel('Nombre del producto').fill('E2E Anillo Editado');
    await page.getByLabel('Modelo (opcional)').fill('MOD-E2E');
    await page.getByRole('button', { name: 'Guardar producto' }).click();
    const edited = page.getByRole('article').filter({ hasText: 'E2E Anillo Editado' });
    await expect(edited).toContainText('MOD-E2E');
    await expect(page.getByRole('article').filter({ hasText: 'E2E Anillo Prueba' })).toHaveCount(0);

    // Verificación tras recargar: persistió
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'E2E Anillo Editado' })).toBeVisible();
    await page.goto('/productos');
    await page.getByLabel('Buscar por nombre, SKU o código de barras').fill('E2E Anillo Editado');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByRole('link', { name: 'Ver ficha de E2E Anillo Editado' })).toBeVisible();

    // El responsable de inventario autoriza (regla 2026-11-05): también carga el stock inicial de una
    // pieza sin movimientos.
    await menu(page).getByRole('link', { name: 'Saldos y alertas' }).click();
    await page.getByLabel('Buscar por producto, SKU o código').fill('E2E Anillo Editado');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByRole('row', { name: /E2E Anillo Editado/ })).toContainText('Sin stock');
    await expect(page.getByRole('button', { name: /Stock inicial de/ })).toHaveCount(1);

    // El administrador sí carga el stock inicial
    await page.getByRole('button', { name: 'Salir' }).click();
    // Esperar a que la sesión se cierre: si /login se abre con la sesión viva, redirige al inicio.
    await expect(page).toHaveURL(/\/login$/);
    await login(page, USERS.admin);
    await menu(page).getByRole('link', { name: 'Saldos y alertas' }).click();
    await page.getByLabel('Buscar por producto, SKU o código').fill('E2E Anillo Editado');
    await page.getByRole('button', { name: 'Buscar' }).click();
    const row = page.getByRole('row', { name: /E2E Anillo Editado/ });
    await expect(row).toContainText('Sin stock');
    // La imagen de la pieza aparece en Saldos (aquí la de «Sin foto») y se carga de verdad.
    const image = row.locator('img[src*="/api/v1/products/variants/"]');
    await expect(image).toHaveCount(1);
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0);
    await row.getByRole('button', { name: /stock inicial/i }).click();
    await page.getByLabel('Cantidad en piezas').fill('8');
    await page.getByLabel('Motivo').fill('Apertura E2E');
    await page.getByRole('button', { name: 'Registrar entrada' }).click();
    await expect(page.getByRole('row', { name: /E2E Anillo Editado/ })).toContainText('Disponible');
  });
});
