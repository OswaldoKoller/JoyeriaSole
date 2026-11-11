/**
 * Verifica las garantías de integridad que viven en la BASE DE DATOS (no en el código):
 * unicidad de SKU/código de barras, coherencia del libro de movimientos y tablas append-only,
 * saldo == libro (I-01), un movimiento por documento y variante (I-02) y el script que quita
 * TRUNCATE al rol de la aplicación en producción (D3). Son la última línea de defensa si un
 * servicio tuviera un bug: cada prueba intenta violar la garantía con escrituras directas.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Prisma } from '../../src/generated/prisma/client.ts';
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

  /** Movimiento + saldo en la misma transacción: la única forma válida de mover stock. */
  function movementWithBalance(
    variantId: string,
    userId: string,
    move: { quantity: number; before: number; referenceId?: string; type?: 'ADJUSTMENT' },
  ) {
    const after = move.before + move.quantity;
    return prisma.$transaction([
      prisma.inventoryMovement.create({
        data: {
          variantId,
          userId,
          type: move.type ?? 'INITIAL_STOCK',
          quantity: move.quantity,
          balanceBefore: move.before,
          balanceAfter: after,
          referenceType: move.referenceId ? 'INVENTORY_ADJUSTMENT' : null,
          referenceId: move.referenceId ?? null,
        },
      }),
      prisma.inventoryBalance.upsert({
        where: { variantId },
        update: { quantity: after },
        create: { variantId, quantity: after },
      }),
    ]);
  }

  it('un movimiento debe cumplir balance_after = balance_before + quantity y quantity ≠ 0', async () => {
    const { user } = await createTestUser(prisma);
    const variant = await createVariant('SKU-1');
    const base = { variantId: variant.id, type: 'INITIAL_STOCK' as const, userId: user.id };

    await expect(
      movementWithBalance(variant.id, user.id, { quantity: 5, before: 0 }),
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
    const [movement] = await movementWithBalance(variant.id, user.id, { quantity: 3, before: 0 });

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
    // Cero es válido (y coincide con un libro vacío); por debajo de cero, el CHECK lo rechaza de
    // inmediato, antes de que se evalúe I-01 al confirmar.
    await expect(
      prisma.inventoryBalance.create({ data: { variantId: variant.id, quantity: 0 } }),
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

  describe('I-01 · el saldo coincide con el libro de movimientos', () => {
    let userId: string;
    let variantId: string;

    beforeEach(async () => {
      userId = (await createTestUser(prisma)).user.id;
      variantId = (await createVariant('SKU-I01')).id;
      await movementWithBalance(variantId, userId, { quantity: 4, before: 0 });
    });

    const stock = async () =>
      (await prisma.inventoryBalance.findUniqueOrThrow({ where: { variantId } })).quantity;

    it('rechaza cambiar el saldo por SQL directo, sin movimiento', async () => {
      await expect(
        prisma.$executeRaw`UPDATE inventory_balances SET quantity = 9 WHERE variant_id = ${variantId}::uuid`,
      ).rejects.toThrow(/I-01.*no coincide con el libro/);
      await expect(
        prisma.inventoryBalance.update({ where: { variantId }, data: { quantity: 3 } }),
      ).rejects.toThrow(/I-01/);
      expect(await stock()).toBe(4);
    });

    it('rechaza un saldo con stock sin movimientos y borrar un saldo con stock', async () => {
      const other = await createVariant('SKU-I01-B');
      await expect(
        prisma.inventoryBalance.create({ data: { variantId: other.id, quantity: 3 } }),
      ).rejects.toThrow(/I-01/);
      await expect(prisma.inventoryBalance.delete({ where: { variantId } })).rejects.toThrow(
        /I-01/,
      );
      expect(await stock()).toBe(4);
      // Un saldo en cero sin movimientos sí es coherente (lo crea el libro y lo borra products.remove).
      await prisma.inventoryBalance.create({ data: { variantId: other.id, quantity: 0 } });
      await prisma.inventoryBalance.delete({ where: { variantId: other.id } });
    });

    it('rechaza un movimiento que no actualiza el saldo', async () => {
      await expect(
        prisma.inventoryMovement.create({
          data: {
            variantId,
            userId,
            type: 'ADJUSTMENT',
            quantity: 1,
            balanceBefore: 4,
            balanceAfter: 5,
          },
        }),
      ).rejects.toThrow(/I-01/);
      expect(await prisma.inventoryMovement.count({ where: { variantId } })).toBe(1);
    });

    it('rechaza un movimiento que rompe la cadena aunque el saldo final cuadre', async () => {
      await expect(
        movementWithBalance(variantId, userId, { quantity: 1, before: 7, type: 'ADJUSTMENT' }),
      ).rejects.toThrow(/I-01.*parte de 7 pero el libro estaba en 4/);
      expect(await stock()).toBe(4);
    });

    it('se evalúa al confirmar: revierte TODA la transacción (también su auditoría)', async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.auditLog.create({ data: { action: 'test.desfase', userId } });
          await tx.$executeRaw`UPDATE inventory_balances SET quantity = 0 WHERE variant_id = ${variantId}::uuid`;
        }),
      ).rejects.toThrow(/I-01/);
      expect(await prisma.auditLog.count({ where: { action: 'test.desfase' } })).toBe(0);
      expect(await stock()).toBe(4);
    });

    it('acepta varios movimientos de la misma variante en una transacción si el saldo final cuadra', async () => {
      await prisma.$transaction([
        prisma.inventoryMovement.create({
          data: {
            variantId,
            userId,
            type: 'ADJUSTMENT',
            quantity: -1,
            balanceBefore: 4,
            balanceAfter: 3,
          },
        }),
        prisma.inventoryMovement.create({
          data: {
            variantId,
            userId,
            type: 'ADJUSTMENT',
            quantity: 5,
            balanceBefore: 3,
            balanceAfter: 8,
          },
        }),
        prisma.inventoryBalance.update({ where: { variantId }, data: { quantity: 8 } }),
      ]);
      expect(await stock()).toBe(8);
    });
  });

  describe('I-02 · un movimiento por documento, variante y tipo', () => {
    it('rechaza dos movimientos de la misma variante y tipo bajo el mismo documento', async () => {
      const { user } = await createTestUser(prisma);
      const variant = await createVariant('SKU-I02');
      const other = await createVariant('SKU-I02-B');
      const documentId = randomUUID();
      const adjustment = { type: 'ADJUSTMENT' as const, referenceId: documentId };
      await movementWithBalance(variant.id, user.id, { quantity: 2, before: 0, ...adjustment });

      // Mismo documento, misma variante y mismo tipo: la base lo rechaza aunque la cadena cuadre.
      await expect(
        movementWithBalance(variant.id, user.id, { quantity: 1, before: 2, ...adjustment }),
      ).rejects.toMatchObject({ code: 'P2002' });
      expect(await prisma.inventoryMovement.count({ where: { referenceId: documentId } })).toBe(1);

      // Otra variante del mismo documento, otro tipo o sin documento: permitidos.
      await movementWithBalance(other.id, user.id, { quantity: 1, before: 0, ...adjustment });
      await movementWithBalance(variant.id, user.id, {
        quantity: 1,
        before: 2,
        referenceId: documentId,
      });
      await movementWithBalance(variant.id, user.id, { quantity: 1, before: 3 });
      await movementWithBalance(variant.id, user.id, { quantity: 1, before: 4 });
      expect(await prisma.inventoryMovement.count({ where: { referenceId: documentId } })).toBe(3);
    });
  });

  describe('D3 · rol de la aplicación sin TRUNCATE (prisma/privileges/revoke-app-truncate.sql)', () => {
    const script = readFileSync(
      path.resolve(import.meta.dirname, '../../prisma/privileges/revoke-app-truncate.sql'),
      'utf8',
    );
    const LEDGER_TABLES = ['inventory_movements', 'audit_logs', 'inventory_balances'];
    class Rollback extends Error {}

    async function privilege(tx: Prisma.TransactionClient, table: string, kind: string) {
      const [row] = await tx.$queryRaw<{ ok: boolean }[]>`
        SELECT has_table_privilege(current_user, ${table}::text, ${kind}::text) AS ok`;
      return row?.ok;
    }

    it('quita TRUNCATE en las tablas actuales y futuras sin tocar el resto de privilegios', async () => {
      // Se simula el rol de producción (no superusuario y DUEÑO de las tablas, porque migra y opera
      // con el mismo DATABASE_URL) dentro de una transacción que se revierte: la base de pruebas
      // conserva TRUNCATE para resetDatabase.
      const role = `app_${randomBytes(6).toString('hex')}`;
      const outcome = await prisma
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER`);
          for (const table of LEDGER_TABLES) {
            await tx.$executeRawUnsafe(`ALTER TABLE "${table}" OWNER TO "${role}"`);
          }
          await tx.$executeRawUnsafe(`GRANT CREATE ON SCHEMA public TO "${role}"`);
          await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
          expect(await privilege(tx, 'inventory_movements', 'TRUNCATE')).toBe(true);

          await tx.$executeRawUnsafe(script);
          await tx.$executeRawUnsafe(script); // idempotente

          for (const table of LEDGER_TABLES) {
            expect(await privilege(tx, table, 'TRUNCATE'), table).toBe(false);
            for (const kind of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
              expect(await privilege(tx, table, kind), `${table} ${kind}`).toBe(true);
            }
          }
          // Una tabla que el rol cree después (como haría una migración futura con el dueño)
          // nace sin TRUNCATE para él.
          await tx.$executeRawUnsafe('CREATE TABLE d3_future_table (id integer)');
          expect(await privilege(tx, 'd3_future_table', 'TRUNCATE')).toBe(false);
          expect(await privilege(tx, 'd3_future_table', 'INSERT')).toBe(true);

          await tx.$executeRawUnsafe('SAVEPOINT before_truncate');
          await expect(tx.$executeRawUnsafe('TRUNCATE TABLE audit_logs')).rejects.toThrow(
            /permission denied/i,
          );
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT before_truncate');
          throw new Rollback();
        })
        .catch((error: unknown) => error);
      // Cualquier otro error (o una aserción fallida dentro de la transacción) se muestra tal cual.
      if (!(outcome instanceof Rollback)) {
        throw outcome instanceof Error ? outcome : new Error(String(outcome));
      }

      // Todo se revirtió: el rol temporal no existe y las pruebas conservan TRUNCATE.
      const [exists] = await prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_roles WHERE rolname = ${role}`;
      expect(exists?.n).toBe(0);
    });
  });
});
