/**
 * Invariantes de ventas y caja (plan 11 §6.3) tras una secuencia mixta: ingresos de stock, ventas
 * concurrentes con pagos combinados, cierres (con y sin diferencia), correcciones y una segunda sesión.
 */
import { randomUUID } from 'node:crypto';
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, type Permission } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';
import { assertLedgerInvariant } from '../helpers/ledger.ts';
import { createSellableVariant, seedPaymentMethods } from '../helpers/sales.ts';
import { setStock } from '../helpers/stock.ts';

vi.setConfig({ testTimeout: 120_000 });

let app: App;
beforeEach(async () => {
  app = await buildTestApp();
  await resetDatabase(app.prisma);
  await seedPaymentMethods(app.prisma);
});
afterEach(() => app.close());

async function sessionWith(permissions: Permission[]) {
  const { user, password } = await createTestUser(app.prisma, { permissions });
  const { cookie } = await login(app, user.email, password);
  return { userId: user.id, cookie };
}

function post(cookie: string, url: string, payload: unknown) {
  return app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: { cookie, 'idempotency-key': randomUUID() },
    payload: payload as object,
  });
}

describe('invariantes de ventas y caja', () => {
  it('se cumplen tras una secuencia mixta', async () => {
    const seller = await sessionWith([...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions]);
    const manager = await sessionWith([...DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions]);
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    const variants = await Promise.all(
      ['50.00', '80.00', '125.50'].map((price) =>
        createSellableVariant(app.prisma, { stock: 6, price, userId: manager.userId }),
      ),
    );
    const sale = (cookie: string, index: number, quantity: number, payments: object[]) => {
      const variant = variants[index];
      if (!variant) throw new Error('variante');
      const total = (Number(variant.salePrice) * quantity).toFixed(2);
      return post(cookie, '/sales', {
        items: [
          { variantId: variant.id, quantity, expectedUnitPrice: variant.salePrice.toFixed(2) },
        ],
        payments,
        expectedTotal: total,
      });
    };

    // Sesión 1: ventas concurrentes (efectivo con vuelto, QR, mixtas) y un ingreso entre medio.
    const s1 = (await post(manager.cookie, '/cash/sessions', { openingAmount: '200' })).json().data;
    const batch = await Promise.all([
      sale(seller.cookie, 0, 2, [{ methodCode: 'CASH', amount: '100', tendered: '150' }]),
      sale(manager.cookie, 1, 1, [{ methodCode: 'QR', amount: '80' }]),
      sale(seller.cookie, 2, 2, [
        { methodCode: 'CASH', amount: '51', tendered: '60' },
        { methodCode: 'BANK_TRANSFER', amount: '200' },
      ]),
      sale(admin.cookie, 0, 1, [
        { methodCode: 'QR', amount: '20' },
        { methodCode: 'CASH', amount: '30', tendered: '30' },
      ]),
    ]);
    expect(batch.map((r) => r.statusCode)).toEqual([201, 201, 201, 201]);
    await setStock(app.prisma, variants[1]?.id ?? '', 10, {
      userId: manager.userId,
      type: 'STOCK_ENTRY',
    });
    expect(
      (await sale(seller.cookie, 1, 3, [{ methodCode: 'CASH', amount: '240', tendered: '240' }]))
        .statusCode,
    ).toBe(201);
    // Esperado: 200 + 100 + 51 + 30 + 240 = 621; se cuentan 620 (faltante con observación).
    const closed1 = await post(manager.cookie, `/cash/sessions/${String(s1.id)}/close`, {
      countedCash: '620',
      notes: 'Falta 1 Bs',
    });
    expect(closed1.json().data).toMatchObject({ expectedCash: '621.00', difference: '-1.00' });
    expect(
      (
        await post(admin.cookie, `/cash/sessions/${String(s1.id)}/corrections`, {
          kind: 'COUNTED_CASH',
          expectedPreviousValue: '620',
          newValue: '621',
          reason: 'Recuento con testigo: había 1 Bs',
        })
      ).statusCode,
    ).toBe(201);

    // Sesión 2: más ventas y cierre exacto.
    const s2 = (await post(manager.cookie, '/cash/sessions', { openingAmount: '0' })).json().data;
    expect(
      (await sale(seller.cookie, 2, 1, [{ methodCode: 'CASH', amount: '125.50', tendered: '200' }]))
        .statusCode,
    ).toBe(201);
    expect(
      (await sale(seller.cookie, 0, 1, [{ methodCode: 'BANK_TRANSFER', amount: '50' }])).statusCode,
    ).toBe(201);
    expect(
      (
        await post(manager.cookie, `/cash/sessions/${String(s2.id)}/close`, {
          countedCash: '125.50',
        })
      ).statusCode,
    ).toBe(200);
    // Sesión 3 queda abierta con una venta.
    await post(manager.cookie, '/cash/sessions', { openingAmount: '10' });
    expect((await sale(seller.cookie, 1, 1, [{ methodCode: 'QR', amount: '80' }])).statusCode).toBe(
      201,
    );

    // 1. Libro: saldo = Σ movimientos = último balance_after, cadena continua.
    const ledger = await assertLedgerInvariant(app.prisma);
    expect(ledger.variantsWithMovements).toBe(3);

    // 2. Para toda venta: Σ líneas = total = Σ pagos.
    const sums = await app.prisma.$queryRaw<{ id: string }[]>`
      SELECT s.id::text AS id FROM sales s
      WHERE s.total <> (SELECT sum(line_total) FROM sale_items WHERE sale_id = s.id)
         OR s.total <> (SELECT sum(amount) FROM sale_payments WHERE sale_id = s.id)`;
    expect(sums).toEqual([]);

    // 3. Un movimiento SALE por línea con cantidad negada; ninguna venta sin movimientos ni viceversa.
    const lines = await app.prisma.$queryRaw<{ problem: string }[]>`
      SELECT 'línea sin su movimiento' AS problem FROM sale_items i
        LEFT JOIN inventory_movements m ON m.id = i.movement_id
        WHERE m.id IS NULL OR m.type <> 'SALE' OR m.quantity <> -i.quantity
           OR m.reference_id <> i.sale_id OR m.variant_id <> i.variant_id
      UNION ALL
      SELECT 'movimiento SALE sin línea' FROM inventory_movements m
        WHERE m.type = 'SALE' AND NOT EXISTS (SELECT 1 FROM sale_items i WHERE i.movement_id = m.id)
      UNION ALL
      SELECT 'venta sin movimientos' FROM sales s
        WHERE NOT EXISTS (SELECT 1 FROM inventory_movements m WHERE m.reference_type = 'SALE' AND m.reference_id = s.id)`;
    expect(lines).toEqual([]);
    expect(await app.prisma.inventoryMovement.count({ where: { type: 'SALE' } })).toBe(
      await app.prisma.saleItem.count(),
    );

    // 4. Sesión cerrada: esperado congelado = fondo + Σ pagos en efectivo recalculado.
    const sessions = await app.prisma.$queryRaw<{ number: number }[]>`
      SELECT c.number FROM cash_sessions c
      WHERE c.status = 'CLOSED' AND c.expected_cash <> c.opening_amount + COALESCE((
        SELECT sum(p.amount) FROM sale_payments p JOIN sales s ON s.id = p.sale_id
        WHERE s.cash_session_id = c.id AND p.method_is_cash), 0)`;
    expect(sessions).toEqual([]);
    expect(await app.prisma.cashSession.count({ where: { status: 'CLOSED' } })).toBe(2);

    // 5. Para toda sesión: Σ totales por medio = Σ ventas de la sesión.
    for (const session of await app.prisma.cashSession.findMany()) {
      const detail = (
        await app.inject({
          method: 'GET',
          url: `/api/v1/cash/sessions/${session.id}`,
          headers: { cookie: manager.cookie },
        })
      ).json().data as { totalsByMethod: { amount: string }[]; salesTotal: string };
      const byMethod = detail.totalsByMethod.reduce(
        (sum, m) => sum + Math.round(Number(m.amount) * 100),
        0,
      );
      expect(byMethod).toBe(Math.round(Number(detail.salesTotal) * 100));
    }

    // 6. Como máximo una sesión abierta; ninguna venta anterior a la apertura de su sesión.
    expect(await app.prisma.cashSession.count({ where: { status: 'OPEN' } })).toBe(1);
    const early = await app.prisma.$queryRaw<{ id: string }[]>`
      SELECT s.id::text AS id FROM sales s JOIN cash_sessions c ON c.id = s.cash_session_id
      WHERE s.sold_at < c.opened_at`;
    expect(early).toEqual([]);

    // 7. Números y claves de idempotencia sin duplicados.
    const [dupes] = await app.prisma.$queryRaw<{ numbers: number; keys: number; total: number }[]>`
      SELECT count(DISTINCT number)::int AS numbers, count(DISTINCT client_request_id)::int AS keys,
             count(*)::int AS total FROM sales`;
    expect(dupes).toEqual({ numbers: 8, keys: 8, total: 8 });
  });
});
