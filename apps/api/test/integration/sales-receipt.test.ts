/** Comprobante interno y reimpresión (plan 11 §4.5 V5/V6, §6.2; ADR-024). */
import { randomUUID } from 'node:crypto';
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, type Permission } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';
import {
  createSellableVariant,
  seedBusinessSettings,
  seedPaymentMethods,
} from '../helpers/sales.ts';

let app: App;
let seller: { userId: string; name: string; cookie: string };
let admin: { userId: string; name: string; cookie: string };
let saleId: string;
let variantId: string;

beforeEach(async () => {
  app = await buildTestApp();
  await resetDatabase(app.prisma);
  await seedPaymentMethods(app.prisma);
  await seedBusinessSettings(app.prisma);
  seller = await sessionWith([...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions]);
  admin = await sessionWith([...ALL_PERMISSIONS]);
  await post(admin.cookie, '/cash/sessions', { openingAmount: '100' });
  const variant = await createSellableVariant(app.prisma, {
    stock: 5,
    price: '120.00',
    cost: '45.5000',
    productName: 'Aretes Luna',
    label: 'Oro 18k',
  });
  variantId = variant.id;
  const sale = await post(seller.cookie, '/sales', {
    items: [{ variantId, quantity: 2, expectedUnitPrice: '120' }],
    payments: [
      { methodCode: 'CASH', amount: '40', tendered: '50' },
      { methodCode: 'QR', amount: '200', reference: 'QR-REF-1' },
    ],
    expectedTotal: '240',
  });
  expect(sale.statusCode).toBe(201);
  saleId = sale.json().data.id as string;
});
afterEach(() => app.close());

async function sessionWith(permissions: Permission[]) {
  const { user, password } = await createTestUser(app.prisma, { permissions });
  const { cookie } = await login(app, user.email, password);
  return { userId: user.id, name: user.name, cookie };
}

function post(cookie: string, url: string, payload: unknown) {
  return app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: { cookie, 'idempotency-key': randomUUID() },
    payload: payload as object,
  });
}

const receipt = (cookie: string, id = saleId) =>
  app.inject({ method: 'GET', url: `/api/v1/sales/${id}/receipt`, headers: { cookie } });
const printEvent = (cookie: string, format = 'A4', id = saleId) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/sales/${id}/receipt/print-events`,
    headers: { cookie },
    payload: { format },
  });

describe('comprobante interno', () => {
  it('devuelve los datos guardados, sin costos ni referencia de pago, y leerlo no escribe nada', async () => {
    const audits = await app.prisma.auditLog.count();
    const res = await receipt(seller.cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      saleId,
      number: 1,
      soldAt: expect.any(String),
      currency: 'BOB',
      items: [
        {
          sku: expect.any(String),
          productName: 'Aretes Luna',
          variantLabel: 'Oro 18k',
          quantity: 2,
          unitPrice: '120.00',
          lineTotal: '240.00',
        },
      ],
      total: '240.00',
      payments: [
        { methodName: 'Efectivo', amount: '40.00', tendered: '50.00', changeGiven: '10.00' },
        { methodName: 'QR', amount: '200.00', tendered: null, changeGiven: null },
      ],
      seller: null,
      business: { tradeName: 'Joyería Sole', address: null, phone: null, taxId: null },
      printCount: 0,
    });
    expect(res.body).not.toMatch(/45\.5|QR-REF-1|cost/i);
    expect(await app.prisma.auditLog.count()).toBe(audits);
    expect(await app.prisma.saleReceiptPrint.count()).toBe(0);
  });

  it('cambiar después precio, producto, etiqueta o nombre del medio no cambia el comprobante', async () => {
    const before = (await receipt(seller.cookie)).json().data;
    const variant = await app.prisma.productVariant.update({
      where: { id: variantId },
      data: { salePrice: '999.00', label: 'Otra etiqueta' },
    });
    await app.prisma.product.update({
      where: { id: variant.productId },
      data: { name: 'Renombrado' },
    });
    await app.prisma.paymentMethod.update({ where: { code: 'CASH' }, data: { name: 'Contado' } });
    expect((await receipt(seller.cookie)).json().data).toEqual(before);
  });

  it('primera impresión = original, segunda = copia; audita cada una con su formato', async () => {
    const first = await printEvent(seller.cookie, '80mm');
    expect(first.statusCode).toBe(201);
    expect(first.json().data).toEqual({
      copyNumber: 1,
      isCopy: false,
      printedAt: expect.any(String),
    });
    const second = await printEvent(seller.cookie, 'A4');
    expect(second.json().data).toMatchObject({ copyNumber: 2, isCopy: true });
    expect((await receipt(seller.cookie)).json().data.printCount).toBe(2);

    const audits = await app.prisma.auditLog.findMany({
      where: { action: 'sale.receipt_printed' },
      orderBy: { id: 'asc' },
    });
    expect(audits.map((a) => a.after)).toEqual([
      { format: '80mm', copyNumber: 1 },
      { format: 'A4', copyNumber: 2 },
    ]);
    expect(audits.every((a) => a.entityId === saleId && a.userId === seller.userId)).toBe(true);
    // La venta no cambió (imprimir no crea ni modifica ventas).
    expect(await app.prisma.sale.count()).toBe(1);
  });

  it('impresiones simultáneas reciben números de copia distintos', async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => printEvent(seller.cookie)));
    expect(results.map((r) => r.statusCode)).toEqual([201, 201, 201, 201]);
    expect(results.map((r) => r.json().data.copyNumber as number).sort()).toEqual([1, 2, 3, 4]);
  });

  it('muestra el vendedor solo si la configuración lo indica', async () => {
    await app.prisma.businessSettings.update({
      where: { id: 1 },
      data: { receiptShowSeller: true },
    });
    expect((await receipt(seller.cookie)).json().data.seller).toEqual({ name: seller.name });
  });

  it('401 sin sesión; 404 para una venta ajena o inexistente; 400 con formato inválido', async () => {
    expect(
      (await app.inject({ method: 'GET', url: `/api/v1/sales/${saleId}/receipt` })).statusCode,
    ).toBe(401);
    const other = await sessionWith([...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions]);
    expect((await receipt(other.cookie)).statusCode).toBe(404);
    expect((await printEvent(other.cookie)).statusCode).toBe(404);
    expect((await receipt(seller.cookie, randomUUID())).statusCode).toBe(404);
    expect((await printEvent(seller.cookie, 'carta')).statusCode).toBe(400);
    const extra = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/${saleId}/receipt/print-events`,
      headers: { cookie: seller.cookie },
      payload: { format: 'A4', copyNumber: 1 },
    });
    expect(extra.statusCode).toBe(400);
    expect(await app.prisma.saleReceiptPrint.count()).toBe(0);
    // Quien ve todas las ventas sí accede.
    expect((await receipt(admin.cookie)).statusCode).toBe(200);
  });
});
