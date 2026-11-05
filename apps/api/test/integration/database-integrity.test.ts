/**
 * Verifica las garantías de integridad que viven en la BASE DE DATOS (no en el código):
 * unicidad de SKU/código de barras, coherencia del libro de movimientos y tablas append-only.
 * Son la última línea de defensa si un servicio tuviera un bug.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../src/lib/prisma.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';
import { testDatabaseUrl } from '../helpers/test-env.ts';

describe('integridad de la base de datos', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createPrismaClient(testDatabaseUrl());
  });
  beforeEach(() => resetDatabase(prisma));
  afterAll(() => prisma.$disconnect());

  async function createVariant(sku: string, barcode?: string) {
    const category = await prisma.category.upsert({
      where: { slug: 'anillos' },
      update: {},
      create: { name: 'Anillos', slug: 'anillos' },
    });
    const product = await prisma.product.create({
      data: { name: 'Anillo de prueba', categoryId: category.id },
    });
    return prisma.productVariant.create({
      data: { productId: product.id, sku, barcode: barcode ?? null },
    });
  }

  it('SKU y código de barras son únicos', async () => {
    await createVariant('SKU-1', '7790000000001');
    await expect(createVariant('SKU-1')).rejects.toMatchObject({ code: 'P2002' });
    await expect(createVariant('SKU-2', '7790000000001')).rejects.toMatchObject({ code: 'P2002' });
  });

  it('un movimiento debe cumplir balance_after = balance_before + quantity y quantity ≠ 0', async () => {
    const { user } = await createTestUser(prisma);
    const variant = await createVariant('SKU-1');
    const base = { variantId: variant.id, type: 'INITIAL_STOCK' as const, userId: user.id };

    await expect(
      prisma.inventoryMovement.create({
        data: { ...base, quantity: 5, balanceBefore: 0, balanceAfter: 5 },
      }),
    ).resolves.toBeTruthy();
    await expect(
      prisma.inventoryMovement.create({
        data: { ...base, quantity: 5, balanceBefore: 5, balanceAfter: 9 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.inventoryMovement.create({
        data: { ...base, quantity: 0, balanceBefore: 5, balanceAfter: 5 },
      }),
    ).rejects.toThrow();
  });

  it('los movimientos de inventario no se pueden modificar ni borrar', async () => {
    const { user } = await createTestUser(prisma);
    const variant = await createVariant('SKU-1');
    const movement = await prisma.inventoryMovement.create({
      data: {
        variantId: variant.id,
        type: 'INITIAL_STOCK',
        quantity: 3,
        balanceBefore: 0,
        balanceAfter: 3,
        userId: user.id,
      },
    });

    await expect(
      prisma.inventoryMovement.update({ where: { id: movement.id }, data: { notes: 'editado' } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.inventoryMovement.delete({ where: { id: movement.id } })).rejects.toThrow(
      /append-only/,
    );
  });

  it('la auditoría no se puede alterar, pero sobrevive a la eliminación del usuario', async () => {
    const { user } = await createTestUser(prisma);
    const log = await prisma.auditLog.create({ data: { action: 'test.action', userId: user.id } });

    await expect(
      prisma.auditLog.update({ where: { id: log.id }, data: { action: 'falsificado' } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/append-only/);

    await prisma.user.delete({ where: { id: user.id } });
    const after = await prisma.auditLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(after.userId).toBeNull();
    expect(after.action).toBe('test.action');
  });

  it('no permite precios ni stock mínimo negativos', async () => {
    const variant = await createVariant('SKU-1');
    await expect(
      prisma.productVariant.update({ where: { id: variant.id }, data: { salePrice: -1 } }),
    ).rejects.toThrow();
    await expect(
      prisma.productVariant.update({ where: { id: variant.id }, data: { minStock: -1 } }),
    ).rejects.toThrow();
  });

  it('no permite saldos de inventario negativos (P-08)', async () => {
    const variant = await createVariant('SKU-1');
    await prisma.inventoryBalance.create({ data: { variantId: variant.id, quantity: 2 } });

    // Cero es válido; por debajo de cero, la base de datos lo rechaza.
    await expect(
      prisma.inventoryBalance.update({ where: { variantId: variant.id }, data: { quantity: 0 } }),
    ).resolves.toBeTruthy();
    await expect(
      prisma.inventoryBalance.update({ where: { variantId: variant.id }, data: { quantity: -1 } }),
    ).rejects.toThrow(/inventory_balances_quantity_check/);
    await expect(
      prisma.$executeRaw`UPDATE inventory_balances SET quantity = quantity - 1 WHERE variant_id = ${variant.id}::uuid`,
    ).rejects.toThrow(/inventory_balances_quantity_check/);

    const other = await createVariant('SKU-2');
    await expect(
      prisma.inventoryBalance.create({ data: { variantId: other.id, quantity: -5 } }),
    ).rejects.toThrow(/inventory_balances_quantity_check/);
    const stored = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { variantId: variant.id },
    });
    expect(stored.quantity).toBe(0);
  });
});
