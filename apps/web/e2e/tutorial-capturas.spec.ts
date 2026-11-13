import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  PASSWORD,
  SUFFIX,
  USERS,
  apiLogin,
  createPiece,
  ensureCashClosed,
  login,
  menu,
  openCash,
  scan,
  sellViaApi,
} from './sales-helpers.ts';

/**
 * CAPTURAS DEL TUTORIAL DE USO (docs/tutorial). No es una prueba de regresión: recorre el sistema
 * con los usuarios y datos DEMO y guarda capturas en docs/tutorial/img/<rol>/NN-nombre.png.
 *
 * Queda FUERA de la suite normal (CI y `npm run qa`): solo corre con TUTORIAL_CAPTURES=1.
 *   PowerShell:  $env:TUTORIAL_CAPTURES='1'; npm run qa -- e2e tutorial-capturas.spec.ts
 *
 * Cada paso es «blando»: si un selector falla, se anota en la consola y el recorrido sigue, para
 * no perder el resto de capturas. Al final se listan los pasos fallidos (si los hubo).
 */
test.skip(!process.env.TUTORIAL_CAPTURES, 'Solo con TUTORIAL_CAPTURES=1 (capturas del tutorial)');
test.skip(!PASSWORD, 'Definir DEMO_USER_PASSWORD (npm run qa lo genera)');
test.describe.configure({ mode: 'serial' });
test.use({
  viewport: { width: 1366, height: 768 },
  actionTimeout: 15_000,
  navigationTimeout: 30_000,
});

const IMG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/tutorial/img');
const failures: string[] = [];

/** Espera a que no haya cargas pendientes y guarda la captura. */
async function shot(page: Page, file: string, fullPage = false) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await expect(page.locator('[aria-busy="true"]'))
    .toHaveCount(0, { timeout: 8000 })
    .catch(() => undefined);
  await expect(page.locator('.animate-spin'))
    .toHaveCount(0, { timeout: 8000 })
    .catch(() => undefined);
  await page.waitForTimeout(400); // transiciones de Tailwind
  const path = `${IMG_DIR}/${file}.png`;
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage });
}

/** Paso blando: un fallo no detiene el recorrido. */
async function step(name: string, fn: () => Promise<void>) {
  try {
    await test.step(name, fn);
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    failures.push(`${name}: ${message}`);
    console.warn(`[tutorial] PASO FALLIDO «${name}»: ${message}`);
  }
}

/** Acepta todas las confirmaciones nativas (window.confirm) de la app. */
function acceptDialogs(page: Page) {
  page.on('dialog', (dialog) => void dialog.accept().catch(() => undefined));
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await expect(menu(page)).toBeVisible();
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

const key = () => ({ 'Idempotency-Key': randomUUID() });

/** Producto sin stock (para mostrar «Stock inicial»). */
async function createEmptyProduct(api: APIRequestContext, name: string) {
  const categories = (await (await api.get('/api/v1/categories')).json()) as {
    data: { id: string; name: string }[];
  };
  const categoryId = categories.data.find((item) => item.name === 'DEMO Aretes')?.id;
  const created = await api.post('/api/v1/products', { data: { categoryId, name } });
  expect(created.status()).toBe(201);
  const body = (await created.json()) as { data: { variants: { sku: string }[] } };
  return body.data.variants[0]?.sku ?? '';
}

test.afterAll(() => {
  console.warn(
    failures.length
      ? `[tutorial] ${failures.length} pasos fallidos:\n - ${failures.join('\n - ')}`
      : '[tutorial] Todas las capturas se generaron sin fallos.',
  );
});

// ─────────────────────────────────────────────────────────────── Común: acceso
test('común: inicio de sesión', async ({ page }) => {
  await step('pantalla de ingreso', async () => {
    await page.goto('/login');
    await shot(page, 'comun/01-login');
    await page.getByLabel('Correo electrónico').fill(USERS.vendedor);
    await page.getByLabel('Contraseña').fill('contraseña-incorrecta');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos');
    await shot(page, 'comun/02-login-error');
  });
  await step('ingreso en el celular', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');
    await shot(page, 'comun/03-login-movil');
  });
});

