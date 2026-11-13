/**
 * Concurrencia de la venta (plan 11 §3.12, §6.2): última pieza, ventas en paralelo, venta frente a
 * un movimiento de stock simultáneo y venta durante el cierre de caja.
 */
import { randomUUID } from 'node:crypto';
import { DEFAULT_ROLE_PERMISSIONS, ERROR_CODES, type Permission } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { lockOpenCashSession } from '../../src/modules/cash/cash-locks.ts';
import { applyStockChanges } from '../../src/modules/inventory/stock-ledger.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';
import { assertLedgerInvariant } from '../helpers/ledger.ts';
import { blockedSessions, holdVariantLock, startAndWait } from '../helpers/locks.ts';
import {
  balanceOf,
  createSellableVariant,
  seedPaymentMethods,
  writeSaleDirect,
} from '../helpers/sales.ts';

let app: App;
let sellerCookie: string;
let sellerId: string;
let managerCookie: string;
let sessionId: string;
let cashMethodId: string;

beforeEach(async () => {
  app = await buildTestApp();
  await resetDatabase(app.prisma);
  cashMethodId = (await seedPaymentMethods(app.prisma)).get('CASH')?.id ?? '';
  const seller = await sessionWith([...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions]);
  sellerCookie = seller.cookie;
  sellerId = seller.userId;
  managerCookie = (await sessionWith([...DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions]))
    .cookie;
  const opened = await app.inject({
    method: 'POST',
    url: '/api/v1/cash/sessions',
    headers: { cookie: managerCookie, 'idempotency-key': randomUUID() },
    payload: { openingAmount: '100' },
  });
  expect(opened.statusCode).toBe(201);
  sessionId = opened.json().data.id as string;
});
afterEach(() => app.close());

async function sessionWith(permissions: Permission[]) {
  const { user, password } = await createTestUser(app.prisma, { permissions });
  const { cookie } = await login(app, user.email, password);
  return { userId: user.id, cookie };
}

function sell(variantId: string, quantity = 1, cookie = sellerCookie) {
  const total = (150 * quantity).toFixed(2);
  return app.inject({
    method: 'POST',
    url: '/api/v1/sales',
    headers: { cookie, 'idempotency-key': randomUUID() },
    payload: {
      items: [{ variantId, quantity, expectedUnitPrice: '150.00' }],
      payments: [{ methodCode: 'CASH', amount: total, tendered: total }],
      expectedTotal: total,
    },
  });
}

describe('concurrencia de la venta', () => {
  it('dos ventas simultáneas por la última pieza: una 201, otra 422 INSUFFICIENT_STOCK; saldo 0', async () => {
    const variant = await createSellableVariant(app.prisma, { stock: 1, price: '150.00' });
    const results = await Promise.all([sell(variant.id), sell(variant.id, 1, managerCookie)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 422]);
    // Con el bloqueo de variantes ANTES de validar, el perdedor ve el saldo ya descontado: el error
    // es INSUFFICIENT_STOCK (sin ese bloqueo sería el error genérico del libro).
    expect(results.find((r) => r.statusCode === 422)?.json().error).toMatchObject({
      code: ERROR_CODES.INSUFFICIENT_STOCK,
      details: { items: [{ variantId: variant.id, available: 0, requested: 1 }] },
    });
    expect(await balanceOf(app.prisma, variant.id)).toBe(0);
    expect(await app.prisma.inventoryMovement.count({ where: { type: 'SALE' } })).toBe(1);
    expect(await app.prisma.sale.count()).toBe(1);
    await assertLedgerInvariant(app.prisma);
  });

  it('varias ventas simultáneas de piezas distintas: todas se confirman', async () => {
    const variants = await Promise.all(
      Array.from({ length: 6 }, () =>
        createSellableVariant(app.prisma, { stock: 3, price: '150.00' }),
      ),
    );
    const results = await Promise.all(variants.map((variant) => sell(variant.id, 2)));
    expect(results.map((r) => r.statusCode)).toEqual(Array(6).fill(201));
    const numbers = results.map((r) => r.json().data.number as number).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(6);
    for (const variant of variants) expect(await balanceOf(app.prisma, variant.id)).toBe(1);
    await assertLedgerInvariant(app.prisma);
  });

  it('una venta y un ajuste simultáneos de la misma variante se serializan sin interbloqueo', async () => {
    const variant = await createSellableVariant(app.prisma, { stock: 1, price: '150.00' });
    // El «ajuste» (+2) toma la variante primero y la retiene.
    const adjustment = holdVariantLock(app.prisma, variant.id, (tx) =>
      applyStockChanges(tx, [
        {
          variantId: variant.id,
          type: 'ADJUSTMENT',
          quantity: 2,
          userId: sellerId,
          reason: 'Prueba',
        },
      ]),
    );
    await adjustment.ready;
    const before = await blockedSessions(app.prisma);
    const { promise, blocked } = await startAndWait(app.prisma, () => sell(variant.id, 3), before);
    expect(blocked).toBe(true);
    adjustment.release();
    await adjustment.finished;
    const res = await promise;
    // La venta esperó y vio el saldo ya ajustado (1 + 2 = 3): vende las 3 piezas.
    expect(res.statusCode).toBe(201);
    expect(await balanceOf(app.prisma, variant.id)).toBe(0);
    await assertLedgerInvariant(app.prisma);
  });

  it('venta durante el cierre: el cierre espera a la venta en curso y la incluye; la siguiente recibe 422', async () => {
    const variant = await createSellableVariant(app.prisma, { stock: 5, price: '150.00' });
    // Una venta en curso retiene FOR SHARE sobre la sesión abierta (compuerta).
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let markReady!: () => void;
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const inFlight = app.prisma.$transaction(
      async (tx) => {
        await lockOpenCashSession(tx);
        markReady();
        await gate;
        return writeSaleDirect(tx, {
          sessionId,
          userId: sellerId,
          variantId: variant.id,
          quantity: 2,
          unitPrice: '150.00',
          cashMethodId,
        });
      },
      { timeout: 20_000 },
    );
    await ready;

    const before = await blockedSessions(app.prisma);
    const { promise: closing, blocked } = await startAndWait(
      app.prisma,
      () =>
        app.inject({
          method: 'POST',
          url: `/api/v1/cash/sessions/${sessionId}/close`,
          headers: { cookie: managerCookie, 'idempotency-key': randomUUID() },
          payload: { countedCash: '400' },
        }),
      before,
    );
    // El cierre NO termina mientras la venta retiene la sesión (sin FOR UPDATE terminaría antes).
    expect(blocked).toBe(true);
    release();
    await inFlight;
    const closed = await closing;
    expect(closed.statusCode).toBe(200);
    expect(closed.json().data).toMatchObject({
      status: 'CLOSED',
      cashSalesTotal: '300.00',
      expectedCash: '400.00',
      difference: '0.00',
      salesCount: 1,
    });

    // Una venta que llega después del cierre: 422 y ningún efecto.
    const audits = await app.prisma.auditLog.count();
    const late = await sell(variant.id);
    expect(late.statusCode).toBe(422);
    expect(late.json().error.code).toBe(ERROR_CODES.CASH_SESSION_REQUIRED);
    expect(await balanceOf(app.prisma, variant.id)).toBe(3);
    expect(await app.prisma.sale.count()).toBe(1);
    expect(await app.prisma.salePayment.count()).toBe(1);
    expect(await app.prisma.auditLog.count()).toBe(audits);
    await assertLedgerInvariant(app.prisma);
  });
});
