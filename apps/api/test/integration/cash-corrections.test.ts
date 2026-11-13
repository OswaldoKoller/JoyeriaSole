/**
 * Correcciones de cierre de caja (documento 10 §12; plan 11 §4.4 C7/C8): append-only, solo
 * `cash:correct` (Administrador), sin efecto en la sesión original, ventas, pagos ni stock.
 */
import { randomUUID } from 'node:crypto';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  ERROR_CODES,
  IDEMPOTENT_REPLAY_HEADER,
  PERMISSIONS,
  type Permission,
} from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';
import { createSellableVariant, insertSaleDirect, seedPaymentMethods } from '../helpers/sales.ts';

const BASE = '/api/v1/cash/sessions';

let app: App;
beforeEach(async () => {
  app = await buildTestApp();
  await resetDatabase(app.prisma);
});
afterEach(() => app.close());

async function sessionWith(permissions: Permission[]) {
  const { user, password } = await createTestUser(app.prisma, { permissions });
  const { cookie } = await login(app, user.email, password);
  return { user, cookie };
}

function post(url: string, cookie: string, payload: unknown, key: string | null = randomUUID()) {
  return app.inject({
    method: 'POST',
    url: `${BASE}${url}`,
    headers: { cookie, ...(key && { 'idempotency-key': key }) },
    payload: payload as object,
  });
}

/** Sesión con una venta en efectivo de 450 (como el ejemplo 10 §4.2), cerrada con fondo 2000 y contado 650. */
async function closedSession(managerCookie: string, userId: string) {
  const methods = await seedPaymentMethods(app.prisma);
  const opened = await post('', managerCookie, { openingAmount: '2000' });
  expect(opened.statusCode).toBe(201);
  const sessionId = opened.json().data.id as string;
  const variant = await createSellableVariant(app.prisma, { stock: 5, userId });
  await insertSaleDirect(app.prisma, {
    sessionId,
    userId,
    variantId: variant.id,
    quantity: 3,
    unitPrice: '150.00',
    cashMethodId: methods.get('CASH')?.id ?? '',
  });
  const closed = await post(`/${sessionId}/close`, managerCookie, {
    countedCash: '650',
    notes: 'Faltante grande, se revisará',
  });
  expect(closed.statusCode).toBe(200);
  expect(closed.json().data).toMatchObject({ expectedCash: '2450.00', difference: '-1800.00' });
  return { sessionId, variantId: variant.id };
}

const REASON = 'El fondo se digitó con un cero de más';

/** Estado de todo lo que una corrección NO debe tocar. */
async function snapshot() {
  return {
    sessions: await app.prisma.cashSession.findMany({ orderBy: { number: 'asc' } }),
    sales: await app.prisma.sale.findMany({ orderBy: { number: 'asc' } }),
    items: await app.prisma.saleItem.findMany({ orderBy: { id: 'asc' } }),
    payments: await app.prisma.salePayment.findMany({ orderBy: { id: 'asc' } }),
    movements: await app.prisma.inventoryMovement.findMany({ orderBy: { id: 'asc' } }),
    balances: await app.prisma.inventoryBalance.findMany({ orderBy: { variantId: 'asc' } }),
  };
}

