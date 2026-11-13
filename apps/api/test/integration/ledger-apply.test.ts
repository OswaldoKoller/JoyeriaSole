/**
 * Contrato de `applyStockChanges` (ADR-007) contra la base real: varias líneas, la misma variante
 * repetida, variante inexistente, saldo negativo, desbordamiento y variantes inactivas.
 */
import { REFERENCE_TYPES } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { AppError } from '../../src/lib/errors.ts';
import {
  MAX_BALANCE,
  applyStockChanges,
  type StockChange,
} from '../../src/modules/inventory/stock-ledger.ts';
import { buildTestApp } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';
import { assertLedgerInvariant } from '../helpers/ledger.ts';

const MISSING_ID = '01900000-0000-7000-8000-0000000000aa';

describe('applyStockChanges (libro de inventario)', () => {
  let app: App;
  let userId: string;
  let counter = 0;

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
    userId = (await createTestUser(app.prisma)).user.id;
  });
  afterEach(() => app.close());

  async function createVariant(options: { active?: boolean; productActive?: boolean } = {}) {
    counter += 1;
    const category = await app.prisma.category.create({
      data: { name: `Cat ${counter}`, slug: `cat-${counter}-${Date.now()}` },
    });
    const product = await app.prisma.product.create({
      data: {
        categoryId: category.id,
        name: `Producto ${counter}`,
        status: options.productActive === false ? 'INACTIVE' : 'ACTIVE',
      },
    });
    return app.prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `LED-${counter}-${Date.now()}`,
        status: options.active === false ? 'INACTIVE' : 'ACTIVE',
      },
    });
  }

  const apply = (changes: StockChange[], options?: Parameters<typeof applyStockChanges>[2]) =>
    app.prisma.$transaction((tx) => applyStockChanges(tx, changes, options));

  const line = (
    variantId: string,
    quantity: number,
    extra: Partial<StockChange> = {},
  ): StockChange => ({
    variantId,
    type: 'ADJUSTMENT',
    quantity,
    userId,
    reason: 'Prueba',
    ...extra,
  });

  const balanceOf = async (variantId: string) =>
    (await app.prisma.inventoryBalance.findUnique({ where: { variantId } }))?.quantity ?? 0;

  it('aplica varias líneas de variantes distintas y devuelve los resultados en el orden pedido', async () => {
    const a = await createVariant();
    const b = await createVariant();
    const c = await createVariant();
    // Se piden en un orden que no es el de id para comprobar que el resultado respeta el de entrada.
    const ordered = [a, b, c].sort((x, y) => (x.id < y.id ? 1 : -1));
    const [first, second, third] = ordered;
    if (!first || !second || !third) throw new Error('faltan variantes');
    const referenceId = '01900000-0000-7000-8000-0000000000bb';

    const results = await apply([
      line(first.id, 5, {
        unitCost: '2.5000',
        referenceType: REFERENCE_TYPES.STOCK_ENTRY,
        referenceId,
      }),
      line(second.id, 7),
      line(third.id, 1, { notes: 'nota' }),
    ]);

    expect(results.map((r) => r.variantId)).toEqual([first.id, second.id, third.id]);
    expect(results.map((r) => [r.balanceBefore, r.balanceAfter])).toEqual([
      [0, 5],
      [0, 7],
      [0, 1],
    ]);
    expect(await balanceOf(first.id)).toBe(5);
    expect(await balanceOf(second.id)).toBe(7);
    expect(await balanceOf(third.id)).toBe(1);

    const movement = await app.prisma.inventoryMovement.findFirstOrThrow({
      where: { variantId: first.id },
    });
    expect(movement).toMatchObject({
      id: results[0]?.movementId,
      quantity: 5,
      balanceBefore: 0,
      balanceAfter: 5,
      referenceType: 'STOCK_ENTRY',
      referenceId,
      reason: 'Prueba',
      userId,
    });
    expect(movement.unitCost?.toFixed(4)).toBe('2.5000');
    await assertLedgerInvariant(app.prisma);
  });

  it('la misma variante repetida encadena los movimientos en el orden de las líneas', async () => {
    const v = await createVariant();
    const other = await createVariant();

    const results = await apply([line(v.id, 5), line(other.id, 2), line(v.id, -2), line(v.id, 1)]);

    expect(results.map((r) => [r.balanceBefore, r.balanceAfter])).toEqual([
      [0, 5],
      [0, 2],
      [5, 3],
      [3, 4],
    ]);
    expect(await balanceOf(v.id)).toBe(4);
    const movements = await app.prisma.inventoryMovement.findMany({
      where: { variantId: v.id },
      orderBy: { id: 'asc' },
    });
    expect(movements.map((m) => [m.quantity, m.balanceBefore, m.balanceAfter])).toEqual([
      [5, 0, 5],
      [-2, 5, 3],
      [1, 3, 4],
    ]);
    const summary = await assertLedgerInvariant(app.prisma);
    expect(summary.movements).toBe(4);
  });

  it('con una variante inexistente falla con un error de negocio claro (no un error crudo de FK) y no escribe nada', async () => {
    const v = await createVariant();

    const failure = await apply([line(v.id, 3), line(MISSING_ID, 1)]).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ message: expect.stringMatching(/variante/i) });
    expect((failure as AppError).statusCode).toBeLessThan(500);
    expect(await app.prisma.inventoryMovement.count()).toBe(0);
    expect(await app.prisma.inventoryBalance.count()).toBe(0);
  });

  it('rechaza dejar el saldo negativo y revierte también las líneas anteriores', async () => {
    const v = await createVariant();
    const w = await createVariant();
    await apply([line(w.id, 2)]);

    const failure = await apply([line(v.id, 4), line(w.id, -3, { label: 'SKU-W' })]).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(AppError);
    expect((failure as AppError).statusCode).toBe(422);
    expect((failure as AppError).message).toContain('SKU-W');
    expect((failure as AppError).message).toContain('negativo');
    expect(await balanceOf(v.id)).toBe(0);
    expect(await balanceOf(w.id)).toBe(2);
    expect(await app.prisma.inventoryMovement.count()).toBe(1);
    await assertLedgerInvariant(app.prisma);
  });

  it('permite dejar el saldo exactamente en cero y rechaza una cantidad nula', async () => {
    const v = await createVariant();
    await apply([line(v.id, 3)]);
    await apply([line(v.id, -3)]);
    expect(await balanceOf(v.id)).toBe(0);

    const failure = await apply([line(v.id, 0)]).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(AppError);
    expect((failure as AppError).statusCode).toBe(422);
    await assertLedgerInvariant(app.prisma);
  });

  it('rechaza superar el máximo de la columna entera y no cambia el saldo', async () => {
    const v = await createVariant();
    await apply([line(v.id, MAX_BALANCE - 1, { label: 'SKU-MAX' })]);

    const failure = await apply([line(v.id, 2, { label: 'SKU-MAX' })]).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(AppError);
    expect((failure as AppError).statusCode).toBe(422);
    expect((failure as AppError).message).toContain('máximo');
    expect(await balanceOf(v.id)).toBe(MAX_BALANCE - 1);
    await apply([line(v.id, 1)]);
    expect(await balanceOf(v.id)).toBe(MAX_BALANCE);
    await assertLedgerInvariant(app.prisma);
  });

  describe('requireActive (validado bajo el bloqueo)', () => {
    it('rechaza una variante inactiva y una variante de producto inactivo, sin escribir nada', async () => {
      const inactiveVariant = await createVariant({ active: false });
      const inactiveProduct = await createVariant({ productActive: false });
      const ok = await createVariant();

      for (const bad of [inactiveVariant, inactiveProduct]) {
        const failure = await apply([line(ok.id, 1), line(bad.id, 1)], {
          requireActive: true,
        }).then(
          () => null,
          (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(AppError);
        expect((failure as AppError).statusCode).toBe(422);
        expect((failure as AppError).message).toBe(`La variante ${bad.sku} está inactiva.`);
      }
      expect(await app.prisma.inventoryMovement.count()).toBe(0);
    });

    it('sin la opción no exige activo (el conteo incluye variantes inactivas con saldo)', async () => {
      const inactive = await createVariant({ active: false });
      await apply([line(inactive.id, 2)]);
      await apply([line(inactive.id, -1)], { requireActive: false });
      expect(await balanceOf(inactive.id)).toBe(1);
    });

    it('el mensaje usa la etiqueta de la línea cuando se informa', async () => {
      const inactive = await createVariant({ active: false });
      const failure = await apply([line(inactive.id, 1, { label: 'ETQ-1' })], {
        requireActive: true,
      }).then(
        () => null,
        (error: unknown) => error,
      );
      expect((failure as AppError).message).toBe('La variante ETQ-1 está inactiva.');
    });
  });
});
