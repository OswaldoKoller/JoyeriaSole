/** Datos del negocio para el comprobante (plan 11 §4.6 S1/S2; C1, C2). Solo el Administrador. */
import { randomUUID } from 'node:crypto';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  RECEIPT_POLICY_NOTE,
  type Permission,
} from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';
import {
  createSellableVariant,
  seedBusinessSettings,
  seedPaymentMethods,
} from '../helpers/sales.ts';

const URL = '/api/v1/settings/business';
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

const put = (cookie: string, payload: unknown) =>
  app.inject({ method: 'PUT', url: URL, headers: { cookie }, payload: payload as object });

const VALID = {
  tradeName: 'Joyería Sole Centro',
  address: 'Calle Comercio 123, La Paz',
  phone: '+591 2 2123456',
  taxId: '1234567019',
  receiptShowSeller: true,
};

describe('datos del negocio', () => {
  it('401 sin sesión y 403 para Vendedor y Responsable', async () => {
    expect((await app.inject({ method: 'GET', url: URL })).statusCode).toBe(401);
    for (const permissions of [
      DEFAULT_ROLE_PERMISSIONS.SELLER.permissions,
      DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions,
    ]) {
      const { cookie } = await sessionWith([...permissions]);
      expect((await app.inject({ method: 'GET', url: URL, headers: { cookie } })).statusCode).toBe(
        403,
      );
      expect((await put(cookie, VALID)).statusCode).toBe(403);
    }
  });

  it('devuelve la fila sembrada (valores provisionales) y, sin fila, los mismos valores por defecto', async () => {
    const { cookie } = await sessionWith([...ALL_PERMISSIONS]);
    const expected = {
      tradeName: 'Joyería Sole',
      address: null,
      phone: null,
      taxId: null,
      receiptShowSeller: false,
      receiptFooterNote: RECEIPT_POLICY_NOTE,
      logo: null,
      updatedAt: null,
      updatedBy: null,
    };
    expect(
      (await app.inject({ method: 'GET', url: URL, headers: { cookie } })).json().data,
    ).toEqual(expected);
    await seedBusinessSettings(app.prisma);
    expect(
      (await app.inject({ method: 'GET', url: URL, headers: { cookie } })).json().data,
    ).toEqual(expected);
  });

  it('valida (400), guarda, audita antes/después y el comprobante refleja el cambio', async () => {
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    await seedBusinessSettings(app.prisma);
    for (const payload of [
      { ...VALID, tradeName: '  ' },
      { ...VALID, tradeName: 'x'.repeat(121) },
      { ...VALID, taxId: '1'.repeat(21) },
      { ...VALID, logo: 'data:image/png' },
      { tradeName: 'Sin interruptor' },
    ]) {
      expect((await put(admin.cookie, payload)).statusCode, JSON.stringify(payload)).toBe(400);
    }

    const res = await put(admin.cookie, VALID);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      ...VALID,
      receiptFooterNote: null,
      logo: null,
      updatedAt: expect.any(String),
      updatedBy: { id: admin.user.id, name: admin.user.name },
    });
    const audit = await app.prisma.auditLog.findFirstOrThrow({
      where: { action: 'business_settings.updated' },
    });
    expect(audit.before).toMatchObject({ tradeName: 'Joyería Sole', receiptShowSeller: false });
    expect(audit.after).toMatchObject({ tradeName: 'Joyería Sole Centro', taxId: '1234567019' });

    // Vaciar un campo opcional lo deja en null.
    const cleared = await put(admin.cookie, { ...VALID, phone: '', taxId: null });
    expect(cleared.json().data).toMatchObject({ phone: null, taxId: null });

    // El comprobante usa los datos vigentes (D-08) y el interruptor del vendedor (D-04).
    await seedPaymentMethods(app.prisma);
    const opened = await app.inject({
      method: 'POST',
      url: '/api/v1/cash/sessions',
      headers: { cookie: admin.cookie, 'idempotency-key': randomUUID() },
      payload: { openingAmount: '0' },
    });
    expect(opened.statusCode).toBe(201);
    const variant = await createSellableVariant(app.prisma, { stock: 1, price: '10.00' });
    const sale = await app.inject({
      method: 'POST',
      url: '/api/v1/sales',
      headers: { cookie: admin.cookie, 'idempotency-key': randomUUID() },
      payload: {
        items: [{ variantId: variant.id, quantity: 1, expectedUnitPrice: '10' }],
        payments: [{ methodCode: 'BANK_TRANSFER', amount: '10' }],
        expectedTotal: '10',
      },
    });
    const receipt = await app.inject({
      method: 'GET',
      url: `/api/v1/sales/${sale.json().data.id as string}/receipt`,
      headers: { cookie: admin.cookie },
    });
    expect(receipt.json().data).toMatchObject({
      business: {
        tradeName: 'Joyería Sole Centro',
        address: 'Calle Comercio 123, La Paz',
        phone: null,
        taxId: null,
      },
      seller: { name: admin.user.name },
    });
  });
});
