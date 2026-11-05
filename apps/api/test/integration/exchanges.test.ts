import { PERMISSIONS, type Permission } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';

const MANAGER: Permission[] = [
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.INVENTORY_ADJUST,
  PERMISSIONS.INVENTORY_INITIAL_STOCK,
  PERMISSIONS.INVENTORY_EXCHANGE,
  PERMISSIONS.COSTS_READ,
];

describe('cambios de pieza (ADR-019): doble movimiento atómico', () => {
  let app: App;
  let cookie: string;
  let userId: string;

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
    const manager = await createTestUser(app.prisma, { permissions: MANAGER });
    userId = manager.user.id;
    ({ cookie } = await login(app, manager.user.email, manager.password));
  });
  afterEach(() => app.close());

  let counter = 0;
  async function createVariant(options: { active?: boolean; cost?: string; stock?: number } = {}) {
    counter += 1;
    const category = await app.prisma.category.create({
      data: { name: `Cat ${counter}`, slug: `cat-${counter}-${Date.now()}` },
    });
    const product = await app.prisma.product.create({
      data: { categoryId: category.id, name: `Producto ${counter}` },
    });
    const variant = await app.prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `CAMB-${counter}-${Date.now()}`,
        costPrice: options.cost ?? '0',
        status: 'ACTIVE',
      },
    });
    if (options.stock) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/inventory/${variant.id}/initial`,
        headers: { cookie },
        payload: { quantity: options.stock, reason: 'Stock de prueba' },
      });
      expect(res.statusCode).toBe(201);
    }
    if (options.active === false) {
      await app.prisma.productVariant.update({
        where: { id: variant.id },
        data: { status: 'INACTIVE' },
      });
    }
    return variant;
  }

  const balanceOf = async (variantId: string) =>
    (await app.prisma.inventoryBalance.findUnique({ where: { variantId } }))?.quantity ?? 0;

  function exchange(
    returnedId: string,
    deliveredId: string,
    extra: Record<string, unknown> = {},
    headers: Record<string, string> = { cookie },
  ) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/inventory/exchanges',
      headers,
      payload: {
        returned: { variantId: returnedId, quantity: 1 },
        delivered: { variantId: deliveredId, quantity: 1 },
        reason: 'Talla equivocada',
        ...extra,
      },
    });
  }

  const exchangeMovements = () =>
    app.prisma.inventoryMovement.findMany({
      where: { referenceType: 'EXCHANGE' },
      orderBy: { id: 'asc' },
    });

  it('protege las rutas: 401 sin sesión y 403 sin el permiso de cambios (también Vendedor)', async () => {
    const a = await createVariant({ stock: 2 });
    const b = await createVariant({ stock: 2 });
    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/inventory/exchanges', payload: {} }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/inventory/exchanges/01900000-0000-7000-8000-000000000000',
        })
      ).statusCode,
    ).toBe(401);

    const seller = await createTestUser(app.prisma, {
      permissions: [PERMISSIONS.CATALOG_READ, PERMISSIONS.INVENTORY_READ],
    });
    const sellerSession = await login(app, seller.user.email, seller.password);
    expect((await exchange(a.id, b.id, {}, { cookie: sellerSession.cookie })).statusCode).toBe(403);
    // Quien solo puede solicitar ajustes tampoco registra cambios.
    const adjuster = await createTestUser(app.prisma, {
      permissions: [PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_ADJUST],
    });
    const adjusterSession = await login(app, adjuster.user.email, adjuster.password);
    expect((await exchange(a.id, b.id, {}, { cookie: adjusterSession.cookie })).statusCode).toBe(
      403,
    );
    expect(await exchangeMovements()).toHaveLength(0);
    expect(await balanceOf(a.id)).toBe(2);
    expect(await balanceOf(b.id)).toBe(2);
  });

  it('valida la entrada (400): motivo obligatorio y cantidades enteras mayores que cero', async () => {
    const a = await createVariant({ stock: 2 });
    const b = await createVariant({ stock: 2 });
    const bad: Record<string, unknown>[] = [
      { reason: '' },
      { reason: '   ' },
      { returned: { variantId: a.id, quantity: 0 } },
      { returned: { variantId: a.id, quantity: -1 } },
      { returned: { variantId: a.id, quantity: 1.5 } },
      { delivered: { variantId: b.id, quantity: 0 } },
      { delivered: { variantId: 'no-es-uuid', quantity: 1 } },
    ];
    for (const extra of bad) expect((await exchange(a.id, b.id, extra)).statusCode).toBe(400);
    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/inventory/exchanges',
      headers: { cookie },
      payload: { returned: { variantId: a.id, quantity: 1 } },
    });
    expect(missing.statusCode).toBe(400);
    expect(await exchangeMovements()).toHaveLength(0);
  });

  it('caso feliz: dos movimientos con el mismo documento, saldos correctos y auditoría', async () => {
    const returned = await createVariant({ stock: 3, cost: '12.5' });
    const delivered = await createVariant({ stock: 5, cost: '20' });
    const res = await exchange(
      returned.id,
      delivered.id,
      {
        returned: { variantId: returned.id, quantity: 1 },
        delivered: { variantId: delivered.id, quantity: 2 },
        notes: '  Cliente cambia anillo por dos aretes  ',
      },
      { cookie },
    );
    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data.referenceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.reason).toBe('Talla equivocada');
    expect(data.notes).toBe('Cliente cambia anillo por dos aretes');
    expect(data.userId).toBe(userId);
    expect(data.returned).toMatchObject({
      movementType: 'EXCHANGE_IN',
      variantId: returned.id,
      quantity: 1,
      balanceBefore: 3,
      balanceAfter: 4,
      unitCost: '12.5000',
    });
    expect(data.delivered).toMatchObject({
      movementType: 'EXCHANGE_OUT',
      variantId: delivered.id,
      quantity: -2,
      balanceBefore: 5,
      balanceAfter: 3,
      unitCost: '20.0000',
    });

    expect(await balanceOf(returned.id)).toBe(4);
    expect(await balanceOf(delivered.id)).toBe(3);

    const movements = await exchangeMovements();
    expect(movements).toHaveLength(2);
    expect(new Set(movements.map((m) => m.referenceId))).toEqual(new Set([data.referenceId]));
    const byType = Object.fromEntries(movements.map((m) => [m.type, m]));
    expect(byType['EXCHANGE_IN']).toMatchObject({
      variantId: returned.id,
      quantity: 1,
      balanceBefore: 3,
      balanceAfter: 4,
      reason: 'Talla equivocada',
      userId,
    });
    expect(byType['EXCHANGE_OUT']).toMatchObject({
      variantId: delivered.id,
      quantity: -2,
      balanceBefore: 5,
      balanceAfter: 3,
      reason: 'Talla equivocada',
      userId,
    });

    const audits = await app.prisma.auditLog.findMany({ where: { action: 'inventory.exchange' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ userId, entityId: data.referenceId });
    expect(audits[0]?.after).toMatchObject({
      reason: 'Talla equivocada',
      returned: { variantId: returned.id, quantity: 1, balanceBefore: 3, balanceAfter: 4 },
      delivered: { variantId: delivered.id, quantity: -2, balanceBefore: 5, balanceAfter: 3 },
    });
    expect(data.audit).toMatchObject({ action: 'inventory.exchange', userId });
  });

  it('consulta el cambio con ambos movimientos y la auditoría', async () => {
    const a = await createVariant({ stock: 1, cost: '3' });
    const b = await createVariant({ stock: 1, cost: '4' });
    const created = (await exchange(a.id, b.id)).json().data;
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/inventory/exchanges/${created.referenceId}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual(created);

    const unknown = await app.inject({
      method: 'GET',
      url: '/api/v1/inventory/exchanges/01900000-0000-7000-8000-000000000000',
      headers: { cookie },
    });
    expect(unknown.statusCode).toBe(404);
    const malformed = await app.inject({
      method: 'GET',
      url: '/api/v1/inventory/exchanges/no-es-uuid',
      headers: { cookie },
    });
    expect(malformed.statusCode).toBe(400);
  });

  it('atomicidad: si la salida deja el saldo negativo, la entrada también se revierte', async () => {
    const returned = await createVariant({ stock: 2 });
    const delivered = await createVariant({ stock: 1 });
    const res = await exchange(returned.id, delivered.id, {
      delivered: { variantId: delivered.id, quantity: 2 },
    });
    expect(res.statusCode).toBe(422);
    expect(await balanceOf(returned.id)).toBe(2);
    expect(await balanceOf(delivered.id)).toBe(1);
    expect(await exchangeMovements()).toHaveLength(0);
    expect(await app.prisma.auditLog.count({ where: { action: 'inventory.exchange' } })).toBe(0);

    // Variante entregada sin saldo alguno.
    const empty = await createVariant();
    expect((await exchange(returned.id, empty.id)).statusCode).toBe(422);
    expect(await balanceOf(returned.id)).toBe(2);
    expect(await exchangeMovements()).toHaveLength(0);
  });

  it('rechaza la misma variante en ambas líneas (422) sin tocar el stock', async () => {
    const a = await createVariant({ stock: 4 });
    const res = await exchange(a.id, a.id);
    expect(res.statusCode).toBe(422);
    expect(await balanceOf(a.id)).toBe(4);
    expect(await exchangeMovements()).toHaveLength(0);
  });

  it('rechaza variantes inexistentes (404) e inactivas (422)', async () => {
    const active = await createVariant({ stock: 3 });
    const inactive = await createVariant({ stock: 3, active: false });
    const ghost = '01900000-0000-7000-8000-000000000000';
    expect((await exchange(ghost, active.id)).statusCode).toBe(404);
    expect((await exchange(active.id, ghost)).statusCode).toBe(404);
    expect((await exchange(inactive.id, active.id)).statusCode).toBe(422);
    expect((await exchange(active.id, inactive.id)).statusCode).toBe(422);
    expect(await balanceOf(active.id)).toBe(3);
    expect(await exchangeMovements()).toHaveLength(0);
  });

  it('rechaza una variante cuyo producto está inactivo', async () => {
    const a = await createVariant({ stock: 2 });
    const b = await createVariant({ stock: 2 });
    await app.prisma.product.updateMany({
      where: { variants: { some: { id: b.id } } },
      data: { status: 'INACTIVE' },
    });
    expect((await exchange(a.id, b.id)).statusCode).toBe(422);
    expect(await exchangeMovements()).toHaveLength(0);
  });

  it('concurrencia: dos cambios sobre la última unidad, solo uno se aplica', async () => {
    const delivered = await createVariant({ stock: 1 });
    const returnedA = await createVariant({ stock: 0 });
    const returnedB = await createVariant({ stock: 0 });
    const results = await Promise.all([
      exchange(returnedA.id, delivered.id),
      exchange(returnedB.id, delivered.id),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 422]);

    expect(await balanceOf(delivered.id)).toBe(0);
    // Solo la pieza devuelta del cambio ganador entró al stock; la del perdedor se revirtió.
    expect((await balanceOf(returnedA.id)) + (await balanceOf(returnedB.id))).toBe(1);
    const movements = await exchangeMovements();
    expect(movements).toHaveLength(2);
    const minimumBalance = await app.prisma.inventoryBalance.aggregate({
      _min: { quantity: true },
    });
    expect(minimumBalance._min.quantity).toBeGreaterThanOrEqual(0);
  });

  it('sin costs:read las respuestas no traen costos (POST y GET)', async () => {
    const a = await createVariant({ stock: 2, cost: '9.99' });
    const b = await createVariant({ stock: 2, cost: '7.77' });
    const operator = await createTestUser(app.prisma, {
      permissions: [PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_EXCHANGE],
    });
    const session = await login(app, operator.user.email, operator.password);
    const res = await exchange(a.id, b.id, {}, { cookie: session.cookie });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.returned.unitCost).toBeNull();
    expect(res.json().data.delivered.unitCost).toBeNull();
    expect(res.body).not.toContain('9.99');
    expect(res.body).not.toContain('7.77');

    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/inventory/exchanges/${res.json().data.referenceId}`,
      headers: { cookie: session.cookie },
    });
    expect(get.statusCode).toBe(200);
    expect(get.body).not.toContain('9.99');
    expect(get.body).not.toContain('7.77');
    // El movimiento sí conserva el costo en la base de datos (para valorización futura).
    const stored = await app.prisma.inventoryMovement.findFirstOrThrow({
      where: { type: 'EXCHANGE_IN' },
    });
    expect(stored.unitCost?.toFixed(4)).toBe('9.9900');
  });

  it('el Vendedor consulta el cambio sin costos ni auditoría', async () => {
    const a = await createVariant({ stock: 1, cost: '5' });
    const b = await createVariant({ stock: 1, cost: '6' });
    const created = (await exchange(a.id, b.id)).json().data;
    const seller = await createTestUser(app.prisma, {
      permissions: [PERMISSIONS.CATALOG_READ, PERMISSIONS.INVENTORY_READ],
    });
    const session = await login(app, seller.user.email, seller.password);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/inventory/exchanges/${created.referenceId}`,
      headers: { cookie: session.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.audit).toBeNull();
    expect(res.json().data.returned.unitCost).toBeNull();
    expect(res.json().data.delivered.unitCost).toBeNull();

    const noRead = await createTestUser(app.prisma, { permissions: [PERMISSIONS.CATALOG_READ] });
    const noReadSession = await login(app, noRead.user.email, noRead.password);
    const denied = await app.inject({
      method: 'GET',
      url: `/api/v1/inventory/exchanges/${created.referenceId}`,
      headers: { cookie: noReadSession.cookie },
    });
    expect(denied.statusCode).toBe(403);
  });

  it('los movimientos del cambio aparecen en el kardex y el historial con su tipo', async () => {
    const returned = await createVariant({ stock: 1 });
    const delivered = await createVariant({ stock: 1 });
    expect((await exchange(returned.id, delivered.id)).statusCode).toBe(201);

    const kardexIn = await app.inject({
      method: 'GET',
      url: `/api/v1/inventory/${returned.id}/movements`,
      headers: { cookie },
    });
    expect(kardexIn.statusCode).toBe(200);
    expect(kardexIn.json().data[0]).toMatchObject({
      type: 'EXCHANGE_IN',
      quantity: 1,
      balanceBefore: 1,
      balanceAfter: 2,
    });
    const kardexOut = await app.inject({
      method: 'GET',
      url: `/api/v1/inventory/${delivered.id}/movements`,
      headers: { cookie },
    });
    expect(kardexOut.json().data[0]).toMatchObject({
      type: 'EXCHANGE_OUT',
      quantity: -1,
      balanceBefore: 1,
      balanceAfter: 0,
    });

    const all = await app.inject({
      method: 'GET',
      url: '/api/v1/inventory/movements',
      headers: { cookie },
    });
    const types = (all.json().data as { type: string }[]).map((m) => m.type);
    expect(types).toEqual(expect.arrayContaining(['EXCHANGE_IN', 'EXCHANGE_OUT', 'INITIAL_STOCK']));
    // El movimiento no expone costos en el historial global.
    expect(all.body).not.toContain('unitCost');
  });

  it('los movimientos de cambio son append-only (no se editan ni borran)', async () => {
    const a = await createVariant({ stock: 1 });
    const b = await createVariant({ stock: 1 });
    expect((await exchange(a.id, b.id)).statusCode).toBe(201);
    const movement = (await exchangeMovements())[0];
    expect(movement).toBeDefined();
    await expect(
      app.prisma.inventoryMovement.update({
        where: { id: movement?.id ?? 0n },
        data: { quantity: 99 },
      }),
    ).rejects.toThrow();
    await expect(
      app.prisma.inventoryMovement.delete({ where: { id: movement?.id ?? 0n } }),
    ).rejects.toThrow();
  });
});
