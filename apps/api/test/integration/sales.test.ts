/**
 * Venta de mostrador (plan 11 §4.5, §6.2): permisos, validación, pagos, stock por el libro,
 * auditoría, visibilidad y ausencia de costos. Una venta confirmada no se anula (DEC-V07).
 */
import { randomUUID } from 'node:crypto';
import diagnosticsChannel from 'node:diagnostics_channel';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  ERROR_CODES,
  REFERENCE_TYPES,
  todayInLaPaz,
  type Permission,
} from '@joyeria/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildApp } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';
import { createSellableVariant, balanceOf, seedPaymentMethods } from '../helpers/sales.ts';
import { testEnv } from '../helpers/test-env.ts';

const SALES = '/api/v1/sales';
const MANAGER = [...DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions];
const SELLER = [...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions];

let app: App;
beforeEach(async () => {
  app = await buildTestApp();
  await resetDatabase(app.prisma);
  await seedPaymentMethods(app.prisma);
});
afterEach(() => app.close());

async function sessionWith(permissions: Permission[]) {
  const { user, password } = await createTestUser(app.prisma, { permissions });
  const { cookie } = await login(app, user.email, password);
  return { user, cookie };
}

function sell(cookie: string, payload: unknown, key: string | null = randomUUID()) {
  return app.inject({
    method: 'POST',
    url: SALES,
    headers: { cookie, ...(key && { 'idempotency-key': key }) },
    payload: payload as object,
  });
}

const get = (url: string, cookie: string) =>
  app.inject({ method: 'GET', url, headers: { cookie } });

async function openCash(cookie: string, openingAmount = '100') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/cash/sessions',
    headers: { cookie, 'idempotency-key': randomUUID() },
    payload: { openingAmount },
  });
  expect(res.statusCode).toBe(201);
  return res.json().data as { id: string; number: number };
}

/** Cuerpo de una venta de una línea pagada en efectivo. */
function cashSale(variantId: string, quantity = 1, price = '150.00', tendered?: string) {
  const total = (Number(price) * quantity).toFixed(2);
  return {
    items: [{ variantId, quantity, expectedUnitPrice: price }],
    payments: [{ methodCode: 'CASH', amount: total, tendered: tendered ?? total }],
    expectedTotal: total,
  };
}

