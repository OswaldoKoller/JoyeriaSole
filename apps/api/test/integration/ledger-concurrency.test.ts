/**
 * Concurrencia sobre el libro de inventario (ADR-007).
 *
 * Las carreras se ordenan de forma determinista: una transacción de la prueba retiene el bloqueo de
 * la variante (como lo haría una operación de stock en curso), las demás operaciones reales se
 * lanzan por HTTP y se espera a que queden bloqueadas en la base antes de soltar el bloqueo.
 *
 *   - Desactivar un producto o una variante frente a confirmar un ingreso o aprobar un ajuste:
 *     nunca debe quedar un producto/variante INACTIVE con stock (P-22).
 *   - Eliminar una ficha frente a una operación de stock: sin interbloqueo; si Postgres abortara
 *     una transacción, el cliente recibiría 503 (error-handler) y nunca 500.
 */
import { PERMISSIONS, type Permission } from '@joyeria/shared';
import type { LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../../src/app.ts';
import { applyStockChanges } from '../../src/modules/inventory/stock-ledger.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase, seedAdjustmentReasons } from '../helpers/db.ts';
import { assertLedgerInvariant } from '../helpers/ledger.ts';
import { blockedSessions, holdVariantLock, startAndWait } from '../helpers/locks.ts';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

type Target = 'variant' | 'product';
type Operation = 'entry' | 'adjustment';
type Order = 'deactivation-first' | 'operation-first';

describe('concurrencia del libro de inventario', () => {
  let app: App;
  let cookie: string;
  let userId: string;
  let supplierId: string;
  let reasonId: string;
  let counter = 0;

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
    const admin = await createTestUser(app.prisma, { permissions: ALL_PERMISSIONS });
    userId = admin.user.id;
    ({ cookie } = await login(app, admin.user.email, admin.password));
    supplierId = (await app.prisma.supplier.create({ data: { name: 'Proveedor' } })).id;
    const reasons = await seedAdjustmentReasons(app.prisma);
    const reason = reasons.get('LOSS');
    if (!reason) throw new Error('falta el motivo de ajuste de prueba');
    reasonId = reason;
  });
  afterEach(() => app.close());

  const call = (
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ): Promise<LightMyRequestResponse> =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { cookie },
      ...(payload !== undefined && { payload }),
    });

  async function createActiveVariant() {
    counter += 1;
    const category = await app.prisma.category.create({
      data: { name: `Cat ${counter}`, slug: `cat-${counter}-${Date.now()}` },
    });
    const product = await app.prisma.product.create({
      data: { categoryId: category.id, name: `Producto ${counter}` },
    });
    const variant = await app.prisma.productVariant.create({
      data: { productId: product.id, sku: `CON-${counter}-${Date.now()}`, costPrice: '1' },
    });
    return { product, variant };
  }

  /** Borrador de ingreso con la variante, listo para confirmar. */
  async function prepareEntry(variantId: string) {
    const draft = await call('POST', '/stock-entries', { supplierId });
    expect(draft.statusCode, draft.body).toBe(201);
    const id = (draft.json().data as { id: string }).id;
    const items = await call('PUT', `/stock-entries/${id}/items`, {
      items: [{ variantId, receivedQty: 3, unitPrice: '10.00' }],
    });
    expect(items.statusCode, items.body).toBe(200);
    return () => call('POST', `/stock-entries/${id}/confirm`);
  }

  /** Ajuste pendiente (+2) listo para aprobar. */
  async function prepareAdjustment(variantId: string) {
    const created = await call('POST', '/inventory/adjustments', {
      reasonId,
      items: [{ variantId, quantityDelta: 2 }],
    });
    expect(created.statusCode, created.body).toBe(201);
    const id = (created.json().data as { id: string }).id;
    return () => call('POST', `/inventory/adjustments/${id}/approve`);
  }

  const cases: [Target, Operation, Order][] = [];
  for (const target of ['variant', 'product'] as const) {
    for (const operation of ['entry', 'adjustment'] as const) {
      for (const order of ['deactivation-first', 'operation-first'] as const) {
        cases.push([target, operation, order]);
      }
    }
  }

  it.each(cases)(
    'desactivar %s frente a %s (%s): nunca queda INACTIVE con stock',
    async (target, operation, order) => {
      const { product, variant } = await createActiveVariant();
      const runOperation =
        operation === 'entry'
          ? await prepareEntry(variant.id)
          : await prepareAdjustment(variant.id);
      const deactivate = () =>
        target === 'variant'
          ? call('PATCH', `/products/variants/${variant.id}/status`, { status: 'INACTIVE' })
          : call('PATCH', `/products/${product.id}`, { status: 'INACTIVE' });

      // Una operación de stock en curso retiene la variante mientras llegan las dos peticiones.
      const holder = holdVariantLock(app.prisma, variant.id);
      await holder.ready;

      const [firstStart, secondStart] =
        order === 'deactivation-first' ? [deactivate, runOperation] : [runOperation, deactivate];
      const first = await startAndWait(app.prisma, firstStart, 0);
      const second = await startAndWait(app.prisma, secondStart, await blockedSessions(app.prisma));

      holder.release();
      await holder.finished;
      const responses = await Promise.all([first.promise, second.promise]);
      const [deactivation, applied] =
        order === 'deactivation-first' ? responses : [responses[1], responses[0]];

      expect(deactivation.statusCode, deactivation.body).toBeLessThan(500);
      expect(applied.statusCode, applied.body).toBeLessThan(500);
      // Si la operación de stock se aplicó, la desactivación debió rechazarse; y al revés.
      expect(
        [deactivation.statusCode, applied.statusCode],
        'desactivación y operación de stock no pueden tener éxito a la vez',
      ).not.toEqual([200, 200]);
      await assertLedgerInvariant(app.prisma);
    },
  );

  it('eliminar una ficha mientras otra operación de stock toma sus bloqueos no interbloquea', async () => {
    const { product, variant } = await createActiveVariant();
    // Ficha sin historial, pero con su fila de saldo en cero (el libro la crea al primer movimiento).
    await app.prisma.inventoryBalance.create({ data: { variantId: variant.id, quantity: 0 } });

    // Operación de stock en curso: ya tiene la variante y pedirá el saldo (variante -> saldo).
    const holder = holdVariantLock(app.prisma, variant.id, (tx) =>
      applyStockChanges(tx, [
        {
          variantId: variant.id,
          type: 'ADJUSTMENT',
          quantity: 5,
          userId,
          reason: 'Ingreso simulado',
        },
      ]),
    );
    await holder.ready;

    const removal = await startAndWait(
      app.prisma,
      () => call('DELETE', `/products/${product.id}`),
      0,
    );
    expect(removal.blocked, 'la eliminación debe esperar el bloqueo de la variante').toBe(true);

    holder.release();
    const [applied, response] = await Promise.allSettled([holder.finished, removal.promise]);

    // Sin interbloqueo: la operación de stock se confirma y la eliminación se rechaza con 422
    // porque la ficha ya tiene movimientos. Jamás 500 (un aborto de Postgres sería 503).
    expect(applied.status, 'la operación de stock no debe abortarse').toBe('fulfilled');
    expect(response.status).toBe('fulfilled');
    if (response.status === 'fulfilled') {
      expect(response.value.statusCode, response.value.body).toBe(422);
      expect(response.value.json().error.message).toContain('movimiento');
    }

    expect(
      (await app.prisma.inventoryBalance.findUniqueOrThrow({ where: { variantId: variant.id } }))
        .quantity,
    ).toBe(5);
    expect(await app.prisma.productVariant.count({ where: { id: variant.id } })).toBe(1);
    await assertLedgerInvariant(app.prisma);
  });
});
