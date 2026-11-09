/**
 * Invariante del libro de inventario tras un escenario mixto (ADR-007): stock inicial, ingreso
 * confirmado, ajuste aprobado, conteo aprobado, cambio de pieza y eliminación de una ficha sin saldo.
 * Para cada variante: saldo = Σ movimientos = balance_after del último movimiento, con cadena continua.
 */
import { PERMISSIONS, type Permission } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase, seedAdjustmentReasons } from '../helpers/db.ts';
import { assertLedgerInvariant } from '../helpers/ledger.ts';

// Cada prueba inicia sesión con Argon2 y encadena decenas de peticiones.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

describe('invariante del libro de inventario', () => {
  let app: App;
  let cookie: string;
  let counter = 0;

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
    const admin = await createTestUser(app.prisma, { permissions: ALL_PERMISSIONS });
    ({ cookie } = await login(app, admin.user.email, admin.password));
  });
  afterEach(() => app.close());

  const call = (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { cookie },
      ...(payload !== undefined && { payload }),
    });

  async function ok(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) {
    const res = await call(method, url, payload);
    expect(res.statusCode, `${method} ${url}: ${res.body}`).toBeLessThan(300);
    return res.json().data as { id: string };
  }

  async function createCategory(name: string) {
    counter += 1;
    return app.prisma.category.create({ data: { name, slug: `${name}-${counter}-${Date.now()}` } });
  }

  async function createVariant(categoryId: string, sku: string) {
    counter += 1;
    const product = await app.prisma.product.create({
      data: { categoryId, name: `Producto ${sku}` },
    });
    return app.prisma.productVariant.create({
      data: { productId: product.id, sku, costPrice: '2' },
    });
  }

  const balanceOf = async (variantId: string) =>
    (await app.prisma.inventoryBalance.findUnique({ where: { variantId } }))?.quantity ?? 0;

  it('se cumple para cada variante tras un escenario mixto', async () => {
    const reasons = await seedAdjustmentReasons(app.prisma);
    const supplier = await app.prisma.supplier.create({ data: { name: 'Proveedor' } });
    const generic = await createCategory('General');
    const counted = await createCategory('Conteo');
    const a = await createVariant(generic.id, 'INV-A');
    const b = await createVariant(generic.id, 'INV-B');
    const c = await createVariant(counted.id, 'INV-C');
    const d = await createVariant(counted.id, 'INV-D');
    const doomed = await createVariant(generic.id, 'INV-E');

    // 1. Stock inicial.
    for (const [variant, quantity] of [
      [a, 10],
      [b, 5],
      [d, 3],
    ] as const) {
      await ok('POST', `/inventory/${variant.id}/initial`, {
        quantity,
        reason: 'Carga inicial de prueba',
      });
    }

    // 2. Ingreso confirmado (dos variantes).
    const entry = await ok('POST', '/stock-entries', { supplierId: supplier.id });
    await ok('PUT', `/stock-entries/${entry.id}/items`, {
      items: [
        { variantId: a.id, receivedQty: 4, unitPrice: '10.00' },
        { variantId: c.id, receivedQty: 6, unitPrice: '5.00' },
      ],
    });
    await ok('POST', `/stock-entries/${entry.id}/confirm`);

    // 3. Ajuste aprobado (y una solicitud que dejaría el saldo negativo, rechazada sin efectos).
    const adjustment = await ok('POST', '/inventory/adjustments', {
      reasonId: reasons.get('LOSS'),
      items: [{ variantId: a.id, quantityDelta: -3 }],
    });
    await ok('POST', `/inventory/adjustments/${adjustment.id}/approve`);
    const tooMuch = await call('POST', '/inventory/adjustments', {
      reasonId: reasons.get('LOSS'),
      items: [{ variantId: b.id, quantityDelta: -99 }],
    });
    expect(tooMuch.statusCode).toBe(422);

    // 4. Cambio de pieza: entra A, sale B.
    await ok('POST', '/inventory/exchanges', {
      returned: { variantId: a.id, quantity: 1 },
      delivered: { variantId: b.id, quantity: 1 },
      reason: 'Talla equivocada',
    });

    // 5. Conteo aprobado: C tiene 6 en sistema y se cuentan 5; D coincide (3).
    const count = await ok('POST', '/inventory/counts', { categoryId: counted.id });
    await ok('POST', `/inventory/counts/${count.id}/start`);
    const scanTimes = async (sku: string, times: number) => {
      for (let i = 0; i < times; i += 1) {
        await ok('POST', `/inventory/counts/${count.id}/scan`, { code: sku });
      }
    };
    // Primera ronda: C con diferencia (5 de 6) y D igual. El segundo recuento solo repasa lo que difiere.
    await scanTimes('INV-C', 5);
    await scanTimes('INV-D', 3);
    await ok('POST', `/inventory/counts/${count.id}/close`);
    await scanTimes('INV-C', 5);
    await ok('POST', `/inventory/counts/${count.id}/close`);
    await ok('POST', `/inventory/counts/${count.id}/approve`);

    // 6. Eliminación de una ficha sin saldo ni historial.
    await ok('DELETE', `/products/${doomed.productId}`);
    expect(await app.prisma.productVariant.count({ where: { id: doomed.id } })).toBe(0);

    // Saldos esperados (comprobación independiente de la invariante).
    expect(await balanceOf(a.id)).toBe(12); // 10 + 4 - 3 + 1
    expect(await balanceOf(b.id)).toBe(4); // 5 - 1
    expect(await balanceOf(c.id)).toBe(5); // 6 - 1 (conteo)
    expect(await balanceOf(d.id)).toBe(3);

    const summary = await assertLedgerInvariant(app.prisma);
    expect(summary).toEqual({ variantsWithMovements: 4, movements: 9 });
  });
});
