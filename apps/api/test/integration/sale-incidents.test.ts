/**
 * Incidencias de venta (plan 11 §4.6 N1–N4, §6.2): solo trazabilidad. Reportar o cerrar una
 * incidencia NO cambia ventas, pagos, stock ni caja (DEC-V07, C5).
 */
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
import { createSellableVariant, seedPaymentMethods } from '../helpers/sales.ts';

const URL = '/api/v1/sale-incidents';
let app: App;
let seller: { userId: string; cookie: string };
let manager: { userId: string; cookie: string };
let admin: { userId: string; cookie: string };
let saleNumber: number;

beforeEach(async () => {
  app = await buildTestApp();
  await resetDatabase(app.prisma);
  await seedPaymentMethods(app.prisma);
  seller = await sessionWith([...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions]);
  manager = await sessionWith([...DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions]);
  admin = await sessionWith([...ALL_PERMISSIONS]);
  await post(manager.cookie, '/api/v1/cash/sessions', { openingAmount: '50' });
  const variant = await createSellableVariant(app.prisma, { stock: 4, price: '90.00' });
  const sale = await post(seller.cookie, '/api/v1/sales', {
    items: [{ variantId: variant.id, quantity: 1, expectedUnitPrice: '90' }],
    payments: [{ methodCode: 'CASH', amount: '90', tendered: '100' }],
    expectedTotal: '90',
  });
  expect(sale.statusCode).toBe(201);
  saleNumber = sale.json().data.number as number;
});
afterEach(() => app.close());

async function sessionWith(permissions: Permission[]) {
  const { user, password } = await createTestUser(app.prisma, { permissions });
  const { cookie } = await login(app, user.email, password);
  return { userId: user.id, cookie };
}

function post(cookie: string, url: string, payload: unknown, key: string | null = randomUUID()) {
  return app.inject({
    method: 'POST',
    url,
    headers: { cookie, ...(key && { 'idempotency-key': key }) },
    payload: payload as object,
  });
}

const report = (cookie: string, payload: object = {}, key?: string | null) =>
  post(
    cookie,
    URL,
    { kind: 'WRONG_SALE', description: 'Se registró la talla equivocada', saleNumber, ...payload },
    key,
  );

/** Todo lo que una incidencia NO debe tocar. */
async function snapshot() {
  return {
    sales: await app.prisma.sale.findMany({ orderBy: { number: 'asc' } }),
    items: await app.prisma.saleItem.findMany({ orderBy: { id: 'asc' } }),
    payments: await app.prisma.salePayment.findMany({ orderBy: { id: 'asc' } }),
    movements: await app.prisma.inventoryMovement.findMany({ orderBy: { id: 'asc' } }),
    balances: await app.prisma.inventoryBalance.findMany({ orderBy: { variantId: 'asc' } }),
    sessions: await app.prisma.cashSession.findMany({ orderBy: { number: 'asc' } }),
  };
}