// ─────────────────────────────────────────────────────────────── Administrador
test('administrador: recorrido completo', async ({ page, request }) => {
  test.setTimeout(600_000);
  await apiLogin(request, USERS.admin);
  await ensureCashClosed(request);
  const r = 'administrador';

  acceptDialogs(page);
  await login(page, USERS.admin);
  await step('inicio y menú', async () => {
    await go(page, '/');
    await shot(page, `${r}/01-inicio`);
    await shot(page, `${r}/02-inicio-completo`, true);
  });

  await step('categorías', async () => {
    await menu(page).getByRole('link', { name: 'Categorías' }).click();
    await shot(page, `${r}/03-categorias`);
  });
  await step('atributos', async () => {
    await menu(page).getByRole('link', { name: 'Atributos' }).click();
    await expect(page.getByRole('heading', { name: 'Ejes de variante sugeridos' })).toBeVisible();
    await shot(page, `${r}/04-atributos`);
  });

  const productName = `Anillo tutorial ${SUFFIX}`;
  await step('nuevo producto con variantes', async () => {
    await menu(page).getByRole('link', { name: 'Productos' }).click();
    await shot(page, `${r}/05-productos`);
    await page.getByRole('button', { name: 'Nuevo producto' }).click();
    await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'DEMO Anillos' });
    await page.getByLabel('Nombre del producto').fill(productName);
    const axis = page.getByRole('checkbox', { name: /^Variante por / }).first();
    if (await axis.count()) {
      await axis.check();
      await page
        .getByRole('combobox', { name: /\(primera variante\)$/ })
        .first()
        .selectOption({ index: 1 })
        .catch(() => undefined);
    }
    await page.getByLabel('Precio de venta inicial').fill('250');
    await shot(page, `${r}/06-producto-formulario`);
    await page.getByRole('button', { name: 'Guardar producto' }).click();
    await page.waitForTimeout(1500);
    await shot(page, `${r}/07-producto-creado`);
  });

  await step('ficha del producto con fotos', async () => {
    await go(page, '/productos');
    await page.getByLabel('Buscar por nombre, SKU o código de barras').fill('Solitario');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page
      .getByRole('link', { name: /^Ver ficha de .*Solitario/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await shot(page, `${r}/08-ficha-producto`);
    await shot(page, `${r}/09-ficha-producto-completa`, true);
  });

  await step('etiquetas y códigos', async () => {
    await menu(page).getByRole('link', { name: 'Etiquetas' }).click();
    await page.getByLabel('Escanee o escriba un SKU, código o nombre').fill('Solitario');
    await page.getByRole('button', { name: 'Agregar' }).click();
    await page
      .getByRole('button', { name: /^Agregar etiqueta de / })
      .first()
      .click()
      .catch(() => undefined);
    await shot(page, `${r}/10-etiquetas`);
  });

  await step('proveedores', async () => {
    await menu(page).getByRole('link', { name: 'Proveedores' }).click();
    await shot(page, `${r}/11-proveedores`);
    await page.getByRole('button', { name: 'Nuevo proveedor' }).click();
    await page.getByLabel('Nombre', { exact: true }).fill(`Proveedor tutorial ${SUFFIX}`);
    await page.getByLabel('NIT o identificador').fill('1234567');
    await shot(page, `${r}/12-proveedor-formulario`);
    await page.getByRole('button', { name: 'Guardar proveedor' }).click();
  });

  await step('tipos de costo', async () => {
    await menu(page).getByRole('link', { name: 'Tipos de costo' }).click();
    await shot(page, `${r}/13-tipos-de-costo`);
  });

  await step('ingresos: listado e ingreso de importación DEMO', async () => {
    await menu(page).getByRole('link', { name: 'Ingresos de mercadería' }).click();
    await shot(page, `${r}/14-ingresos`);
    await page.getByLabel('Buscar por número o documento').fill('DEMO-IMP-001');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page
      .getByRole('row', { name: /DEMO-IMP-001/ })
      .getByRole('link')
      .first()
      .click();
    await expect(page.getByRole('heading', { name: /Ingreso ING-\d{6}/ })).toBeVisible();
    await shot(page, `${r}/15-ingreso-confirmado-importacion`, true);
  });

  await step('precios: solicitudes pendientes y aprobación', async () => {
    await menu(page).getByRole('link', { name: 'Precios' }).click();
    await expect(page.getByRole('heading', { name: 'Precios de venta' })).toBeVisible();
    await shot(page, `${r}/16-precios`);
    await page.getByRole('tab', { name: /Pendientes/ }).click();
    await shot(page, `${r}/17-precios-pendientes`);
    await page
      .getByRole('checkbox', { name: /^Seleccionar solicitud de / })
      .first()
      .check();
    await shot(page, `${r}/18-precios-seleccion`);
    await page.getByRole('button', { name: /^Aprobar seleccionadas/ }).click();
    await page.waitForTimeout(800);
    await shot(page, `${r}/19-precios-aprobado`);
    await page.getByRole('tab', { name: 'Historial' }).click();
    await shot(page, `${r}/20-precios-historial`);
  });

  await step('ajustes: aprobar uno pendiente', async () => {
    await menu(page).getByRole('link', { name: 'Ajustes' }).click();
    await shot(page, `${r}/21-ajustes`);
    const list = (await (
      await request.get('/api/v1/inventory/adjustments?status=PENDING&pageSize=20')
    ).json()) as { data: { id: string; status: string }[] };
    const pending = list.data.find((item) => item.status === 'PENDING');
    if (!pending) throw new Error('No hay ajustes pendientes DEMO');
    await go(page, `/inventario/ajustes/${pending.id}`);
    await expect(page.getByRole('heading', { name: /Ajuste AJ-\d{6}/ })).toBeVisible();
    await shot(page, `${r}/22-ajuste-pendiente`);
    await page.getByRole('button', { name: 'Aprobar ajuste' }).click();
    await expect(page.getByRole('heading', { name: /Ajuste AJ-\d{6}/ })).toContainText('Aprobado');
    await shot(page, `${r}/23-ajuste-aprobado`);
  });

  await step('conteos', async () => {
    await menu(page).getByRole('link', { name: 'Conteo físico' }).click();
    await shot(page, `${r}/24-conteos`);
  });

  await step('saldos y movimientos', async () => {
    await menu(page).getByRole('link', { name: 'Saldos y alertas' }).click();
    await shot(page, `${r}/25-saldos`);
    await menu(page).getByRole('link', { name: 'Movimientos' }).click();
    await shot(page, `${r}/26-movimientos`);
  });

  // Caja con una venta y un faltante, para mostrar la corrección del Administrador.
  let sessionId = '';
  let saleId = '';
  await step('caja: abrir', async () => {
    await menu(page).getByRole('link', { name: 'Caja' }).click();
    await expect(page.getByRole('heading', { name: 'La caja está cerrada' })).toBeVisible();
    await shot(page, `${r}/27-caja-cerrada`);
    await page.getByRole('button', { name: 'Abrir caja' }).click();
    const dialog = page.getByRole('dialog', { name: 'Abrir caja' });
    await dialog.getByLabel('Fondo inicial (Bs)').fill('100');
    await shot(page, `${r}/28-caja-abrir`);
    await dialog.getByRole('button', { name: 'Abrir caja' }).click();
    await expect(page.getByText(/abierta con un fondo de/)).toBeVisible();
    await shot(page, `${r}/29-caja-abierta`);
  });
  await step('caja: venta y cierre con faltante (preparación por la API)', async () => {
    const status = (await (await request.get('/api/v1/cash/sessions/current')).json()) as {
      data: { id: string };
    };
    sessionId = status.data.id;
    const piece = await createPiece(request, `Collar tutorial admin ${SUFFIX}`, '60', 2);
    saleId = (await sellViaApi(request, piece)).id;
    const closed = await request.post(`/api/v1/cash/sessions/${sessionId}/close`, {
      data: { countedCash: '150', notes: 'Faltan 10 Bs (demostración)' },
      headers: key(),
    });
    expect(closed.ok()).toBe(true);
  });
  await step('caja: corrección del Administrador', async () => {
    await go(page, `/caja/sesiones/${sessionId}`);
    await shot(page, `${r}/30-caja-cierre-con-faltante`);
    await page.getByRole('button', { name: 'Corregir cierre' }).click();
    const dialog = page.getByRole('dialog', { name: 'Corregir cierre' });
    await dialog.getByLabel('Qué se corrige').selectOption('COUNTED_CASH');
    await dialog.getByLabel('Valor correcto (Bs)').fill('160');
    await dialog.getByLabel('Motivo de la corrección').fill('Se contó mal un billete de 10 Bs');
    await shot(page, `${r}/31-caja-corregir`);
    await dialog.getByRole('button', { name: 'Registrar corrección' }).click();
    await expect(page.getByText('Corregida (1)')).toBeVisible();
    await shot(page, `${r}/32-caja-corregida`, true);
  });
  await step('caja: historial', async () => {
    await go(page, '/caja/historial');
    await shot(page, `${r}/33-caja-historial`);
  });

  await step('historial de ventas y detalle', async () => {
    await menu(page).getByRole('link', { name: 'Historial de ventas' }).click();
    await shot(page, `${r}/34-ventas-historial`);
    await go(page, `/ventas/${saleId}`);
    await shot(page, `${r}/35-venta-detalle`);
  });

  await step('incidencias', async () => {
    const sale = (await (await request.get(`/api/v1/sales/${saleId}`)).json()) as {
      data: { number: number };
    };
    await request.post('/api/v1/sale-incidents', {
      data: {
        kind: 'WRONG_SALE',
        description: 'Se registró la pieza equivocada (demostración)',
        saleNumber: sale.data.number,
      },
      headers: key(),
    });
    await menu(page).getByRole('link', { name: 'Incidencias' }).click();
    await shot(page, `${r}/36-incidencias`);
    await page
      .getByRole('button', { name: /^Ver la incidencia INC-/ })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: /^Incidencia INC-/ });
    await dialog
      .getByLabel(/Resolución/)
      .fill('Se habló con el cliente; sin cambios en el sistema');
    await shot(page, `${r}/37-incidencia-cerrar`);
    await dialog.getByRole('button', { name: 'Cerrar incidencia' }).click();
    await expect(dialog.getByText(/Cerrada por/)).toBeVisible();
    await shot(page, `${r}/38-incidencia-cerrada`);
    await page.keyboard.press('Escape');
    await go(page, '/');
  });

  await step('datos del negocio', async () => {
    await menu(page).getByRole('link', { name: 'Datos del negocio' }).click();
    await page.getByLabel('Dirección (opcional)').fill('Calle Comercio 123, La Paz');
    await shot(page, `${r}/39-datos-negocio`, true);
    await page.getByRole('button', { name: 'Guardar datos' }).click();
  });

  const staffEmail = `personal-${SUFFIX}@example.invalid`;
  const staffPassword = `Inicial-${SUFFIX}-xy`;
  await step('usuarios: crear', async () => {
    await menu(page).getByRole('link', { name: 'Usuarios' }).click();
    await shot(page, `${r}/40-usuarios`);
    await page.getByRole('button', { name: 'Nuevo usuario' }).click();
    await page.getByLabel('Nombre del nuevo usuario').fill('Personal de prueba');
    await page.getByLabel('Correo del nuevo usuario').fill(staffEmail);
    await page.getByLabel('Contraseña inicial', { exact: true }).fill(staffPassword);
    await page.getByLabel('Confirmar contraseña inicial').fill(staffPassword);
    await page.getByLabel('Vendedor').check();
    await shot(page, `${r}/41-usuario-nuevo`);
    await page.getByRole('button', { name: 'Crear usuario' }).click();
    await expect(page.getByRole('row', { name: /Personal de prueba/ })).toBeVisible();
    await page.getByRole('button', { name: 'Editar Personal de prueba' }).click();
    await shot(page, `${r}/42-usuario-editar-restablecer`);
  });

  await step('roles', async () => {
    await go(page, '/roles');
    await shot(page, `${r}/43-roles`);
    await page.getByRole('button', { name: 'Nuevo rol' }).click();
    await shot(page, `${r}/44-rol-nuevo`, true);
  });

  await step('auditoría', async () => {
    await go(page, '/auditoria');
    await shot(page, `${r}/45-auditoria`);
    const table = page.getByRole('table', { name: /Registros de auditoría/ });
    await table
      .getByRole('row')
      .nth(1)
      .getByRole('button', { name: /Ver detalle/ })
      .click();
    await expect(page.getByRole('dialog', { name: 'Detalle del registro' })).toBeVisible();
    await shot(page, `${r}/46-auditoria-detalle`);
  });

  await step('mi cuenta', async () => {
    await page.keyboard.press('Escape');
    await go(page, '/mi-cuenta');
    await shot(page, `${r}/47-mi-cuenta`);
  });

  await step('cambio de contraseña (usuario nuevo)', async () => {
    await logout(page);
    await page.getByLabel('Correo electrónico').fill(staffEmail);
    await page.getByLabel('Contraseña').fill(staffPassword);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(menu(page)).toBeVisible();
    await menu(page).getByRole('link', { name: 'Mi cuenta' }).click();
    const next = `Definitiva-${SUFFIX}-zz`;
    await page.getByLabel('Contraseña actual').fill(staffPassword);
    await page.getByLabel('Contraseña nueva', { exact: true }).fill(next);
    await page.getByLabel('Confirmar contraseña nueva').fill(next);
    await shot(page, `comun/04-cambiar-contrasena`);
    await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await page.waitForTimeout(1000);
    await shot(page, `comun/05-contrasena-cambiada`);
  });
});