describe('correcciones de cierre de caja', () => {
  it('401 sin sesión; 403 para Vendedor, Responsable (aunque haya cerrado él) y quien no tiene cash:correct', async () => {
    const manager = await sessionWith([...DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions]);
    const { sessionId } = await closedSession(manager.cookie, manager.user.id);
    const body = { kind: 'NOTE', reason: REASON };

    expect(
      (await app.inject({ method: 'POST', url: `${BASE}/${sessionId}/corrections`, payload: body }))
        .statusCode,
    ).toBe(401);
    expect((await post(`/${sessionId}/corrections`, manager.cookie, body)).statusCode).toBe(403);
    const seller = await sessionWith([...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions]);
    expect((await post(`/${sessionId}/corrections`, seller.cookie, body)).statusCode).toBe(403);
    const cashier = await sessionWith([
      PERMISSIONS.CASH_READ,
      PERMISSIONS.CASH_OPEN,
      PERMISSIONS.CASH_CLOSE,
    ]);
    expect((await post(`/${sessionId}/corrections`, cashier.cookie, body)).statusCode).toBe(403);
    expect(await app.prisma.cashSessionCorrection.count()).toBe(0);

    // El Responsable sí VE las correcciones (cash:read, SC-5).
    const list = await app.inject({
      method: 'GET',
      url: `${BASE}/${sessionId}/corrections`,
      headers: { cookie: manager.cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toEqual([]);
  });

  it('400 con tipos o claves prohibidos, valores negativos o iguales al vigente y motivo corto', async () => {
    const manager = await sessionWith([...DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions]);
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    const { sessionId } = await closedSession(manager.cookie, manager.user.id);
    const valid = {
      kind: 'COUNTED_CASH',
      expectedPreviousValue: '650',
      newValue: '700',
      reason: REASON,
    };
    for (const payload of [
      { ...valid, kind: 'SALE_AMOUNT' },
      { ...valid, kind: 'PAYMENT_METHOD' },
      { ...valid, kind: 'EXPECTED_CASH' },
      { ...valid, saleId: randomUUID() },
      { ...valid, paymentId: randomUUID() },
      { ...valid, methodId: randomUUID() },
      { ...valid, expectedCash: '700' },
      { ...valid, cashSalesTotal: '0' },
      { ...valid, newValue: '-1' },
      { ...valid, newValue: '650.00' },
      { ...valid, reason: '' },
      { ...valid, reason: 'corto' },
      { kind: 'NOTE', reason: REASON, newValue: '1' },
      { kind: 'NOTE', reason: REASON, expectedPreviousValue: '650' },
      { kind: 'COUNTED_CASH', reason: REASON },
    ]) {
      const res = await post(`/${sessionId}/corrections`, admin.cookie, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect((await post(`/${sessionId}/corrections`, admin.cookie, valid, null)).statusCode).toBe(
      400,
    );
    expect(await app.prisma.cashSessionCorrection.count()).toBe(0);
  });

  it('404 con sesión inexistente y 409 CASH_SESSION_NOT_CLOSED sobre una sesión abierta', async () => {
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    const body = { kind: 'NOTE', reason: REASON };
    expect((await post(`/${randomUUID()}/corrections`, admin.cookie, body)).statusCode).toBe(404);
    const opened = await post('', admin.cookie, { openingAmount: '10' });
    const res = await post(`/${opened.json().data.id as string}/corrections`, admin.cookie, body);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe(ERROR_CODES.CASH_SESSION_NOT_CLOSED);
  });

  it('ejemplo 10 §4.2: corregir el fondo deja la diferencia vigente en 0, conserva el original y audita', async () => {
    const manager = await sessionWith([...DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions]);
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    const { sessionId } = await closedSession(manager.cookie, manager.user.id);
    const before = await snapshot();

    const res = await post(`/${sessionId}/corrections`, admin.cookie, {
      kind: 'OPENING_AMOUNT',
      expectedPreviousValue: '2000.00',
      newValue: '200',
      reason: REASON,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.correction).toMatchObject({
      sequence: 1,
      kind: 'OPENING_AMOUNT',
      previousValue: '2000.00',
      newValue: '200.00',
      expectedCashAfter: '650.00',
      countedCashAfter: '650.00',
      differenceAfter: '0.00',
      reason: REASON,
      correctedBy: { id: admin.user.id, name: admin.user.name },
    });
    expect(res.json().data.session).toMatchObject({
      openingAmount: '2000.00',
      expectedCash: '2450.00',
      difference: '-1800.00',
      current: {
        openingAmount: '200.00',
        expectedCash: '650.00',
        countedCash: '650.00',
        difference: '0.00',
      },
      corrections: { count: 1, lastAt: expect.any(String) },
    });

    // Nada más cambió: sesión original, ventas, pagos, libro y saldos idénticos.
    expect(await snapshot()).toEqual(before);

    const audit = await app.prisma.auditLog.findFirstOrThrow({
      where: { action: 'cash_session.corrected' },
    });
    expect(audit).toMatchObject({ entityId: sessionId, userId: admin.user.id });
    expect(audit.before).toEqual({
      value: '2000.00',
      expectedCash: '2450.00',
      countedCash: '650.00',
      difference: '-1800.00',
    });
    expect(audit.after).toEqual({
      value: '200.00',
      expectedCash: '650.00',
      countedCash: '650.00',
      difference: '0.00',
    });
    expect(audit.metadata).toEqual({ kind: 'OPENING_AMOUNT', reason: REASON, sequence: 1 });

    // Una cadena: contado y observación; el historial muestra la marca y las cifras vigentes.
    const counted = await post(`/${sessionId}/corrections`, admin.cookie, {
      kind: 'COUNTED_CASH',
      expectedPreviousValue: '650',
      newValue: '660',
      reason: 'Se recontó el cajón con testigo',
    });
    expect(counted.statusCode).toBe(201);
    expect(counted.json().data.correction).toMatchObject({ sequence: 2, differenceAfter: '10.00' });
    const note = await post(`/${sessionId}/corrections`, admin.cookie, {
      kind: 'NOTE',
      reason: 'Observación complementaria del cierre',
    });
    expect(note.statusCode).toBe(201);
    expect(note.json().data.correction).toMatchObject({
      sequence: 3,
      previousValue: null,
      newValue: null,
      differenceAfter: '10.00',
    });

    const list = await app.inject({
      method: 'GET',
      url: `${BASE}/${sessionId}/corrections`,
      headers: { cookie: admin.cookie },
    });
    expect(list.json().data.map((c: { sequence: number }) => c.sequence)).toEqual([1, 2, 3]);
    const history = await app.inject({
      method: 'GET',
      url: '/api/v1/cash/sessions',
      headers: { cookie: admin.cookie },
    });
    expect(history.json().data[0]).toMatchObject({
      difference: '-1800.00',
      correctionsCount: 3,
      current: { expectedCash: '650.00', countedCash: '660.00', difference: '10.00' },
    });
  });

  it('409 CASH_CORRECTION_CONFLICT si el valor anterior ya no es el vigente; misma clave con otro cuerpo 409', async () => {
    const manager = await sessionWith([...DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions]);
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    const { sessionId } = await closedSession(manager.cookie, manager.user.id);
    const stale = await post(`/${sessionId}/corrections`, admin.cookie, {
      kind: 'COUNTED_CASH',
      expectedPreviousValue: '600',
      newValue: '700',
      reason: REASON,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toMatchObject({
      code: ERROR_CODES.CASH_CORRECTION_CONFLICT,
      details: { currentValue: '650.00' },
    });

    const key = randomUUID();
    const body = { kind: 'NOTE', reason: REASON };
    const first = await post(`/${sessionId}/corrections`, admin.cookie, body, key);
    const replay = await post(`/${sessionId}/corrections`, admin.cookie, body, key);
    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(200);
    expect(replay.headers[IDEMPOTENT_REPLAY_HEADER.toLowerCase()]).toBe('true');
    expect(replay.json().data).toEqual(first.json().data);
    const changed = await post(
      `/${sessionId}/corrections`,
      admin.cookie,
      { kind: 'NOTE', reason: 'Otro motivo diferente al anterior' },
      key,
    );
    expect(changed.statusCode).toBe(409);
    expect(changed.json().error.code).toBe(ERROR_CODES.IDEMPOTENCY_KEY_REUSED);
    expect(await app.prisma.cashSessionCorrection.count()).toBe(1);
  });

  it('dos correcciones simultáneas con el mismo valor anterior: una 201 y otra 409', async () => {
    const manager = await sessionWith([...DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions]);
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    const { sessionId } = await closedSession(manager.cookie, manager.user.id);
    const correct = (newValue: string) =>
      post(`/${sessionId}/corrections`, admin.cookie, {
        kind: 'COUNTED_CASH',
        expectedPreviousValue: '650',
        newValue,
        reason: REASON,
      });
    const results = await Promise.all([correct('700'), correct('710'), correct('720')]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
    for (const conflict of results.filter((r) => r.statusCode === 409)) {
      expect(conflict.json().error.code).toBe(ERROR_CODES.CASH_CORRECTION_CONFLICT);
    }
    expect(await app.prisma.cashSessionCorrection.count()).toBe(1);
  });

  it('misma clave enviada a la vez: una sola corrección y respuestas iguales', async () => {
    const manager = await sessionWith([...DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions]);
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    const { sessionId } = await closedSession(manager.cookie, manager.user.id);
    const key = randomUUID();
    const body = {
      kind: 'COUNTED_CASH',
      expectedPreviousValue: '650',
      newValue: '700',
      reason: REASON,
    };
    const [a, b] = await Promise.all([
      post(`/${sessionId}/corrections`, admin.cookie, body, key),
      post(`/${sessionId}/corrections`, admin.cookie, body, key),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(a.json().data.correction).toEqual(b.json().data.correction);
    expect(await app.prisma.cashSessionCorrection.count()).toBe(1);
  });

  it('si falla la auditoría no queda corrección ni auditoría, y el reintento con la misma clave funciona', async () => {
    const manager = await sessionWith([...DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions]);
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    const { sessionId } = await closedSession(manager.cookie, manager.user.id);
    // Fallo simulado DESPUÉS de insertar la corrección (al grabar su auditoría).
    await app.prisma.$executeRawUnsafe(`
      CREATE FUNCTION test_fail_correction_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'fallo simulado'; END $$`);
    await app.prisma.$executeRawUnsafe(`
      CREATE TRIGGER test_fail_correction_audit BEFORE INSERT ON audit_logs
      FOR EACH ROW WHEN (NEW.action = 'cash_session.corrected')
      EXECUTE FUNCTION test_fail_correction_audit()`);
    const key = randomUUID();
    const body = { kind: 'NOTE', reason: REASON };
    try {
      const failed = await post(`/${sessionId}/corrections`, admin.cookie, body, key);
      expect(failed.statusCode).toBe(500);
      expect(await app.prisma.cashSessionCorrection.count()).toBe(0);
      expect(await app.prisma.auditLog.count({ where: { action: 'cash_session.corrected' } })).toBe(
        0,
      );
    } finally {
      await app.prisma.$executeRawUnsafe('DROP TRIGGER test_fail_correction_audit ON audit_logs');
      await app.prisma.$executeRawUnsafe('DROP FUNCTION test_fail_correction_audit()');
    }
    const retry = await post(`/${sessionId}/corrections`, admin.cookie, body, key);
    expect(retry.statusCode).toBe(201);
    expect(await app.prisma.cashSessionCorrection.count()).toBe(1);
  });
});
