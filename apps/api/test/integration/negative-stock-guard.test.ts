/**
 * P-08: aunque un bug de código intentara dejar un saldo negativo, la restricción de la base de
 * datos revierte TODA la transacción y al cliente no se le revela ningún detalle interno.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';

describe('saldo negativo rechazado por la base de datos (P-08)', () => {
  let app: App;
  let variantId: string;
  let userId: string;

  beforeEach(async () => {
    app = await buildTestApp((instance) => {
      // Ruta solo de prueba: simula un servicio defectuoso que deja el saldo en -1.
      instance.post('/api/v1/__test/negative-stock', async () => {
        await instance.prisma.$transaction(async (tx) => {
          await tx.inventoryMovement.create({
            data: {
              variantId,
              type: 'INITIAL_STOCK',
              quantity: -3,
              balanceBefore: 2,
              balanceAfter: -1,
              userId,
            },
          });
          await tx.inventoryBalance.update({ where: { variantId }, data: { quantity: -1 } });
        });
        return { data: 'no debería llegar aquí' };
      });
    });
    await resetDatabase(app.prisma);
    const category = await app.prisma.category.create({ data: { name: 'C', slug: 'c' } });
    const product = await app.prisma.product.create({
      data: { categoryId: category.id, name: 'P' },
    });
    const variant = await app.prisma.productVariant.create({
      data: { productId: product.id, sku: 'SKU-NEG' },
    });
    variantId = variant.id;
    await app.prisma.inventoryBalance.create({ data: { variantId, quantity: 2 } });
    userId = (await createTestUser(app.prisma)).user.id;
  });
  afterEach(() => app.close());

  it('revierte el movimiento y responde 500 genérico sin detalles internos', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/__test/negative-stock' });
    expect(res.statusCode).toBe(500);
    const { error } = res.json();
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.message).toBe(
      'Ocurrió un error inesperado. Si persiste, contacte al administrador.',
    );
    expect(error.requestId).toBeTruthy();
    expect(res.body).not.toMatch(
      /inventory_balances|constraint|check|quantity|prisma|SELECT|UPDATE/i,
    );

    // Nada quedó a medias: ni el movimiento ni el saldo cambiaron.
    expect(await app.prisma.inventoryMovement.count()).toBe(0);
    const balance = await app.prisma.inventoryBalance.findUniqueOrThrow({ where: { variantId } });
    expect(balance.quantity).toBe(2);
  });
});