// ─────────────────────────────────────────────────────────── Responsable de inventario
test('responsable de inventario: recorrido completo', async ({ page, request }) => {
  test.setTimeout(600_000);
  await apiLogin(request, USERS.admin);
  await ensureCashClosed(request);
  const r = 'responsable';
  const emptySku = await createEmptyProduct(request, `Arete tutorial nuevo ${SUFFIX}`);
  const piece = await createPiece(request, `Anillo tutorial venta ${SUFFIX}`, '150.50', 3);

  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  acceptDialogs(page);
  await login(page, USERS.inventario);

  await step('inicio y menú', async () => {
    await go(page, '/');
    await shot(page, `${r}/01-inicio`);
  });

  await step('stock inicial', async () => {
    await menu(page).getByRole('link', { name: 'Stock inicial' }).click();
    await shot(page, `${r}/02-stock-inicial`);
    await page.getByLabel('Buscar por producto, SKU o código').fill(emptySku);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.getByRole('button', { name: `Stock inicial de ${emptySku}` }).click();
    await page.getByLabel('Cantidad en piezas').fill('5');
    await shot(page, `${r}/03-stock-inicial-formulario`);
    await page
      .getByRole('button', { name: /Registrar|Guardar/ })
      .first()
      .click();
    await page.waitForTimeout(800);
    await shot(page, `${r}/04-stock-inicial-registrado`);
  });

  let entryOk = false;
  await step('ingreso: crear borrador', async () => {
    await go(page, '/ingresos/nuevo');
    await page
      .getByLabel('Proveedor', { exact: true })
      .selectOption({ label: 'Proveedor Demo La Paz' });
    await page.getByLabel('Tipo de documento').fill('Factura');
    await page.getByLabel('Número de documento').fill(`F-TUT-${SUFFIX}`);
    await shot(page, `${r}/05-ingreso-nuevo`);
    await page.getByRole('button', { name: 'Crear borrador' }).click();
    await expect(page.getByRole('heading', { name: /Ingreso ING-\d{6}/ })).toContainText(
      'Borrador',
    );
    entryOk = true;
  });
  await step('ingreso: ítems y costos', async () => {
    if (!entryOk) throw new Error('sin borrador');
    const search = page.getByLabel('Agregar variante por SKU, código de barras o nombre');
    for (const term of ['Riviera', 'Tenis']) {
      await search.fill(term);
      await page.getByRole('button', { name: 'Buscar variante' }).click();
      await page
        .getByRole('button', { name: /^Agregar SKU-/ })
        .first()
        .click();
    }
    const items = page.getByRole('region', { name: 'Ítems recibidos' });
    const riviera = items.getByRole('row', { name: /Riviera/ });
    await riviera.getByLabel(/Cantidad recibida/).fill('10');
    await riviera.getByLabel(/Precio de compra de/).fill('10');
    const tenis = items.getByRole('row', { name: /Tenis/ });
    await tenis.getByLabel(/Cantidad recibida/).fill('5');
    await tenis.getByLabel(/Precio de compra de/).fill('20');
    await page.getByRole('button', { name: 'Guardar ítems' }).click();
    await expect(page.getByText('Guarde los ítems antes de confirmar.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Agregar costo' }).click();
    const cost = page.getByRole('group', { name: 'Costo adicional 1' });
    await cost.getByLabel('Tipo de costo').selectOption({ label: 'Transporte' });
    await cost.getByLabel('Monto (Bs)').fill('11');
    await shot(page, `${r}/06-ingreso-items-y-costos`, true);
    await page.getByRole('button', { name: 'Guardar costos' }).click();
    await expect(page.getByRole('button', { name: 'Confirmar ingreso' })).toBeEnabled();
    await shot(page, `${r}/07-ingreso-listo-para-confirmar`, true);
  });
  await step('ingreso: confirmar', async () => {
    if (!entryOk) throw new Error('sin borrador');
    await page.getByRole('button', { name: 'Confirmar ingreso' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Confirmado por' })).toBeVisible();
    await shot(page, `${r}/08-ingreso-confirmado`);
  });

  await step('precios: aplicar con ganancia en vivo', async () => {
    await menu(page).getByRole('link', { name: 'Precios' }).click();
    await page.getByLabel('Buscar por SKU, nombre o código de barras').fill('Riviera');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await page
      .getByLabel(/^Nuevo precio de SKU-/)
      .first()
      .fill('45');
    await page.getByLabel('Motivo del cambio (opcional)').fill('Nuevo lote');
    await shot(page, `${r}/09-precios-nuevo-precio`);
    await page.getByRole('button', { name: /^Aplicar ahora/ }).click();
    await expect(page.getByText(/Se aplicó 1 precio nuevo/)).toBeVisible();
    await shot(page, `${r}/10-precios-aplicado`);
  });

  let adjustmentUrl = '';
  await step('ajuste: solicitar', async () => {
    await menu(page).getByRole('link', { name: 'Ajustes' }).click();
    await page.getByRole('link', { name: 'Solicitar ajuste' }).click();
    await page.getByLabel('Agregar variante por SKU, código de barras o nombre').fill('Dije Luna');
    await page.getByRole('button', { name: 'Buscar variante' }).click();
    await page
      .getByRole('button', { name: /^Agregar SKU-/ })
      .first()
      .click();
    const line = page.getByRole('row', { name: /Dije Luna/ });
    await line.getByLabel(/^Diferencia de SKU-/).fill('-1');
    await page.getByLabel('Motivo del ajuste').selectOption({ label: 'Otro' });
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'exige una observación' }),
    ).toBeVisible();
    await shot(page, `${r}/11-ajuste-error-observacion`);
    await page.getByLabel('Motivo del ajuste').selectOption({ label: 'Rotura' });
    await page.getByLabel('Observación (opcional)').fill('Se rompió el broche al exhibirla');
    await shot(page, `${r}/12-ajuste-solicitud`);
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(page).toHaveURL(/\/inventario\/ajustes\/[0-9a-f-]{36}$/);
    adjustmentUrl = page.url();
    await shot(page, `${r}/13-ajuste-pendiente`);
  });
  await step('ajuste: rechazar (otro autorizador)', async () => {
    if (!adjustmentUrl) throw new Error('sin ajuste');
    await page.getByRole('button', { name: 'Rechazar ajuste' }).click();
    await page.getByLabel('Motivo del rechazo').fill('Primero verifique el estante');
    await shot(page, `${r}/14-ajuste-rechazar`);
    await page.getByRole('button', { name: 'Confirmar rechazo' }).click();
    await expect(page.getByRole('heading', { name: /Ajuste AJ-\d{6}/ })).toContainText('Rechazado');
    await shot(page, `${r}/15-ajuste-rechazado`);
  });

  // Conteo a ciegas de DEMO Aretes con segundo recuento.
  let countUrl = '';
  await step('conteo: crear e iniciar', async () => {
    await menu(page).getByRole('link', { name: 'Conteo físico' }).click();
    await page.getByLabel('Categoría a contar').selectOption({ label: 'DEMO Aretes' });
    await shot(page, `${r}/16-conteo-crear`);
    await page.getByRole('button', { name: 'Crear conteo' }).click();
    await expect(page).toHaveURL(/\/inventario\/conteos\/[0-9a-f-]{36}$/);
    countUrl = page.url();
    await shot(page, `${r}/17-conteo-borrador`);
    await page.getByRole('button', { name: 'Iniciar conteo' }).click();
    await expect(page.getByLabel('Código de la pieza')).toBeFocused();
  });
  await step('conteo: captura a ciegas', async () => {
    if (!countUrl) throw new Error('sin conteo');
    const rows = (await (
      await page.request.get('/api/v1/inventory?q=DEMO%20Arete&pageSize=100&level=all')
    ).json()) as { data: { sku: string; quantity: number }[] };
    const withStock = rows.data.filter((item) => item.quantity > 0).slice(0, 3);
    const input = page.getByLabel('Código de la pieza');
    for (const item of withStock) {
      await input.fill(item.sku);
      await Promise.all([
        page.waitForResponse((res) => res.url().includes('/scan')),
        input.press('Enter'),
      ]);
    }
    await input.fill('NOEXISTE-123');
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/scan')),
      input.press('Enter'),
    ]);
    await shot(page, `${r}/18-conteo-captura-a-ciegas`, true);
    await page.getByRole('button', { name: 'Cerrar conteo' }).click();
    await expect(page.getByRole('heading', { name: /Segundo recuento CNT-\d{6}/ })).toBeVisible();
    await shot(page, `${r}/19-conteo-segundo-recuento`, true);
    await page.getByRole('button', { name: 'Cerrar recuento' }).click();
    await expect(page.getByRole('heading', { name: /Revisión del conteo/ })).toBeVisible();
    await shot(page, `${r}/20-conteo-revision`, true);
  });

  // Caja y venta completa.
  await step('caja: abrir', async () => {
    await menu(page).getByRole('link', { name: 'Caja' }).click();
    await page.getByRole('button', { name: 'Abrir caja' }).click();
    const dialog = page.getByRole('dialog', { name: 'Abrir caja' });
    await dialog.getByLabel('Fondo inicial (Bs)').fill('100');
    await dialog.getByRole('button', { name: 'Abrir caja' }).click();
    await expect(page.getByText(/abierta con un fondo de/)).toBeVisible();
    await shot(page, `${r}/21-caja-abierta`);
  });
  await step('venta: lector y búsqueda', async () => {
    await menu(page).getByRole('link', { name: 'Punto de venta' }).click();
    await expect(page.getByLabel('Código de la pieza')).toBeFocused();
    await shot(page, `${r}/22-pos-vacio`);
    await scan(page, piece.sku);
    await expect(page.getByText(`Agregada: ${piece.name} (${piece.sku}).`)).toBeVisible();
    await shot(page, `${r}/23-pos-pieza-agregada`);
  });
  await step('venta: pago mixto, revisión y confirmación', async () => {
    await page.getByLabel('QR (Bs)').fill('50');
    await page.getByLabel('Referencia del QR (opcional)').fill('OP-1234');
    await page.getByLabel('Efectivo recibido (Bs)').fill('120');
    await expect(page.getByRole('status', { name: 'Estado del cobro' })).toContainText(/19,50/);
    await shot(page, `${r}/24-pos-pago-mixto`, true);
    await page.getByRole('button', { name: 'Revisar venta' }).click();
    await expect(
      page.getByRole('region', { name: 'Revise la venta antes de confirmar' }),
    ).toBeVisible();
    await shot(page, `${r}/25-pos-revision`, true);
    await page.getByRole('button', { name: 'Confirmar venta' }).click();
    await expect(page.getByRole('heading', { name: /^Venta VTA-\d{6} registrada$/ })).toBeVisible();
    await shot(page, `${r}/26-venta-registrada`);
  });
  await step('venta: comprobante e impresión', async () => {
    await page.getByRole('link', { name: 'Ver comprobante' }).click();
    await shot(page, `${r}/27-comprobante`);
    await page.getByRole('radio', { name: 'Rollo de 80 mm' }).check();
    await page.getByRole('button', { name: /^Imprimir comprobante de la venta VTA-/ }).click();
    await expect(page.getByText('Impresión del original registrada.')).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await shot(page, `${r}/28-comprobante-impresion`, true);
    await page.emulateMedia({ media: 'screen' });
  });
  await step('caja: cerrar con arqueo y diferencia', async () => {
    await menu(page).getByRole('link', { name: 'Caja' }).click();
    await shot(page, `${r}/29-caja-con-ventas`);
    await page.getByRole('link', { name: 'Cerrar caja' }).click();
    await page.getByLabel('Efectivo contado (Bs)').fill('195,50');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText(/Faltante de .*5,00/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar caja' }).click();
    await expect(page.getByRole('alert')).toContainText(/explique el motivo/);
    await shot(page, `${r}/30-caja-arqueo-diferencia`, true);
    await page.getByLabel(/Observación \(obligatoria/).fill('Faltan 5 Bs; se revisará el vuelto');
    await page.getByRole('button', { name: 'Cerrar caja' }).click();
    const confirm = page.getByRole('dialog', { name: '¿Cerrar la caja?' });
    await expect(confirm).toBeVisible();
    await shot(page, `${r}/31-caja-confirmar-cierre`);
    await confirm.getByRole('button', { name: 'Confirmar cierre' }).click();
    await expect(page.getByRole('heading', { name: /^Caja CAJ-\d{6} cerrada$/ })).toBeVisible();
    await shot(page, `${r}/32-caja-cerrada`);
  });
  await step('lo que no ve', async () => {
    await go(page, '/usuarios');
    await shot(page, `${r}/33-sin-permiso-usuarios`);
  });
});