/** Recorre un objeto JSON y devuelve las claves que mencionan costos. */
function costKeys(value: unknown, path = ''): string[] {
  if (Array.isArray(value))
    return value.flatMap((item, i) => costKeys(item, `${path}[${String(i)}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => [
      ...(/cost/i.test(key) ? [`${path}.${key}`] : []),
      ...costKeys(item, `${path}.${key}`),
    ]);
  }
  return [];
}

describe('permisos y validación', () => {
  it('401 sin sesión y 403 sin el permiso', async () => {
    const reader = await sessionWith(SELLER.filter((p) => !p.startsWith('sales')));
    const variant = await createSellableVariant(app.prisma, { stock: 2 });
    const anonymous = await app.inject({
      method: 'POST',
      url: SALES,
      payload: cashSale(variant.id),
    });
    expect(anonymous.statusCode).toBe(401);
    for (const url of [SALES, `${SALES}/${randomUUID()}`, '/api/v1/payment-methods']) {
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(401);
    }
    expect((await sell(reader.cookie, cashSale(variant.id))).statusCode).toBe(403);
    expect((await get(SALES, reader.cookie)).statusCode).toBe(403);
    expect((await get('/api/v1/payment-methods', reader.cookie)).statusCode).toBe(403);
  });

  it('400 sin Idempotency-Key, con claves extra, cantidad 0, variante repetida o efectivo recibido en QR', async () => {
    const seller = await sessionWith(SELLER);
    const manager = await sessionWith(MANAGER);
    await openCash(manager.cookie);
    const variant = await createSellableVariant(app.prisma, { stock: 3 });
    const base = cashSale(variant.id);

    const noKey = await sell(seller.cookie, base, null);
    expect(noKey.statusCode).toBe(400);
    expect(noKey.json().error.code).toBe(ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED);
    for (const payload of [
      { ...base, discount: '10' },
      { ...base, items: [{ ...base.items[0], quantity: 0 }] },
      { ...base, items: [base.items[0], base.items[0]] },
      { ...base, items: [{ ...base.items[0], unitCost: '1' }] },
      { ...base, payments: [{ methodCode: 'QR', amount: '150.00', tendered: '150.00' }] },
      { ...base, payments: [{ methodCode: 'CARD', amount: '150.00' }] },
      { ...base, items: [] },
      { ...base, soldAt: new Date().toISOString() },
    ]) {
      const res = await sell(seller.cookie, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(await app.prisma.sale.count()).toBe(0);
    expect(await balanceOf(app.prisma, variant.id)).toBe(3);
  });

  it('lista los medios de pago activos en orden', async () => {
    const seller = await sessionWith(SELLER);
    const res = await get('/api/v1/payment-methods', seller.cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([
      { code: 'CASH', name: 'Efectivo', isCash: true },
      { code: 'QR', name: 'QR', isCash: false },
      { code: 'BANK_TRANSFER', name: 'Transferencia', isCash: false },
    ]);
  });
});

describe('confirmación de la venta', () => {
  it('efectivo con vuelto: descuenta el stock con un movimiento SALE, guarda snapshots y audita', async () => {
    const seller = await sessionWith(SELLER);
    const manager = await sessionWith(MANAGER);
    const session = await openCash(manager.cookie);
    const variant = await createSellableVariant(app.prisma, {
      stock: 5,
      price: '150.00',
      cost: '61.2345',
    });

    const res = await sell(seller.cookie, cashSale(variant.id, 2, '150.00', '500'));
    expect(res.statusCode).toBe(201);
    const sale = res.json().data;
    expect(sale).toEqual({
      id: expect.any(String),
      number: 1,
      soldAt: expect.any(String),
      sellerId: seller.user.id,
      sellerName: seller.user.name,
      total: '300.00',
      itemsCount: 1,
      paymentMethods: ['CASH'],
      cashSessionId: session.id,
      cashSessionNumber: session.number,
      items: [
        {
          variantId: variant.id,
          sku: variant.sku,
          productName: expect.any(String),
          variantLabel: 'Plata 925 / Talla 16',
          quantity: 2,
          unitPrice: '150.00',
          lineTotal: '300.00',
        },
      ],
      payments: [
        {
          methodCode: 'CASH',
          methodName: 'Efectivo',
          amount: '300.00',
          tendered: '500.00',
          changeGiven: '200.00',
          reference: null,
        },
      ],
      changeGiven: '200.00',
      receiptPrints: 0,
    });

    expect(await balanceOf(app.prisma, variant.id)).toBe(3);
    const movement = await app.prisma.inventoryMovement.findFirstOrThrow({
      where: { type: 'SALE' },
    });
    expect(movement).toMatchObject({
      variantId: variant.id,
      quantity: -2,
      balanceBefore: 5,
      balanceAfter: 3,
      referenceType: REFERENCE_TYPES.SALE,
      referenceId: sale.id,
      userId: seller.user.id,
    });
    expect(movement.unitCost?.toFixed(4)).toBe('61.2345');
    const item = await app.prisma.saleItem.findFirstOrThrow({ where: { saleId: sale.id } });
    expect(item.movementId).toBe(movement.id);
    expect(item.unitCostSnapshot.toFixed(4)).toBe('61.2345');

    const audit = await app.prisma.auditLog.findFirstOrThrow({ where: { action: 'sale.created' } });
    expect(audit).toMatchObject({ entityType: 'Sale', entityId: sale.id, userId: seller.user.id });
    expect(audit.after).toMatchObject({
      number: 1,
      total: '300.00',
      cashSessionId: session.id,
      items: [{ variantId: variant.id, quantity: 2, movementId: movement.id.toString() }],
      payments: [
        { methodCode: 'CASH', amount: '300.00', tendered: '500.00', changeGiven: '200.00' },
      ],
    });
    expect(costKeys(audit.after)).toEqual([]);
  });

  it('QR, transferencia y pago mixto con referencia', async () => {
    const seller = await sessionWith(SELLER);
    const manager = await sessionWith(MANAGER);
    await openCash(manager.cookie);
    const variant = await createSellableVariant(app.prisma, { stock: 10, price: '80.00' });
    const line = { variantId: variant.id, quantity: 1, expectedUnitPrice: '80.00' };

    const qr = await sell(seller.cookie, {
      items: [line],
      payments: [{ methodCode: 'QR', amount: '80', reference: 'QR-123' }],
      expectedTotal: '80',
    });
    expect(qr.statusCode).toBe(201);
    expect(qr.json().data.payments).toEqual([
      {
        methodCode: 'QR',
        methodName: 'QR',
        amount: '80.00',
        tendered: null,
        changeGiven: null,
        reference: 'QR-123',
      },
    ]);
    const transfer = await sell(seller.cookie, {
      items: [line],
      payments: [{ methodCode: 'BANK_TRANSFER', amount: '80.00' }],
      expectedTotal: '80.00',
    });
    expect(transfer.statusCode).toBe(201);

    const mixed = await sell(seller.cookie, {
      items: [{ ...line, quantity: 2 }],
      payments: [
        { methodCode: 'CASH', amount: '30', tendered: '50' },
        { methodCode: 'QR', amount: '100' },
        { methodCode: 'BANK_TRANSFER', amount: '30' },
      ],
      expectedTotal: '160',
    });
    expect(mixed.statusCode).toBe(201);
    expect(mixed.json().data).toMatchObject({
      total: '160.00',
      paymentMethods: ['CASH', 'QR', 'BANK_TRANSFER'],
      changeGiven: '20.00',
    });
    expect(await balanceOf(app.prisma, variant.id)).toBe(6);
    expect(
      (await app.prisma.sale.findMany({ select: { number: true } })).map((s) => s.number).sort(),
    ).toEqual([1, 2, 3]);
  });

  it('pago que no cuadra (falta, sobra, QR mayor que el total, recibido menor) → 422 sin efectos', async () => {
    const seller = await sessionWith(SELLER);
    const manager = await sessionWith(MANAGER);
    await openCash(manager.cookie);
    const variant = await createSellableVariant(app.prisma, { stock: 2, price: '100.00' });
    const items = [{ variantId: variant.id, quantity: 1, expectedUnitPrice: '100' }];
    const audits = await app.prisma.auditLog.count();
    for (const payments of [
      [{ methodCode: 'CASH', amount: '90', tendered: '90' }],
      [{ methodCode: 'CASH', amount: '110', tendered: '110' }],
      [{ methodCode: 'QR', amount: '120' }],
      [
        { methodCode: 'QR', amount: '60' },
        { methodCode: 'CASH', amount: '60', tendered: '60' },
      ],
      [{ methodCode: 'CASH', amount: '100', tendered: '50' }],
    ]) {
      const res = await sell(seller.cookie, { items, payments, expectedTotal: '100' });
      expect(res.statusCode, JSON.stringify(payments)).toBe(422);
      expect(res.json().error).toMatchObject({
        code: ERROR_CODES.PAYMENT_MISMATCH,
        details: { total: '100.00' },
      });
    }
    expect(await app.prisma.sale.count()).toBe(0);
    expect(await app.prisma.inventoryMovement.count({ where: { type: 'SALE' } })).toBe(0);
    expect(await balanceOf(app.prisma, variant.id)).toBe(2);
    expect(await app.prisma.auditLog.count()).toBe(audits);
  });

  it('sin caja abierta → 422 CASH_SESSION_REQUIRED sin efectos', async () => {
    const seller = await sessionWith(SELLER);
    const variant = await createSellableVariant(app.prisma, { stock: 2 });
    const res = await sell(seller.cookie, cashSale(variant.id));
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe(ERROR_CODES.CASH_SESSION_REQUIRED);
    expect(await app.prisma.sale.count()).toBe(0);
    expect(await balanceOf(app.prisma, variant.id)).toBe(2);
  });

  it('sin stock, variante o producto inactivo, sin precio y precio cambiado → 422/409 sin efectos', async () => {
    const seller = await sessionWith(SELLER);
    const manager = await sessionWith(MANAGER);
    await openCash(manager.cookie);

    const scarce = await createSellableVariant(app.prisma, { stock: 1 });
    const noStock = await sell(seller.cookie, cashSale(scarce.id, 2));
    expect(noStock.statusCode).toBe(422);
    expect(noStock.json().error).toMatchObject({
      code: ERROR_CODES.INSUFFICIENT_STOCK,
      details: { items: [{ variantId: scarce.id, sku: scarce.sku, available: 1, requested: 2 }] },
    });

    const inactive = await createSellableVariant(app.prisma, { stock: 0 });
    await app.prisma.productVariant.update({
      where: { id: inactive.id },
      data: { status: 'INACTIVE' },
    });
    const inactiveProduct = await createSellableVariant(app.prisma, { stock: 2 });
    const unpriced = await createSellableVariant(app.prisma, { stock: 2, price: '0' });
    for (const [variantId, reason] of [
      [inactive.id, 'INACTIVE'],
      [unpriced.id, 'NO_PRICE'],
      [randomUUID(), 'NOT_FOUND'],
    ] as const) {
      const res = await sell(seller.cookie, cashSale(variantId));
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toMatchObject({
        code: ERROR_CODES.VARIANT_NOT_SELLABLE,
        details: { items: [{ variantId, reason }] },
      });
    }

    // Un producto inactivo (con su variante activa) tampoco se vende.
    const product = await app.prisma.productVariant.findUniqueOrThrow({
      where: { id: inactiveProduct.id },
      select: { productId: true },
    });
    await app.prisma
      .$executeRaw`UPDATE products SET status = 'INACTIVE' WHERE id = ${product.productId}::uuid`;
    expect((await sell(seller.cookie, cashSale(inactiveProduct.id))).json().error.code).toBe(
      ERROR_CODES.VARIANT_NOT_SELLABLE,
    );

    const repriced = await createSellableVariant(app.prisma, { stock: 2, price: '150.00' });
    await app.prisma.productVariant.update({
      where: { id: repriced.id },
      data: { salePrice: '175.00' },
    });
    const changed = await sell(seller.cookie, cashSale(repriced.id));
    expect(changed.statusCode).toBe(409);
    expect(changed.json().error).toMatchObject({
      code: ERROR_CODES.PRICE_CHANGED,
      details: {
        items: [
          { variantId: repriced.id, expectedUnitPrice: '150.00', currentUnitPrice: '175.00' },
        ],
        currentTotal: '175.00',
      },
    });

    expect(await app.prisma.sale.count()).toBe(0);
    expect(await app.prisma.inventoryMovement.count({ where: { type: 'SALE' } })).toBe(0);
  });
});

describe('consulta, visibilidad y costos', () => {
  it('ninguna respuesta de ventas contiene claves de costo (Vendedor, Responsable y Administrador)', async () => {
    const seller = await sessionWith(SELLER);
    const manager = await sessionWith(MANAGER);
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    await openCash(manager.cookie);
    const variant = await createSellableVariant(app.prisma, { stock: 9, cost: '77.7777' });
    const created = [];
    for (const actor of [seller, manager, admin]) {
      const res = await sell(actor.cookie, cashSale(variant.id));
      expect(res.statusCode).toBe(201);
      created.push(res.json().data.id as string);
    }
    for (const actor of [seller, manager, admin]) {
      const responses = [
        await get(SALES, actor.cookie),
        ...(await Promise.all(created.map((id) => get(`${SALES}/${id}`, actor.cookie)))),
      ];
      for (const res of responses) {
        expect(res.body).not.toContain('77.7777');
        if (res.statusCode === 200) expect(costKeys(res.json())).toEqual([]);
      }
    }
  });

  it('el Vendedor solo ve sus ventas (ajenas → 404); quien tiene sales:read-all ve todas y filtra', async () => {
    const sellerA = await sessionWith(SELLER);
    const sellerB = await sessionWith(SELLER);
    const manager = await sessionWith(MANAGER);
    const session = await openCash(manager.cookie);
    const variant = await createSellableVariant(app.prisma, { stock: 9 });
    const saleA = (await sell(sellerA.cookie, cashSale(variant.id))).json().data;
    const saleB = (
      await sell(sellerB.cookie, {
        items: [{ variantId: variant.id, quantity: 1, expectedUnitPrice: '150.00' }],
        payments: [{ methodCode: 'QR', amount: '150.00' }],
        expectedTotal: '150.00',
      })
    ).json().data;

    expect((await get(`${SALES}/${saleB.id}`, sellerA.cookie)).statusCode).toBe(404);
    expect((await get(`${SALES}/${randomUUID()}`, sellerA.cookie)).statusCode).toBe(404);
    expect((await get(`${SALES}/${saleA.id}`, sellerA.cookie)).statusCode).toBe(200);
    const own = (await get(SALES, sellerA.cookie)).json();
    expect(own.data.map((s: { id: string }) => s.id)).toEqual([saleA.id]);
    expect(
      (await get(`${SALES}?sellerId=${sellerB.user.id}`, sellerA.cookie)).json(),
    ).toMatchObject({
      data: [],
      meta: { total: 0 },
    });

    const all = (await get(SALES, manager.cookie)).json();
    expect(all.meta.total).toBe(2);
    expect(all.data.map((s: { number: number }) => s.number)).toEqual([2, 1]);
    expect(
      (await get(`${SALES}?sellerId=${sellerB.user.id}`, manager.cookie)).json().data,
    ).toHaveLength(1);
    expect((await get(`${SALES}?methodCode=QR`, manager.cookie)).json().data[0].id).toBe(saleB.id);
    expect((await get(`${SALES}?number=1`, manager.cookie)).json().data[0].id).toBe(saleA.id);
    expect(
      (await get(`${SALES}?cashSessionId=${session.id}`, manager.cookie)).json().meta.total,
    ).toBe(2);
    const today = todayInLaPaz();
    expect(
      (await get(`${SALES}?from=2000-01-01&to=2000-01-02`, manager.cookie)).json().meta.total,
    ).toBe(0);
    expect(
      (await get(`${SALES}?from=${today}&to=${today}`, manager.cookie)).json().meta.total,
    ).toBe(2);
    expect((await get(`${SALES}?pageSize=101`, manager.cookie)).statusCode).toBe(400);
    expect((await get(`${SALES}?extra=1`, manager.cookie)).statusCode).toBe(400);
  });
});

describe('sin rutas de anulación ni edición (DEC-V07)', () => {
  it('la tabla de rutas no tiene PATCH, PUT ni DELETE de ventas, caja o incidencias, ni rutas de reversión', async () => {
    const routes: string[] = [];
    const onInit = (message: unknown) => {
      const { fastify } = message as { fastify: FastifyInstance };
      fastify.addHook('onRoute', (route) => {
        for (const method of [route.method].flat())
          routes.push(`${method.toUpperCase()} ${route.url}`);
      });
    };
    diagnosticsChannel.subscribe('fastify.initialization', onInit);
    const probe = await buildApp(testEnv());
    try {
      await probe.ready();
    } finally {
      diagnosticsChannel.unsubscribe('fastify.initialization', onInit);
      await probe.close();
    }
    const ours = routes.filter((route) =>
      /\/api\/v1\/(sales|cash|sale-incidents|payment-methods)\b/.test(route),
    );
    expect(ours.length).toBeGreaterThan(8);
    expect(ours.filter((route) => /^(PATCH|PUT|DELETE) /.test(route))).toEqual([]);
    expect(ours.filter((route) => /void|cancel|refund|reverse|reopen|return/i.test(route))).toEqual(
      [],
    );
  });
});
