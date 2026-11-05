import { PERMISSIONS, type Permission } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';

const STOCK_ADMIN: Permission[] = [
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.INVENTORY_ADJUST,
  PERMISSIONS.INVENTORY_INITIAL_STOCK,
];

describe('inventario: saldos, alertas y stock inicial', () => {
  let app: App;
  let cookie: string;
  let userId: string;

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
    const admin = await createTestUser(app.prisma, { permissions: STOCK_ADMIN });
    userId = admin.user.id;
    ({ cookie } = await login(app, admin.user.email, admin.password));
  });
  afterEach(() => app.close());

  let skuCounter = 0;
  async function createVariant(options: { minStock?: number; active?: boolean } = {}) {
    skuCounter += 1;
    const category = await app.prisma.category.create({
      data: { name: `Cat ${skuCounter}`, slug: `cat-${skuCounter}-${Date.now()}` },
    });
    const product = await app.prisma.product.create({
      data: { categoryId: category.id, name: `Producto ${skuCounter}` },
    });
    return app.prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `TEST-${skuCounter}-${Date.now()}`,
        minStock: options.minStock ?? 0,
        status: options.active === false ? 'INACTIVE' : 'ACTIVE',
      },
    });
  }

  function initial(variantId: string, quantity: number, headers = { cookie }) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/inventory/${variantId}/initial`,
      headers,
      payload: { quantity, reason: 'Conteo de apertura' },
    });
  }

  it('protege las rutas: 401 sin sesión, 403 sin permiso de ajuste', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/inventory' })).statusCode).toBe(401);
    const variant = await createVariant();
    const reader = await createTestUser(app.prisma, { permissions: [PERMISSIONS.INVENTORY_READ] });
    const readerSession = await login(app, reader.user.email, reader.password);
    expect((await initial(variant.id, 5, { cookie: readerSession.cookie })).statusCode).toBe(403);
    expect(await app.prisma.inventoryMovement.count()).toBe(0);
  });

  it('valida la entrada: solo piezas enteras positivas y motivo obligatorio (P-09)', async () => {
    const variant = await createVariant();
    for (const payload of [
      { quantity: 0, reason: 'x' },
      { quantity: 1.5, reason: 'x' },
      { quantity: -2, reason: 'x' },
      { quantity: 3, reason: '' },
    ]) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/inventory/${variant.id}/initial`,
        headers: { cookie },
        payload,
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('registra movimiento, saldo y auditoría de forma atómica', async () => {
    const variant = await createVariant();
    const res = await initial(variant.id, 7);
    expect(res.statusCode).toBe(201);
    expect(res.json().data.quantity).toBe(7);

    const balance = await app.prisma.inventoryBalance.findUniqueOrThrow({
      where: { variantId: variant.id },
    });
    expect(balance.quantity).toBe(7);

    const movements = await app.prisma.inventoryMovement.findMany({
      where: { variantId: variant.id },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      type: 'INITIAL_STOCK',
      quantity: 7,
      balanceBefore: 0,
      balanceAfter: 7,
      reason: 'Conteo de apertura',
      userId,
    });

    const audit = await app.prisma.auditLog.findFirst({
      where: { action: 'inventory.initial_stock', entityId: variant.id },
    });
    expect(audit?.userId).toBe(userId);
  });

  it('el stock inicial solo se registra una vez', async () => {
    const variant = await createVariant();
    expect((await initial(variant.id, 4)).statusCode).toBe(201);
    const again = await initial(variant.id, 9);
    expect(again.statusCode).toBe(422);
    const balance = await app.prisma.inventoryBalance.findUniqueOrThrow({
      where: { variantId: variant.id },
    });
    expect(balance.quantity).toBe(4);
    expect(await app.prisma.inventoryMovement.count()).toBe(1);
  });

  it('ante dos cargas simultáneas solo una se aplica (concurrencia, primer saldo)', async () => {
    const variant = await createVariant();
    const results = await Promise.all([initial(variant.id, 3), initial(variant.id, 5)]);
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 422]);

    const movements = await app.prisma.inventoryMovement.findMany({
      where: { variantId: variant.id },
    });
    expect(movements).toHaveLength(1);
    const balance = await app.prisma.inventoryBalance.findUniqueOrThrow({
      where: { variantId: variant.id },
    });
    expect(balance.quantity).toBe(movements[0]?.quantity);
  });

  it('no carga stock en variantes inactivas ni inexistentes', async () => {
    const inactive = await createVariant({ active: false });
    expect((await initial(inactive.id, 2)).statusCode).toBe(422);
    expect((await initial('01900000-0000-7000-8000-000000000000', 2)).statusCode).toBe(404);
    expect(await app.prisma.inventoryBalance.count()).toBe(0);
  });

  it('clasifica sin stock, bajo mínimo y normal, y filtra por nivel', async () => {
    const out = await createVariant({ minStock: 2 });
    const low = await createVariant({ minStock: 5 });
    const ok = await createVariant({ minStock: 1 });
    await initial(low.id, 5);
    await initial(ok.id, 10);

    const all = await app.inject({ method: 'GET', url: '/api/v1/inventory', headers: { cookie } });
    expect(all.statusCode).toBe(200);
    const levels = Object.fromEntries(
      (all.json().data as { variantId: string; level: string }[]).map((i) => [
        i.variantId,
        i.level,
      ]),
    );
    expect(levels).toEqual({ [out.id]: 'OUT', [low.id]: 'LOW', [ok.id]: 'OK' });

    const ids = async (level: string) => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/inventory?level=${level}`,
        headers: { cookie },
      });
      return (res.json().data as { variantId: string }[]).map((i) => i.variantId).sort();
    };
    // "Bajo mínimo" = cantidad ≤ stock mínimo (DOMINIO.md): incluye las piezas agotadas con mínimo.
    expect(await ids('LOW')).toEqual([out.id, low.id].sort());
    expect(await ids('OUT')).toEqual([out.id]);
    expect(await ids('OK')).toEqual([ok.id]);
  });

  it('muestra el historial de movimientos de una variante', async () => {
    const variant = await createVariant();
    await initial(variant.id, 6);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/inventory/${variant.id}/movements`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().meta.total).toBe(1);
    expect(res.json().data[0]).toMatchObject({ type: 'INITIAL_STOCK', quantity: 6, userId });
  });

  it('lista los movimientos de todas las variantes, del más reciente al más antiguo', async () => {
    const first = await createVariant();
    const second = await createVariant();
    await initial(first.id, 4);
    await initial(second.id, 9);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/inventory/movements',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().meta.total).toBe(2);
    const rows = res.json().data as { sku: string; productName: string; quantity: number }[];
    expect(rows.map((row) => row.sku)).toEqual([second.sku, first.sku]);
    expect(rows[0]).toMatchObject({
      type: 'INITIAL_STOCK',
      quantity: 9,
      balanceBefore: 0,
      balanceAfter: 9,
      userId,
    });
    expect(rows[0]?.productName).toMatch(/^Producto /);
  });

  it('pagina los movimientos globales', async () => {
    for (let index = 0; index < 3; index += 1) await initial((await createVariant()).id, 1 + index);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/inventory/movements?page=2&pageSize=2',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().meta).toEqual({ page: 2, pageSize: 2, total: 3 });
    expect(res.json().data).toHaveLength(1);
  });

  it('protege los movimientos globales: 401 sin sesión y 403 sin inventory:read', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/inventory/movements' })).statusCode,
    ).toBe(401);
    const other = await createTestUser(app.prisma, { permissions: [PERMISSIONS.CATALOG_READ] });
    const session = await login(app, other.user.email, other.password);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/inventory/movements',
      headers: { cookie: session.cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('initialOnly muestra solo las variantes que aún admiten stock inicial', async () => {
    const withStock = await createVariant();
    const pending = await createVariant();
    await initial(withStock.id, 5);

    const ids = async (query: string) => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/inventory${query}`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      return (res.json().data as { variantId: string }[]).map((item) => item.variantId).sort();
    };
    expect(await ids('?initialOnly=true')).toEqual([pending.id]);
    expect(await ids('?initialOnly=false')).toEqual([withStock.id, pending.id].sort());
    expect(await ids('')).toEqual([withStock.id, pending.id].sort());
  });
});