// ─────────────────────────────────────────────────────────────── Vendedor
test('vendedor: recorrido completo', async ({ page, request }) => {
  test.setTimeout(600_000);
  await apiLogin(request, USERS.admin);
  await ensureCashClosed(request);
  const r = 'vendedor';
  const piece = await createPiece(request, `Pulsera tutorial ${SUFFIX}`, '80', 3);

  await login(page, USERS.vendedor);
  await step('inicio y menú reducido', async () => {
    await go(page, '/');
    await shot(page, `${r}/01-inicio`);
  });
  await step('sin caja abierta', async () => {
    await menu(page).getByRole('link', { name: 'Punto de venta' }).click();
    await expect(page.getByRole('alert')).toContainText('No hay caja abierta');
    await shot(page, `${r}/02-pos-sin-caja`);
  });
  await step('productos y ficha', async () => {
    await menu(page).getByRole('link', { name: 'Productos' }).click();
    await shot(page, `${r}/03-productos`);
    await page
      .getByRole('link', { name: /^Ver ficha de .*Solitario/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await shot(page, `${r}/04-ficha-producto`);
  });
  await step('saldos y movimientos', async () => {
    await menu(page).getByRole('link', { name: 'Saldos y alertas' }).click();
    await shot(page, `${r}/05-saldos`);
    await menu(page).getByRole('link', { name: 'Movimientos' }).click();
    await shot(page, `${r}/06-movimientos`);
  });

  await step('venta con búsqueda y efectivo', async () => {
    await openCash(request, '50');
    await go(page, '/ventas/nueva');
    await scan(page, piece.sku);
    await expect(page.getByRole('row', { name: new RegExp(piece.sku) })).toBeVisible();
    await page.getByLabel('Efectivo recibido (Bs)').fill('100');
    await expect(page.getByRole('status', { name: 'Estado del cobro' })).toContainText(/20,00/);
    await shot(page, `${r}/07-pos-venta-efectivo`);
    await page.getByRole('button', { name: 'Revisar venta' }).click();
    await shot(page, `${r}/08-pos-revision`);
    await page.getByRole('button', { name: 'Confirmar venta' }).click();
    await expect(page.getByRole('heading', { name: /^Venta VTA-\d{6} registrada$/ })).toBeVisible();
    await shot(page, `${r}/09-venta-registrada`);
  });
  await step('historial propio y reporte de incidencia', async () => {
    await menu(page).getByRole('link', { name: 'Historial de ventas' }).click();
    await shot(page, `${r}/10-mis-ventas`);
    await page
      .getByRole('link', { name: /^Abrir la venta VTA-/ })
      .first()
      .click();
    await shot(page, `${r}/11-venta-detalle`);
    await page.getByRole('button', { name: 'Reportar incidencia' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reportar incidencia' });
    await dialog.getByLabel('Tipo de incidencia').selectOption('WRONG_PAYMENT');
    await dialog.getByLabel('Qué pasó').fill('El cliente pagó por QR, no en efectivo');
    await shot(page, `${r}/12-incidencia-reportar`);
    await dialog.getByRole('button', { name: 'Reportar incidencia' }).click();
    await expect(page.getByText(/Incidencia INC-\d{6} registrada/)).toBeVisible();
    await shot(page, `${r}/13-incidencia-registrada`);
  });
  await step('sin permiso', async () => {
    await go(page, '/caja/historial');
    await expect(page.getByText('No tiene permiso para ver esta sección.')).toBeVisible();
    await shot(page, `${r}/14-sin-permiso`);
  });
  await step('celular: menú y punto de venta', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ventas/nueva');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await shot(page, `${r}/15-movil-pos`);
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await shot(page, `${r}/16-movil-menu`);
  });
  await ensureCashClosed(request);
});
