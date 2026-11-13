/**
 * Concurrencia de la caja (plan 11 §3.12, §6.2): doble apertura, doble cierre y espera máxima del
 * cierre. La venta durante el cierre está en `sales-concurrency.test.ts`.
 */
import { randomUUID } from 'node:crypto';
import { DEFAULT_ROLE_PERMISSIONS, ERROR_CODES } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { lockOpenCashSession } from '../../src/modules/cash/cash-locks.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';
import { blockedSessions, startAndWait } from '../helpers/locks.ts';

const BASE = '/api/v1/cash/sessions';

let app: App;
let cookie: string;
beforeEach(async () => {
  app = await buildTestApp();
  await resetDatabase(app.prisma);
  const { user, password } = await createTestUser(app.prisma, {
    permissions: [...DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions],
  });
  ({ cookie } = await login(app, user.email, password));
});
afterEach(() => app.close());

function post(url: string, payload: unknown, key: string = randomUUID()) {
  return app.inject({
    method: 'POST',
    url: `${BASE}${url}`,
    headers: { cookie, 'idempotency-key': key },
    payload: payload as object,
  });
}

describe('concurrencia de la caja', () => {
  it('doble apertura simultánea con claves distintas: una 201 y la otra 409', async () => {
    const results = await Promise.all([
      post('', { openingAmount: '100' }),
      post('', { openingAmount: '200' }),
      post('', { openingAmount: '300' }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
    const opened = results.find((r) => r.statusCode === 201)?.json().data;
    for (const conflict of results.filter((r) => r.statusCode === 409)) {
      expect(conflict.json().error).toMatchObject({
        code: ERROR_CODES.CASH_SESSION_ALREADY_OPEN,
        details: { sessionId: opened.id },
      });
    }
    expect(await app.prisma.cashSession.count()).toBe(1);
    expect(await app.prisma.auditLog.count({ where: { action: 'cash_session.opened' } })).toBe(1);
  });

  it('doble apertura simultánea con la misma clave: una sola sesión y la misma respuesta', async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([
      post('', { openingAmount: '100' }, key),
      post('', { openingAmount: '100' }, key),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(a.json().data).toEqual(b.json().data);
    expect(await app.prisma.cashSession.count()).toBe(1);
  });

  it('doble cierre con la misma clave: un solo cierre y respuestas idénticas', async () => {
    const opened = await post('', { openingAmount: '100' });
    const id = opened.json().data.id as string;
    const key = randomUUID();
    const body = { countedCash: '95', notes: 'Faltan 5 Bs' };
    const [a, b] = await Promise.all([
      post(`/${id}/close`, body, key),
      post(`/${id}/close`, body, key),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(a.json().data).toEqual(b.json().data);
    expect(await app.prisma.auditLog.count({ where: { action: 'cash_session.closed' } })).toBe(1);
  });

  it('doble cierre con claves distintas: uno cierra, el otro 409 y quedan las cifras del primero', async () => {
    const opened = await post('', { openingAmount: '100' });
    const id = opened.json().data.id as string;
    const results = await Promise.all([
      post(`/${id}/close`, { countedCash: '100' }),
      post(`/${id}/close`, { countedCash: '120', notes: 'Sobran 20 Bs' }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const winner = results.find((r) => r.statusCode === 200)?.json().data;
    const loser = results.find((r) => r.statusCode === 409);
    expect(loser?.json().error.code).toBe(ERROR_CODES.CASH_SESSION_CLOSED);
    const stored = await app.prisma.cashSession.findUniqueOrThrow({ where: { id } });
    expect(stored.countedCash?.toFixed(2)).toBe(winner.countedCash);
    expect(await app.prisma.auditLog.count({ where: { action: 'cash_session.closed' } })).toBe(1);
  });

  it('el cierre espera como máximo 5 s a una venta en curso y luego responde 503 sin cerrar', async () => {
    const opened = await post('', { openingAmount: '100' });
    const id = opened.json().data.id as string;
    // Una «venta» retiene FOR SHARE sobre la sesión abierta y no termina.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let ready!: () => void;
    const holding = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const sale = app.prisma.$transaction(
      async (tx) => {
        await lockOpenCashSession(tx);
        ready();
        await gate;
      },
      { timeout: 20_000 },
    );
    await holding;
    try {
      const before = await blockedSessions(app.prisma);
      const { promise, blocked } = await startAndWait(
        app.prisma,
        () => post(`/${id}/close`, { countedCash: '100' }),
        before,
      );
      expect(blocked).toBe(true);
      const res = await promise;
      expect(res.statusCode).toBe(503);
      expect(res.headers['retry-after']).toBeDefined();
      expect(res.json().error.code).toBe(ERROR_CODES.SERVICE_UNAVAILABLE);
    } finally {
      release();
      await sale;
    }
    expect((await app.prisma.cashSession.findUniqueOrThrow({ where: { id } })).status).toBe('OPEN');
    // Liberada la venta, el cierre funciona.
    expect((await post(`/${id}/close`, { countedCash: '100' })).statusCode).toBe(200);
  });
});
