import { PERMISSIONS, type Permission } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';

const URL = '/api/v1/approvals/pending';

describe('bandeja de pendientes de aprobación (Q-14)', () => {
  let app: App;

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
  });
  afterEach(() => app.close());

  async function session(permissions: Permission[]) {
    const { user, password } = await createTestUser(app.prisma, { permissions });
    const { cookie } = await login(app, user.email, password);
    return { cookie, id: user.id };
  }

  it('401 sin sesión', async () => {
    expect((await app.inject({ method: 'GET', url: URL })).statusCode).toBe(401);
  });

  it('403 si la persona no puede resolver ningún tipo de pendiente', async () => {
    const seller = await session([PERMISSIONS.CATALOG_READ, PERMISSIONS.INVENTORY_READ]);
    const requester = await session([PERMISSIONS.INVENTORY_ADJUST, PERMISSIONS.PRICES_PROPOSE]);
    for (const user of [seller, requester]) {
      const res = await app.inject({ method: 'GET', url: URL, headers: { cookie: user.cookie } });
      expect(res.statusCode).toBe(403);
    }
  });

  it('con clave temporal pendiente responde PASSWORD_CHANGE_REQUIRED (no lista nada)', async () => {
    const { user, password } = await createTestUser(app.prisma, {
      permissions: [PERMISSIONS.PRICES_APPROVE],
    });
    await app.prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
    const { cookie } = await login(app, user.email, password);
    for (const url of [URL, '/api/v1/pricing/variants', '/api/v1/pricing/changes']) {
      const res = await app.inject({ method: 'GET', url, headers: { cookie } });
      expect(res.statusCode, url).toBe(403);
      expect(res.json().error.code, url).toBe('PASSWORD_CHANGE_REQUIRED');
    }
  });

  it('sin pendientes devuelve ceros; cada total solo se calcula con su permiso', async () => {
    const admin = await session([
      PERMISSIONS.INVENTORY_ADJUST_APPROVE,
      PERMISSIONS.PRICES_APPROVE,
      PERMISSIONS.INVENTORY_COUNTS_APPROVE,
    ]);
    const res = await app.inject({ method: 'GET', url: URL, headers: { cookie: admin.cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ adjustments: 0, prices: 0, counts: 0, total: 0 });

    const onlyPrices = await session([PERMISSIONS.PRICES_APPROVE]);
    const partial = await app.inject({
      method: 'GET',
      url: URL,
      headers: { cookie: onlyPrices.cookie },
    });
    expect(partial.json().data).toEqual({ adjustments: null, prices: 0, counts: null, total: 0 });
  });

  it('cuenta ajustes pendientes, cambios de precio pendientes y conteos en revisión', async () => {
    const admin = await session([
      PERMISSIONS.INVENTORY_ADJUST_APPROVE,
      PERMISSIONS.PRICES_APPROVE,
      PERMISSIONS.INVENTORY_COUNTS_APPROVE,
    ]);
    const category = await app.prisma.category.create({
      data: { name: 'Pendientes', slug: 'pendientes' },
    });
    const product = await app.prisma.product.create({
      data: { categoryId: category.id, name: 'Pieza' },
    });
    const variant = await app.prisma.productVariant.create({
      data: { productId: product.id, sku: 'APR-1', salePrice: '10' },
    });
    await app.prisma.priceChange.create({
      data: {
        variantId: variant.id,
        previousPrice: '10',
        newPrice: '12',
        origin: 'REQUEST',
        costSnapshot: '0',
        requestedById: admin.id,
      },
    });
    await app.prisma.inventoryCount.create({
      data: { categoryId: category.id, status: 'IN_REVIEW', createdById: admin.id },
    });
    const reason = await app.prisma.adjustmentReason.create({
      data: { code: 'TEST', name: 'Prueba', sortOrder: 1 },
    });
    await app.prisma.inventoryAdjustment.create({
      data: { reasonId: reason.id, requestedById: admin.id },
    });

    const res = await app.inject({ method: 'GET', url: URL, headers: { cookie: admin.cookie } });
    expect(res.json().data).toEqual({ adjustments: 1, prices: 1, counts: 1, total: 3 });
  });
});
