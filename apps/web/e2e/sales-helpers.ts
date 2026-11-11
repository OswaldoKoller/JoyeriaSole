import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Ayudas de los E2E de ventas y caja. Los datos se crean por la API como Administrador (un
 * `APIRequestContext` propio, con su cookie) y la interfaz se usa con el rol de cada prueba.
 * Cada prueba crea sus propias piezas (no vende las DEMO, de las que dependen otras pruebas) y
 * deja la caja cerrada: hay una sola caja y todas las pruebas comparten la base de datos.
 */
export const PASSWORD = process.env.DEMO_USER_PASSWORD ?? '';

export const USERS = {
  admin: 'demo-admin@example.invalid',
  inventario: 'demo-inventario@example.invalid',
  vendedor: 'demo-vendedor@example.invalid',
};

export const SUFFIX = String(Date.now()).slice(-6);

export const menu = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' });

export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(menu(page)).toBeVisible();
}

/** Inicia sesión en un contexto de API (la cookie queda en ese contexto). */
export async function apiLogin(api: APIRequestContext, email: string) {
  const response = await api.post('/api/v1/auth/login', { data: { email, password: PASSWORD } });
  expect(response.ok(), `login de ${email}`).toBe(true);
}

const withKey = () => ({ 'Idempotency-Key': randomUUID() });

interface CashSession {
  id: string;
  number: number;
  liveExpectedCash: string | null;
}

/** Cierra la caja si quedó abierta (contado = esperado, sin diferencia). */
export async function ensureCashClosed(api: APIRequestContext) {
  const status = (await (await api.get('/api/v1/cash/status')).json()) as {
    data: { open: boolean };
  };
  if (!status.data.open) return;
  const current = (await (await api.get('/api/v1/cash/sessions/current')).json()) as {
    data: CashSession;
  };
  const closed = await api.post(`/api/v1/cash/sessions/${current.data.id}/close`, {
    data: { countedCash: current.data.liveExpectedCash ?? '0' },
    headers: withKey(),
  });
  expect(closed.ok(), 'cierre de la caja abierta').toBe(true);
}

export async function openCash(api: APIRequestContext, openingAmount = '100') {
  const response = await api.post('/api/v1/cash/sessions', {
    data: { openingAmount },
    headers: withKey(),
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { data: CashSession }).data;
}

export async function closeCash(api: APIRequestContext, sessionId: string, countedCash: string) {
  const response = await api.post(`/api/v1/cash/sessions/${sessionId}/close`, {
    data: { countedCash, notes: 'Cierre E2E' },
    headers: withKey(),
  });
  expect(response.ok()).toBe(true);
}

export interface Piece {
  variantId: string;
  sku: string;
  name: string;
  price: string;
}

/** Pieza propia de la prueba: producto en «DEMO Anillos», precio aplicado y stock inicial. */
export async function createPiece(
  api: APIRequestContext,
  name: string,
  price: string,
  stock: number,
): Promise<Piece> {
  const categories = (await (await api.get('/api/v1/categories')).json()) as {
    data: { id: string; name: string }[];
  };
  const categoryId = categories.data.find((item) => item.name === 'DEMO Anillos')?.id;
  expect(categoryId).toBeTruthy();
  const created = await api.post('/api/v1/products', { data: { categoryId, name } });
  expect(created.status()).toBe(201);
  const variant = ((await created.json()) as { data: { variants: { id: string; sku: string }[] } })
    .data.variants[0];
  if (!variant) throw new Error('El producto no tiene variante');
  const priced = await api.post('/api/v1/pricing/apply', {
    data: { items: [{ variantId: variant.id, newPrice: price }], reason: 'Precio de prueba E2E' },
  });
  expect(priced.status()).toBe(201);
  const stocked = await api.post(`/api/v1/inventory/${variant.id}/initial`, {
    data: { quantity: stock, reason: 'Carga inicial de prueba E2E' },
  });
  expect(stocked.status()).toBe(201);
  return { variantId: variant.id, sku: variant.sku, name, price };
}

/** Venta por la API (efectivo exacto), para preparar datos de otro usuario. */
export async function sellViaApi(api: APIRequestContext, piece: Piece) {
  const response = await api.post('/api/v1/sales', {
    data: {
      items: [{ variantId: piece.variantId, quantity: 1, expectedUnitPrice: piece.price }],
      payments: [{ methodCode: 'CASH', amount: piece.price, tendered: piece.price }],
      expectedTotal: piece.price,
    },
    headers: withKey(),
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { data: { id: string; number: number; total: string } }).data;
}

export async function stockOf(api: APIRequestContext, sku: string): Promise<number> {
  const response = await api.get(`/api/v1/inventory?q=${encodeURIComponent(sku)}&pageSize=10`);
  expect(response.ok()).toBe(true);
  const rows = ((await response.json()) as { data: { sku: string; quantity: number }[] }).data;
  const row = rows.find((item) => item.sku === sku);
  if (!row) throw new Error(`Sin saldo para ${sku}`);
  return row.quantity;
}

/** Escanea como un lector de códigos: escribe el código y pulsa Enter. */
export async function scan(page: Page, code: string) {
  const field = page.getByLabel('Código de la pieza');
  await field.pressSequentially(code);
  await field.press('Enter');
}

/** Formato de número de venta (D-03): 123 → «VTA-000123». */
export function saleLabel(number: number) {
  return `VTA-${String(number).padStart(6, '0')}`;
}