describe('incidencias de venta', () => {
  it('el Vendedor y el Responsable reportan (201) pero no listan ni cierran (403)', async () => {
    for (const actor of [seller, manager]) {
      const res = await report(actor.cookie);
      expect(res.statusCode).toBe(201);
      expect(res.json().data).toMatchObject({
        kind: 'WRONG_SALE',
        status: 'OPEN',
        sale: { number: saleNumber },
        reportedBy: { id: actor.userId },
        resolution: null,
      });
      expect(
        (await app.inject({ method: 'GET', url: URL, headers: { cookie: actor.cookie } }))
          .statusCode,
      ).toBe(403);
      const id = res.json().data.id as string;
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `${URL}/${id}`,
            headers: { cookie: actor.cookie },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (await post(actor.cookie, `${URL}/${id}/close`, { resolution: 'Resuelto en tienda' }))
          .statusCode,
      ).toBe(403);
    }
    expect((await app.inject({ method: 'POST', url: URL, payload: {} })).statusCode).toBe(401);
  });

  it('400 con claves prohibidas, textos cortos o sin Idempotency-Key; la repetición con la misma clave es 200', async () => {
    for (const extra of [
      { amount: '90' },
      { quantity: 1 },
      { variantId: randomUUID() },
      { refund: true },
      { description: 'corta' },
      { kind: 'REFUND' },
    ]) {
      const res = await report(seller.cookie, extra);
      expect(res.statusCode, JSON.stringify(extra)).toBe(400);
    }
    const noKey = await report(seller.cookie, {}, null);
    expect(noKey.statusCode).toBe(400);
    expect(noKey.json().error.code).toBe(ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED);

    const key = randomUUID();
    const first = await report(seller.cookie, {}, key);
    const again = await report(seller.cookie, {}, key);
    expect(again.statusCode).toBe(200);
    expect(again.headers[IDEMPOTENT_REPLAY_HEADER.toLowerCase()]).toBe('true');
    expect(again.json().data).toEqual(first.json().data);
    expect(await app.prisma.saleIncident.count()).toBe(1);
  });

  it('una venta ajena o inexistente responde 404 a quien solo ve las suyas; sin número es válida', async () => {
    const other = await sessionWith([...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions]);
    expect((await report(other.cookie)).statusCode).toBe(404);
    expect((await report(seller.cookie, { saleNumber: 999 })).statusCode).toBe(404);
    const anonymous = await post(other.cookie, URL, {
      kind: 'OTHER',
      description: 'No recuerdo el número de la venta',
    });
    expect(anonymous.statusCode).toBe(201);
    expect(anonymous.json().data.sale).toBeNull();
  });

  it('el Administrador lista y cierra; cerrar dos veces es 409; no cambia ventas, pagos, stock ni caja', async () => {
    const before = await snapshot();
    const reported = await report(seller.cookie);
    const id = reported.json().data.id as string;

    const list = await app.inject({
      method: 'GET',
      url: `${URL}?status=OPEN`,
      headers: { cookie: admin.cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ data: [{ id, number: 1 }], meta: { total: 1 } });
    expect(
      (
        await app.inject({ method: 'GET', url: `${URL}/${id}`, headers: { cookie: admin.cookie } })
      ).json().data.id,
    ).toBe(id);

    const closed = await post(admin.cookie, `${URL}/${id}/close`, {
      resolution: 'Se cambió la pieza en tienda y se registró en la hoja',
    });
    expect(closed.statusCode).toBe(200);
    expect(closed.json().data).toMatchObject({
      status: 'CLOSED',
      resolution: 'Se cambió la pieza en tienda y se registró en la hoja',
      resolvedBy: { id: admin.userId },
      resolvedAt: expect.any(String),
    });
    const twice = await post(admin.cookie, `${URL}/${id}/close`, {
      resolution: 'Otra resolución más',
    });
    expect(twice.statusCode).toBe(409);
    expect(
      (
        await post(admin.cookie, `${URL}/${randomUUID()}/close`, {
          resolution: 'Resolución válida',
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await post(admin.cookie, `${URL}/${id}/close`, { resolution: 'Resuelto', amount: '1' }))
        .statusCode,
    ).toBe(400);

    // Recuento y contenido idénticos: la incidencia es solo trazabilidad.
    expect(await snapshot()).toEqual(before);

    const actions = (
      await app.prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { id: 'asc' } })
    ).map((a) => a.action);
    expect(actions).toEqual(['sale_incident.reported', 'sale_incident.closed']);

    // Por SQL directo, una incidencia cerrada tampoco cambia ni se borra.
    await expect(
      app.prisma
        .$executeRaw`UPDATE sale_incidents SET description = 'Cambio de texto largo' WHERE id = ${id}::uuid`,
    ).rejects.toThrow();
    await expect(
      app.prisma.$executeRaw`DELETE FROM sale_incidents WHERE id = ${id}::uuid`,
    ).rejects.toThrow();
  });
});
