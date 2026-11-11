/** Caja única (plan 11 §4.4, §6.2): apertura, consulta, cierre con arqueo, historial y permisos. */
import { randomUUID } from 'node:crypto';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  ERROR_CODES,
  IDEMPOTENT_REPLAY_HEADER,
  type Permission,
} from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';
import { createSellableVariant, insertSaleDirect, seedPaymentMethods } from '../helpers/sales.ts';

const BASE = '/api/v1/cash';
const MANAGER = [...DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions];
const SELLER = [...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions];

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

const get = (url: string, cookie: string) =>
  app.inject({ method: 'GET', url: `${BASE}${url}`, headers: { cookie } });

async function openSession(cookie: string, openingAmount = '100') {
  const res = await post('/sessions', cookie, { openingAmount });
  expect(res.statusCode).toBe(201);
  return res.json().data as { id: string; number: number };
}

describe('autenticación y permisos de caja', () => {
  it('401 sin sesión en todas las rutas', async () => {
    const id = randomUUID();
    for (const [method, url] of [
      ['GET', '/status'],
      ['POST', '/sessions'],
      ['GET', '/sessions'],
      ['GET', '/sessions/current'],
      ['GET', `/sessions/${id}`],
      ['POST', `/sessions/${id}/close`],
      ['POST', `/sessions/${id}/corrections`],
      ['GET', `/sessions/${id}/corrections`],
    ] as const) {
      const res = await app.inject({ method, url: `${BASE}${url}`, payload: {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('el Vendedor no abre, no cierra ni ve cifras: solo el estado sin cifras (C1)', async () => {
    const manager = await sessionWith(MANAGER);
    const seller = await sessionWith(SELLER);
    const session = await openSession(manager.cookie, '150');

    expect((await post('/sessions', seller.cookie, { openingAmount: '0' })).statusCode).toBe(403);
    expect(
      (await post(`/sessions/${session.id}/close`, seller.cookie, { countedCash: '150' }))
        .statusCode,
    ).toBe(403);
    for (const url of ['/sessions', '/sessions/current', `/sessions/${session.id}`]) {
      expect((await get(url, seller.cookie)).statusCode, url).toBe(403);
    }

    const status = await get('/status', seller.cookie);
    expect(status.statusCode).toBe(200);
    expect(status.json().data).toEqual({
      open: true,
      session: {
        id: session.id,
        number: session.number,
        openedAt: expect.any(String),
        openedByName: manager.user.name,
      },
    });
    expect(JSON.stringify(status.json())).not.toMatch(/150|amount|cash/i);
  });

  it('sin sales:create ni cash:read no consulta el estado; con clave temporal responde 403', async () => {
    const other = await sessionWith([...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions.slice(0, 2)]);
    expect((await get('/status', other.cookie)).statusCode).toBe(403);

    const manager = await sessionWith(MANAGER);
    await app.prisma.user.update({
      where: { id: manager.user.id },
      data: { mustChangePassword: true },
    });
    const res = await post('/sessions', manager.cookie, { openingAmount: '10' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe(ERROR_CODES.PASSWORD_CHANGE_REQUIRED);
  });
});

describe('apertura', () => {
  it('400 con fondo negativo, vacío, con texto, con claves extra o sin Idempotency-Key', async () => {
    const { cookie } = await sessionWith(MANAGER);
    for (const payload of [
      { openingAmount: '-5' },
      { openingAmount: '' },
      { openingAmount: 'cien' },
      { openingAmount: '10.123' },
      {},
      { openingAmount: '10', notes: 'apertura' },
    ]) {
      const res = await post('/sessions', cookie, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
    const noKey = await post('/sessions', cookie, { openingAmount: '10' }, null);
    expect(noKey.statusCode).toBe(400);
    expect(noKey.json().error.code).toBe(ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED);
    const badKey = await post('/sessions', cookie, { openingAmount: '10' }, 'no-es-uuid');
    expect(badKey.statusCode).toBe(400);
    expect(await app.prisma.cashSession.count()).toBe(0);
  });

  it('abre con «0» explícito, audita y deja la sesión visible; una segunda apertura es 409', async () => {
    const { user, cookie } = await sessionWith(MANAGER);
    const res = await post('/sessions', cookie, { openingAmount: '0' });
    expect(res.statusCode).toBe(201);
    const session = res.json().data;
    expect(session).toMatchObject({
      number: 1,
      status: 'OPEN',
      openedBy: { id: user.id, name: user.name },
      openingAmount: '0.00',
      closedAt: null,
      liveExpectedCash: '0.00',
      salesCount: 0,
      salesTotal: '0.00',
      current: { openingAmount: '0.00', expectedCash: '0.00', countedCash: null, difference: null },
      corrections: { count: 0, lastAt: null },
    });

    const audit = await app.prisma.auditLog.findFirstOrThrow({
      where: { action: 'cash_session.opened' },
    });
    expect(audit).toMatchObject({ entityId: session.id, userId: user.id });
    expect(audit.after).toEqual({ number: 1, openingAmount: '0.00' });

    const again = await post('/sessions', cookie, { openingAmount: '50' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toMatchObject({
      code: ERROR_CODES.CASH_SESSION_ALREADY_OPEN,
      details: { sessionId: session.id, number: 1 },
    });

    expect((await get('/sessions/current', cookie)).json().data.id).toBe(session.id);
    expect((await get(`/sessions/${session.id}`, cookie)).json().data.id).toBe(session.id);
    expect((await get('/status', cookie)).json().data.open).toBe(true);
  });

  it('repetir con la misma clave devuelve la misma sesión (200 + Idempotent-Replay) sin duplicar', async () => {
    const { cookie } = await sessionWith(MANAGER);
    const key = randomUUID();
    const first = await post('/sessions', cookie, { openingAmount: '80.5' }, key);
    const second = await post('/sessions', cookie, { openingAmount: '80.5' }, key);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.headers[IDEMPOTENT_REPLAY_HEADER.toLowerCase()]).toBe('true');
    expect(second.json().data).toEqual(first.json().data);
    const other = await post('/sessions', cookie, { openingAmount: '81' }, key);
    expect(other.statusCode).toBe(409);
    expect(other.json().error.code).toBe(ERROR_CODES.IDEMPOTENCY_KEY_REUSED);
    expect(await app.prisma.cashSession.count()).toBe(1);
    expect(await app.prisma.auditLog.count({ where: { action: 'cash_session.opened' } })).toBe(1);
  });

  it('404 sin caja abierta (sesión actual) y con id inexistente; 400 con id inválido', async () => {
    const { cookie } = await sessionWith(MANAGER);
    expect((await get('/sessions/current', cookie)).statusCode).toBe(404);
    expect((await get(`/sessions/${randomUUID()}`, cookie)).statusCode).toBe(404);
    expect((await get('/sessions/no-es-uuid', cookie)).statusCode).toBe(400);
    expect((await get('/status', cookie)).json().data).toEqual({ open: false, session: null });
  });
});

describe('cierre con arqueo', () => {
  it('cierra sin diferencia y sin observación', async () => {
    const { user, cookie } = await sessionWith(MANAGER);
    const session = await openSession(cookie, '100');
    const res = await post(`/sessions/${session.id}/close`, cookie, { countedCash: '100' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      status: 'CLOSED',
      closedBy: { id: user.id, name: user.name },
      cashSalesTotal: '0.00',
      expectedCash: '100.00',
      countedCash: '100.00',
      difference: '0.00',
      notes: null,
      liveExpectedCash: null,
      current: {
        openingAmount: '100.00',
        expectedCash: '100.00',
        countedCash: '100.00',
        difference: '0.00',
      },
    });
    expect((await get('/status', cookie)).json().data.open).toBe(false);
  });

  it('con diferencia y sin observación responde 422 con las cifras y la sesión sigue abierta', async () => {
    const { cookie } = await sessionWith(MANAGER);
    const session = await openSession(cookie, '100');
    const res = await post(`/sessions/${session.id}/close`, cookie, {
      countedCash: '90',
      notes: 'ab',
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({
      code: ERROR_CODES.CASH_DIFFERENCE_NOTE_REQUIRED,
      details: { expectedCash: '100.00', countedCash: '90.00', difference: '-10.00' },
    });
    const stored = await app.prisma.cashSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(stored.status).toBe('OPEN');
    expect(await app.prisma.auditLog.count({ where: { action: 'cash_session.closed' } })).toBe(0);

    const ok = await post(`/sessions/${session.id}/close`, cookie, {
      countedCash: '90',
      notes: 'Faltan 10 Bs, se revisará con la cajera',
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data).toMatchObject({
      status: 'CLOSED',
      difference: '-10.00',
      notes: 'Faltan 10 Bs, se revisará con la cajera',
    });
  });

  it('400 con claves no admitidas (el esperado lo calcula el servidor) y sin clave', async () => {
    const { cookie } = await sessionWith(MANAGER);
    const session = await openSession(cookie);
    for (const payload of [
      { countedCash: '100', expectedCash: '100' },
      { countedCash: '-1' },
      { countedCash: '' },
      {},
    ]) {
      expect(
        (await post(`/sessions/${session.id}/close`, cookie, payload)).statusCode,
        JSON.stringify(payload),
      ).toBe(400);
    }
    expect(
      (await post(`/sessions/${session.id}/close`, cookie, { countedCash: '100' }, null))
        .statusCode,
    ).toBe(400);
    expect(
      (await post(`/sessions/${randomUUID()}/close`, cookie, { countedCash: '1' })).statusCode,
    ).toBe(404);
  });

  it('ejemplo del documento 02 §6 (sin gastos ni retiros): cifras exactas y auditoría', async () => {
    const { user, cookie } = await sessionWith(MANAGER);
    const methods = await seedPaymentMethods(app.prisma);
    const method = (code: 'CASH' | 'QR' | 'BANK_TRANSFER') => {
      const found = methods.get(code);
      if (!found) throw new Error(code);
      return { methodId: found.id, isCash: found.isCash, name: found.name };
    };
    const session = await openSession(cookie, '200');
    const variant = await createSellableVariant(app.prisma, { stock: 10, userId: user.id });
    const sale = (
      unitPrice: string,
      payments: Parameters<typeof insertSaleDirect>[1]['payments'],
    ) =>
      insertSaleDirect(app.prisma, {
        sessionId: session.id,
        userId: user.id,
        lines: [{ variantId: variant.id, quantity: 1, unitPrice }],
        payments,
      });
    await sale('100.00', [{ ...method('CASH'), amount: '100.00', tendered: '150.00' }]);
    await sale('80.00', [
      { ...method('QR'), amount: '50.00' },
      { ...method('CASH'), amount: '30.00', tendered: '30.00' },
    ]);
    await sale('120.00', [{ ...method('BANK_TRANSFER'), amount: '120.00' }]);

    const live = (await get('/sessions/current', cookie)).json().data;
    expect(live).toMatchObject({
      liveExpectedCash: '330.00',
      salesCount: 3,
      salesTotal: '300.00',
      mixedSales: { count: 1, amount: '80.00' },
      totalsByMethod: [
        {
          methodCode: 'CASH',
          methodName: 'Efectivo',
          isCash: true,
          amount: '130.00',
          paymentsCount: 2,
        },
        { methodCode: 'QR', methodName: 'QR', isCash: false, amount: '50.00', paymentsCount: 1 },
        {
          methodCode: 'BANK_TRANSFER',
          methodName: 'Transferencia',
          isCash: false,
          amount: '120.00',
          paymentsCount: 1,
        },
      ],
    });

    const res = await post(`/sessions/${session.id}/close`, cookie, {
      countedCash: '329.50',
      notes: 'Faltan 50 centavos',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      cashSalesTotal: '130.00',
      expectedCash: '330.00',
      countedCash: '329.50',
      difference: '-0.50',
      salesTotal: '300.00',
    });

    const audit = await app.prisma.auditLog.findFirstOrThrow({
      where: { action: 'cash_session.closed', entityId: session.id },
    });
    expect(audit.userId).toBe(user.id);
    expect(audit.before).toMatchObject({ status: 'OPEN', openingAmount: '200.00' });
    expect(audit.after).toMatchObject({
      status: 'CLOSED',
      cashSalesTotal: '130.00',
      expectedCash: '330.00',
      countedCash: '329.50',
      difference: '-0.50',
      notes: 'Faltan 50 centavos',
    });

    // Historial: la sesión cerrada con sus cifras y sus ventas.
    const list = await get('/sessions?status=CLOSED', cookie);
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      data: [
        {
          id: session.id,
          status: 'CLOSED',
          openedByName: user.name,
          closedByName: user.name,
          expectedCash: '330.00',
          difference: '-0.50',
          salesCount: 3,
          salesTotal: '300.00',
          correctionsCount: 0,
        },
      ],
      meta: { page: 1, pageSize: 25, total: 1 },
    });
    expect((await get('/sessions?status=OPEN', cookie)).json().meta.total).toBe(0);
  });

  it('un cierre repetido con la misma clave devuelve lo mismo; con otra clave es 409', async () => {
    const { cookie } = await sessionWith(MANAGER);
    const session = await openSession(cookie, '100');
    const key = randomUUID();
    const first = await post(`/sessions/${session.id}/close`, cookie, { countedCash: '100' }, key);
    const replay = await post(`/sessions/${session.id}/close`, cookie, { countedCash: '100' }, key);
    expect(replay.statusCode).toBe(200);
    expect(replay.headers[IDEMPOTENT_REPLAY_HEADER.toLowerCase()]).toBe('true');
    expect(replay.json().data).toEqual(first.json().data);
    const other = await post(`/sessions/${session.id}/close`, cookie, { countedCash: '100' });
    expect(other.statusCode).toBe(409);
    expect(other.json().error.code).toBe(ERROR_CODES.CASH_SESSION_CLOSED);
    expect(await app.prisma.auditLog.count({ where: { action: 'cash_session.closed' } })).toBe(1);
  });

  it('tras cerrar se puede abrir una sesión nueva con su propio fondo (sin arrastre)', async () => {
    const { cookie } = await sessionWith(MANAGER);
    const first = await openSession(cookie, '100');
    await post(`/sessions/${first.id}/close`, cookie, { countedCash: '100' });
    const second = await openSession(cookie, '40');
    expect(second.number).toBe(2);
    expect((await get('/sessions/current', cookie)).json().data.openingAmount).toBe('40.00');
    const history = await get('/sessions', cookie);
    expect(history.json().data.map((s: { number: number }) => s.number)).toEqual([2, 1]);
  });

  it('no existen rutas para editar, borrar o reabrir sesiones ni movimientos de caja', async () => {
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    const session = await openSession(admin.cookie);
    for (const [method, url] of [
      ['PATCH', `/sessions/${session.id}`],
      ['PUT', `/sessions/${session.id}`],
      ['DELETE', `/sessions/${session.id}`],
      ['POST', `/sessions/${session.id}/reopen`],
      ['POST', `/sessions/${session.id}/movements`],
      ['POST', '/movements'],
      ['DELETE', `/sessions/${session.id}/corrections/1`],
    ] as const) {
      const res = await app.inject({
        method,
        url: `${BASE}${url}`,
        headers: { cookie: admin.cookie, 'idempotency-key': randomUUID() },
        payload: {},
      });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    expect(
      (await app.prisma.cashSession.findUniqueOrThrow({ where: { id: session.id } })).status,
    ).toBe('OPEN');
  });
});
