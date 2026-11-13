/** Idempotencia de la confirmación de venta (plan 11 §4.3, §6.2). La clave es OBLIGATORIA. */
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_ROLE_PERMISSIONS,
  ERROR_CODES,
  IDEMPOTENT_REPLAY_HEADER,
  type Permission,
} from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';
import { balanceOf, createSellableVariant, seedPaymentMethods } from '../helpers/sales.ts';

let app: App;
let seller: { userId: string; cookie: string };
let managerCookie: string;
let variantId: string;

beforeEach(async () => {
  app = await buildTestApp();
  await resetDatabase(app.prisma);
  await seedPaymentMethods(app.prisma);
  seller = await sessionWith([...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions]);
  managerCookie = (await sessionWith([...DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions]))
    .cookie;
  const opened = await app.inject({
    method: 'POST',
    url: '/api/v1/cash/sessions',
    headers: { cookie: managerCookie, 'idempotency-key': randomUUID() },
    payload: { openingAmount: '100' },
  });
  expect(opened.statusCode).toBe(201);
  variantId = (await createSellableVariant(app.prisma, { stock: 5, price: '150.00' })).id;
});
afterEach(() => app.close());

async function sessionWith(permissions: Permission[]) {
  const { user, password } = await createTestUser(app.prisma, { permissions });
  const { cookie } = await login(app, user.email, password);
  return { userId: user.id, cookie };
}

const body = (quantity = 1) => ({
  items: [{ variantId, quantity, expectedUnitPrice: '150.00' }],
  payments: [{ methodCode: 'CASH', amount: (150 * quantity).toFixed(2), tendered: '500' }],
  expectedTotal: (150 * quantity).toFixed(2),
});

function sell(cookie: string, payload: unknown, key: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/sales',
    headers: { cookie, 'idempotency-key': key },
    payload: payload as object,
  });
}

async function effects() {
  return {
    sales: await app.prisma.sale.count(),
    movements: await app.prisma.inventoryMovement.count({ where: { type: 'SALE' } }),
    audits: await app.prisma.auditLog.count({ where: { action: 'sale.created' } }),
    balance: await balanceOf(app.prisma, variantId),
  };
}

describe('idempotencia de la venta', () => {
  it('misma clave y cuerpo: una sola venta, un solo descuento y la misma respuesta (200 + Idempotent-Replay)', async () => {
    const key = randomUUID();
    const first = await sell(seller.cookie, body(2), key);
    const second = await sell(seller.cookie, body(2), key);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.headers[IDEMPOTENT_REPLAY_HEADER.toLowerCase()]).toBe('true');
    expect(second.json().data).toEqual(first.json().data);
    expect(await effects()).toEqual({ sales: 1, movements: 1, audits: 1, balance: 3 });
  });

  it('misma clave con otro cuerpo u otro usuario: 409 IDEMPOTENCY_KEY_REUSED sin efectos', async () => {
    const key = randomUUID();
    expect((await sell(seller.cookie, body(1), key)).statusCode).toBe(201);
    const otherBody = await sell(seller.cookie, body(2), key);
    expect(otherBody.statusCode).toBe(409);
    expect(otherBody.json().error.code).toBe(ERROR_CODES.IDEMPOTENCY_KEY_REUSED);
    const otherUser = await sell(managerCookie, body(1), key);
    expect(otherUser.statusCode).toBe(409);
    expect(otherUser.json().error.code).toBe(ERROR_CODES.IDEMPOTENCY_KEY_REUSED);
    expect(await effects()).toEqual({ sales: 1, movements: 1, audits: 1, balance: 4 });
  });

  it('dos envíos simultáneos idénticos: una sola venta', async () => {
    const key = randomUUID();
    const results = await Promise.all([
      sell(seller.cookie, body(1), key),
      sell(seller.cookie, body(1), key),
      sell(seller.cookie, body(1), key),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 200, 201]);
    const ids = new Set(results.map((r) => r.json().data.id as string));
    expect(ids.size).toBe(1);
    expect(await effects()).toEqual({ sales: 1, movements: 1, audits: 1, balance: 4 });
  });

  it('el reintento DESPUÉS de cerrar la caja de una venta ya confirmada responde 200, no 422', async () => {
    const key = randomUUID();
    const first = await sell(seller.cookie, body(1), key);
    expect(first.statusCode).toBe(201);
    const sessionId = first.json().data.cashSessionId as string;
    const closed = await app.inject({
      method: 'POST',
      url: `/api/v1/cash/sessions/${sessionId}/close`,
      headers: { cookie: managerCookie, 'idempotency-key': randomUUID() },
      payload: { countedCash: '250' },
    });
    expect(closed.statusCode).toBe(200);
    const retry = await sell(seller.cookie, body(1), key);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data).toEqual(first.json().data);
    // Una venta NUEVA sí recibe 422.
    const fresh = await sell(seller.cookie, body(1), randomUUID());
    expect(fresh.statusCode).toBe(422);
    expect(fresh.json().error.code).toBe(ERROR_CODES.CASH_SESSION_REQUIRED);
  });

  it('con la clave genérica vencida, la columna de dominio sigue garantizando la repetición', async () => {
    const key = randomUUID();
    const first = await sell(seller.cookie, body(1), key);
    await app.prisma.idempotencyKey.update({
      where: { key },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const retry = await sell(seller.cookie, body(1), key);
    expect(retry.statusCode).toBe(200);
    expect(retry.headers[IDEMPOTENT_REPLAY_HEADER.toLowerCase()]).toBe('true');
    expect(retry.json().data).toEqual(first.json().data);
    await app.prisma.idempotencyKey.update({
      where: { key },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const changed = await sell(seller.cookie, body(2), key);
    expect(changed.statusCode).toBe(409);
    expect(await effects()).toEqual({ sales: 1, movements: 1, audits: 1, balance: 4 });
  });

  it('un fallo a mitad de la transacción no deja nada y el reintento con la misma clave crea la venta', async () => {
    await app.prisma.$executeRawUnsafe(`
      CREATE FUNCTION test_fail_sale_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'fallo simulado'; END $$`);
    await app.prisma.$executeRawUnsafe(`
      CREATE TRIGGER test_fail_sale_audit BEFORE INSERT ON audit_logs
      FOR EACH ROW WHEN (NEW.action = 'sale.created') EXECUTE FUNCTION test_fail_sale_audit()`);
    const key = randomUUID();
    try {
      const failed = await sell(seller.cookie, body(1), key);
      expect(failed.statusCode).toBe(500);
      expect(await effects()).toEqual({ sales: 0, movements: 0, audits: 0, balance: 5 });
      expect(await app.prisma.salePayment.count()).toBe(0);
      expect(await app.prisma.idempotencyKey.count({ where: { key } })).toBe(0);
    } finally {
      await app.prisma.$executeRawUnsafe('DROP TRIGGER test_fail_sale_audit ON audit_logs');
      await app.prisma.$executeRawUnsafe('DROP FUNCTION test_fail_sale_audit()');
    }
    const retry = await sell(seller.cookie, body(1), key);
    expect(retry.statusCode).toBe(201);
    expect(await effects()).toEqual({ sales: 1, movements: 1, audits: 1, balance: 4 });
  });
});
