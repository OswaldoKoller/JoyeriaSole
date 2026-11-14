import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { PASSWORD, SUFFIX, USERS, apiLogin, createPiece, login } from './sales-helpers.ts';

/**
 * Reportes mínimos CSV (P-44, D1): el Administrador exporta Saldos y Movimientos desde la
 * pantalla y se verifica el CONTENIDO del archivo descargado (BOM, separador, filtros, fórmulas
 * neutralizadas, costos); el Vendedor descarga sin ninguna columna de costo.
 * La pieza de la prueba lleva un nombre con carga de fórmula (`=cmd|…`). Corre tras `s10-audit`
 * (orden alfabético): solo agrega filas de auditoría y una pieza propia.
 */
test.skip(!PASSWORD, 'Definir DEMO_USER_PASSWORD (npm run qa lo genera)');
test.describe.configure({ mode: 'serial' });

const FORMULA_NAME = `=cmd|' /C calc'!A0 ${SUFFIX}`;
let sku = '';

/** Descarga el CSV al pulsar «Exportar CSV» y devuelve nombre y texto crudo (con BOM). */
async function exportCsv(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar CSV' }).click(),
  ]);
  const path = await download.path();
  const bytes = await readFile(path);
  return { name: download.suggestedFilename(), bytes, text: bytes.toString('utf8') };
}

const rows = (text: string) =>
  text
    .replace(/^\uFEFF/, '')
    .split('\r\n')
    .filter((line) => line.length > 0)
    .map((line) => line.split(';'));

async function searchInventory(page: Page, term: string) {
  await page.goto('/inventario');
  await page.getByLabel('Buscar por producto, SKU o código').fill(term);
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/api/v1/inventory?') && response.url().includes('q='),
    ),
    page.getByRole('button', { name: 'Buscar' }).click(),
  ]);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}

test('el Administrador exporta Saldos con costos, filtrado y con la fórmula neutralizada', async ({
  page,
  request,
}) => {
  await apiLogin(request, USERS.admin);
  sku = (await createPiece(request, FORMULA_NAME, '100', 3)).sku;

  await login(page, USERS.admin);
  await searchInventory(page, sku);
  await expect(page.getByText('Incluye costo y valor a costo vigente')).toBeVisible();
  const file = await exportCsv(page);

  expect(file.name).toMatch(/^inventario-\d{4}-\d{2}-\d{2}\.csv$/);
  // UTF-8 con BOM (EF BB BF) para que Excel reconozca los acentos.
  expect([...file.bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const [header, ...data] = rows(file.text);
  expect(header).toEqual([
    'SKU',
    'Código de barras',
    'Producto',
    'Variante / atributos',
    'Categoría',
    'Saldo',
    'Stock mínimo',
    'Nivel de stock',
    'Estado de la variante',
    'Costo unitario vigente (Bs)',
    'Valor a costo vigente (Bs)',
  ]);
  // Respeta la búsqueda: solo la pieza de la prueba.
  expect(data).toHaveLength(1);
  const row = data[0] ?? [];
  expect(row[0]).toBe(sku);
  // Producto con apóstrofe inicial: Excel lo muestra como texto, nunca lo ejecuta.
  expect(row[2]).toBe(`'${FORMULA_NAME}`);
  expect(row[4]).toBe('DEMO Anillos');
  expect(row[5]).toBe('3');
  expect(row[8]).toBe('Activa');
  expect(row[9]).toMatch(/^\d+\.\d{4}$/);
  expect(row[10]).toMatch(/^\d+\.\d{2}$/);
  expect(file.text).not.toContain(`;${FORMULA_NAME}`);

  // La exportación quedó en la auditoría con quién, filtros y filas.
  const audit = await page.request.get('/api/v1/audit?action=inventory.export_balances');
  expect(audit.ok()).toBe(true);
  const entries = ((await audit.json()) as { data: { action: string }[] }).data;
  expect(entries.length).toBeGreaterThan(0);
});

test('el Administrador exporta Movimientos con los filtros de la pantalla', async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto('/inventario/movimientos');
  await page.getByLabel('Tipo de movimiento').selectOption('INITIAL_STOCK');
  await expect(page.getByRole('button', { name: 'Limpiar filtros' })).toBeVisible();
  const file = await exportCsv(page);

  expect(file.name).toMatch(/^movimientos-\d{4}-\d{2}-\d{2}\.csv$/);
  expect([...file.bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const [header, ...data] = rows(file.text);
  expect(header).toContain('Cantidad (con signo)');
  expect(header).not.toContain('Costo');
  expect(data.length).toBeGreaterThan(0);
  // Solo «Stock inicial», y la pieza recién cargada aparece (nombre neutralizado).
  expect(new Set(data.map((row) => row[3]))).toEqual(new Set(['INITIAL_STOCK']));
  const mine = data.find((row) => row[4] === sku);
  expect(mine?.[5]).toBe(`'${FORMULA_NAME}`);
  expect(mine?.[7]).toBe('3');
});

test('el Vendedor exporta sin columnas de costo ni valor', async ({ page }) => {
  await login(page, USERS.vendedor);
  await searchInventory(page, sku);
  await expect(page.getByText(/costo/i)).toHaveCount(0);
  const file = await exportCsv(page);

  const [header, ...data] = rows(file.text);
  expect(header).toHaveLength(9);
  expect(file.text).not.toMatch(/costo|valor/i);
  expect(data.map((row) => row[0])).toEqual([sku]);

  // Tampoco por la API con parámetros que intenten activarlos.
  const forced = await page.request.get(`/api/v1/inventory/export.csv?includeCosts=true&q=${sku}`);
  expect(forced.ok()).toBe(true);
  expect(await forced.text()).not.toMatch(/costo|valor/i);
});
