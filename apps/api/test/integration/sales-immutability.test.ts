/**
 * Garantías de la BASE para ventas y caja (plan 11 §3, §6.2): se prueban con SQL directo, sin pasar
 * por la API. Una venta confirmada es inmutable (DEC-V07): ningún UPDATE ni DELETE, ninguna línea o
 * pago añadido después; la caja cerrada no cambia; una sola sesión abierta.
 */
import { randomUUID } from 'node:crypto';
import { REFERENCE_TYPES } from '@joyeria/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { applyStockChanges } from '../../src/modules/inventory/stock-ledger.ts';
import { buildTestApp } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';
import {
  createSellableVariant,
  insertSaleDirect,
  openCashSessionDirect,
  seedPaymentMethods,
} from '../helpers/sales.ts';

describe('garantías de la base de datos de ventas y caja', () => {
  let app: App;
  let userId: string;
  let cashMethodId: string;
  let qrMethodId: string;

  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(() => app.close());

  beforeEach(async () => {
    await resetDatabase(app.prisma);
    userId = (await createTestUser(app.prisma)).user.id;
    const methods = await seedPaymentMethods(app.prisma);
    cashMethodId = methods.get('CASH')?.id ?? '';
    qrMethodId = methods.get('QR')?.id ?? '';
  });

  async function confirmedSale() {
    const session = await openCashSessionDirect(app.prisma, userId, '100');
    const variant = await createSellableVariant(app.prisma, { stock: 5, userId });
    const saleId = await insertSaleDirect(app.prisma, {
      sessionId: session.id,
      userId,
      variantId: variant.id,
      quantity: 2,
      unitPrice: '150.00',
      unitCost: '60.0000',
      cashMethodId,
    });
    return { session, variant, saleId };
  }

  /** Cierra la sesión por SQL con cifras coherentes (como lo haría el servicio). */
  async function closeDirect(sessionId: string, cashSalesTotal: string, opening = '100') {
    const expected = (Number(opening) + Number(cashSalesTotal)).toFixed(2);
    await app.prisma.$executeRaw`
      UPDATE cash_sessions SET status = 'CLOSED', closed_by_id = ${userId}::uuid,
        closed_at = clock_timestamp(), cash_sales_total = ${cashSalesTotal}::numeric,
        cash_movements_net = 0, expected_cash = ${expected}::numeric,
        counted_cash = ${expected}::numeric, difference = 0,
        close_request_id = ${randomUUID()}::uuid, close_request_hash = ${'b'.repeat(64)}
      WHERE id = ${sessionId}::uuid`;
  }

  describe('ventas, líneas, pagos e impresiones son inmutables', () => {
    it('UPDATE y DELETE directos sobre sales, sale_items y sale_payments fallan', async () => {
      const { saleId } = await confirmedSale();
      await expect(
        app.prisma.$executeRaw`UPDATE sales SET total = 1 WHERE id = ${saleId}::uuid`,
      ).rejects.toThrow(/solo inserción/);
      await expect(
        app.prisma.$executeRaw`DELETE FROM sales WHERE id = ${saleId}::uuid`,
      ).rejects.toThrow(/solo inserción/);
      await expect(
        app.prisma.$executeRaw`UPDATE sale_items SET quantity = 1 WHERE sale_id = ${saleId}::uuid`,
      ).rejects.toThrow(/solo inserción/);
      await expect(
        app.prisma.$executeRaw`DELETE FROM sale_items WHERE sale_id = ${saleId}::uuid`,
      ).rejects.toThrow(/solo inserción/);
      await expect(
        app.prisma.$executeRaw`UPDATE sale_payments SET amount = 1 WHERE sale_id = ${saleId}::uuid`,
      ).rejects.toThrow(/solo inserción/);
      await expect(
        app.prisma.$executeRaw`DELETE FROM sale_payments WHERE sale_id = ${saleId}::uuid`,
      ).rejects.toThrow(/solo inserción/);
      const sale = await app.prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
      expect(sale.total.toFixed(2)).toBe('300.00');
    });

    it('UPDATE y DELETE sobre sale_receipt_prints fallan (append-only)', async () => {
      const { saleId } = await confirmedSale();
      await app.prisma.saleReceiptPrint.create({
        data: { saleId, copyNumber: 1, format: 'A4', printedById: userId },
      });
      await expect(
        app.prisma
          .$executeRaw`UPDATE sale_receipt_prints SET format = '58mm' WHERE sale_id = ${saleId}::uuid`,
      ).rejects.toThrow(/solo inserción/);
      await expect(
        app.prisma.$executeRaw`DELETE FROM sale_receipt_prints WHERE sale_id = ${saleId}::uuid`,
      ).rejects.toThrow(/solo inserción/);
    });

    it('agregar un pago extra a una venta confirmada falla al confirmar (las sumas no cuadran)', async () => {
      const { saleId } = await confirmedSale();
      await expect(
        app.prisma.salePayment.create({
          data: {
            saleId,
            methodId: qrMethodId,
            methodIsCash: false,
            methodName: 'QR',
            amount: '10.00',
          },
        }),
      ).rejects.toThrow(/pagos de la venta/);
      expect(await app.prisma.salePayment.count({ where: { saleId } })).toBe(1);
    });

    it('agregar una línea extra a una venta confirmada falla al confirmar', async () => {
      const { saleId } = await confirmedSale();
      const other = await createSellableVariant(app.prisma, { stock: 3, userId });
      await expect(
        app.prisma.$transaction(async (tx) => {
          const [applied] = await applyStockChanges(tx, [
            {
              variantId: other.id,
              type: 'SALE',
              quantity: -1,
              unitCost: '60.0000',
              referenceType: REFERENCE_TYPES.SALE,
              referenceId: saleId,
              userId,
            },
          ]);
          await tx.saleItem.create({
            data: {
              saleId,
              variantId: other.id,
              quantity: 1,
              unitPrice: '150.00',
              lineTotal: '150.00',
              unitCostSnapshot: '60.0000',
              sku: 'X',
              productName: 'X',
              movementId: applied?.movementId ?? 0n,
            },
          });
        }),
      ).rejects.toThrow(/líneas de la venta/);
      expect(await app.prisma.saleItem.count({ where: { saleId } })).toBe(1);
    });

    it('una venta sin líneas o sin pagos no se puede confirmar', async () => {
      const session = await openCashSessionDirect(app.prisma, userId);
      await expect(
        app.prisma.sale.create({
          data: {
            cashSessionId: session.id,
            sellerId: userId,
            sellerName: 'X',
            total: '10',
            clientRequestId: randomUUID(),
            requestHash: 'c'.repeat(64),
          },
        }),
      ).rejects.toThrow(/no tiene líneas/);
      expect(await app.prisma.sale.count()).toBe(0);
    });

    it('una línea cuyo movimiento no es el SALE de la venta es rechazada', async () => {
      const session = await openCashSessionDirect(app.prisma, userId);
      const variant = await createSellableVariant(app.prisma, { stock: 3, userId });
      const movement = await app.prisma.inventoryMovement.findFirstOrThrow({
        where: { variantId: variant.id },
      });
      await expect(
        app.prisma.$transaction(async (tx) => {
          const sale = await tx.sale.create({
            data: {
              cashSessionId: session.id,
              sellerId: userId,
              sellerName: 'X',
              total: '150',
              clientRequestId: randomUUID(),
              requestHash: 'c'.repeat(64),
            },
          });
          await tx.saleItem.create({
            data: {
              saleId: sale.id,
              variantId: variant.id,
              quantity: 1,
              unitPrice: '150',
              lineTotal: '150',
              unitCostSnapshot: '60',
              sku: 'X',
              productName: 'X',
              // El movimiento de stock inicial, no un SALE de esta venta.
              movementId: movement.id,
            },
          });
          await tx.salePayment.create({
            data: {
              saleId: sale.id,
              methodId: qrMethodId,
              methodIsCash: false,
              methodName: 'QR',
              amount: '150',
            },
          });
        }),
      ).rejects.toThrow(/no coincide con su movimiento SALE/);
      expect(await app.prisma.sale.count()).toBe(0);
    });

    it('un pago no puede declararse en efectivo si el medio no lo es (FK compuesta)', async () => {
      const { saleId } = await confirmedSale();
      await expect(
        app.prisma.$executeRaw`
          INSERT INTO sale_payments (id, sale_id, method_id, method_is_cash, method_name, amount, tendered_amount, change_given)
          VALUES (uuidv7(), ${saleId}::uuid, ${qrMethodId}::uuid, true, 'QR', 1, 1, 0)`,
      ).rejects.toThrow();
    });

    it('el movimiento SALE siempre resta stock (CHECK de signo)', async () => {
      const variant = await createSellableVariant(app.prisma, { stock: 1, userId });
      await expect(
        app.prisma.$transaction((tx) =>
          applyStockChanges(tx, [{ variantId: variant.id, type: 'SALE', quantity: 1, userId }]),
        ),
      ).rejects.toThrow(/inventory_movements_sale_sign_check/);
    });
  });

  describe('sesiones de caja', () => {
    it('no se registra una venta en una sesión cerrada', async () => {
      const session = await openCashSessionDirect(app.prisma, userId);
      await closeDirect(session.id, '0');
      const variant = await createSellableVariant(app.prisma, { stock: 2, userId });
      await expect(
        insertSaleDirect(app.prisma, {
          sessionId: session.id,
          userId,
          variantId: variant.id,
          quantity: 1,
          unitPrice: '150.00',
          unitCost: '60.0000',
          cashMethodId,
        }),
      ).rejects.toThrow(/no hay una sesión de caja abierta/);
      expect(await app.prisma.sale.count()).toBe(0);
    });

    it('una segunda sesión abierta por SQL falla (índice único parcial)', async () => {
      await openCashSessionDirect(app.prisma, userId);
      await expect(openCashSessionDirect(app.prisma, userId)).rejects.toThrow();
      expect(await app.prisma.cashSession.count({ where: { status: 'OPEN' } })).toBe(1);
    });

    it('una sesión no se registra ya cerrada', async () => {
      await expect(
        app.prisma.$executeRaw`
          INSERT INTO cash_sessions (id, status, opened_by_id, opening_amount, open_request_id)
          VALUES (uuidv7(), 'CLOSED', ${userId}::uuid, 0, ${randomUUID()}::uuid)`,
      ).rejects.toThrow(/se registra abierta/);
    });

    it('una sesión cerrada no cambia ni se reabre, y ninguna sesión se borra', async () => {
      const session = await openCashSessionDirect(app.prisma, userId);
      await expect(
        app.prisma.$executeRaw`DELETE FROM cash_sessions WHERE id = ${session.id}::uuid`,
      ).rejects.toThrow(/no se borran/);
      await expect(
        app.prisma
          .$executeRaw`UPDATE cash_sessions SET opening_amount = 5 WHERE id = ${session.id}::uuid`,
      ).rejects.toThrow(/solo puede cambiar para cerrarse/);
      await closeDirect(session.id, '0');
      await expect(
        app.prisma
          .$executeRaw`UPDATE cash_sessions SET status = 'OPEN' WHERE id = ${session.id}::uuid`,
      ).rejects.toThrow(/está cerrada/);
      await expect(
        app.prisma
          .$executeRaw`UPDATE cash_sessions SET notes = 'cambio' WHERE id = ${session.id}::uuid`,
      ).rejects.toThrow(/está cerrada/);
    });

    it('el cierre exige los cobros en efectivo reales y un esperado coherente', async () => {
      const { session } = await confirmedSale(); // 2 × 150 en efectivo
      await expect(closeDirect(session.id, '0')).rejects.toThrow(/no coinciden con las ventas/);
      await expect(
        app.prisma.$executeRaw`
          UPDATE cash_sessions SET status = 'CLOSED', closed_by_id = ${userId}::uuid,
            closed_at = clock_timestamp(), cash_sales_total = 300, cash_movements_net = 0,
            expected_cash = 999, counted_cash = 999, difference = 0,
            close_request_id = ${randomUUID()}::uuid, close_request_hash = ${'b'.repeat(64)}
          WHERE id = ${session.id}::uuid`,
      ).rejects.toThrow(/cash_sessions_expected_cash_check/);
      await closeDirect(session.id, '300');
      const closed = await app.prisma.cashSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(closed.expectedCash?.toFixed(2)).toBe('400.00');
    });

    it('una diferencia de arqueo sin observación es rechazada por la base', async () => {
      const session = await openCashSessionDirect(app.prisma, userId, '100');
      await expect(
        app.prisma.$executeRaw`
          UPDATE cash_sessions SET status = 'CLOSED', closed_by_id = ${userId}::uuid,
            closed_at = clock_timestamp(), cash_sales_total = 0, cash_movements_net = 0,
            expected_cash = 100, counted_cash = 90, difference = -10,
            close_request_id = ${randomUUID()}::uuid, close_request_hash = ${'b'.repeat(64)}
          WHERE id = ${session.id}::uuid`,
      ).rejects.toThrow(/cash_sessions_difference_note_check/);
    });
  });

  describe('correcciones de caja', () => {
    async function correction(
      sessionId: string,
      values: {
        sequence: number;
        kind: 'COUNTED_CASH' | 'OPENING_AMOUNT' | 'NOTE';
        previous: string | null;
        next: string | null;
        expected: string;
        counted: string;
      },
    ) {
      const difference = (Number(values.counted) - Number(values.expected)).toFixed(2);
      return app.prisma.cashSessionCorrection.create({
        data: {
          cashSessionId: sessionId,
          sequence: values.sequence,
          kind: values.kind,
          previousValue: values.previous,
          newValue: values.next,
          expectedCashAfter: values.expected,
          countedCashAfter: values.counted,
          differenceAfter: difference,
          reason: 'Error de digitación en el arqueo',
          correctedById: userId,
          clientRequestId: randomUUID(),
          requestHash: 'd'.repeat(64),
        },
      });
    }

    it('solo sobre sesiones cerradas, con el valor vigente, cifras recalculadas y sin saltos', async () => {
      const session = await openCashSessionDirect(app.prisma, userId, '100');
      const base = { kind: 'COUNTED_CASH' as const, expected: '100', counted: '120' };
      await expect(
        correction(session.id, { ...base, sequence: 1, previous: '100', next: '120' }),
      ).rejects.toThrow(/solo se corrigen sesiones cerradas/);

      await closeDirect(session.id, '0'); // esperado 100, contado 100
      await expect(
        correction(session.id, { ...base, sequence: 1, previous: '90', next: '120' }),
      ).rejects.toThrow(/contado vigente es 100/);
      await expect(
        correction(session.id, { ...base, sequence: 2, previous: '100', next: '120' }),
      ).rejects.toThrow(/secuencia debe ser 1/);
      await expect(
        correction(session.id, {
          ...base,
          sequence: 1,
          previous: '100',
          next: '120',
          expected: '50',
        }),
      ).rejects.toThrow(/cifras incoherentes/);

      const first = await correction(session.id, {
        ...base,
        sequence: 1,
        previous: '100',
        next: '120',
      });
      expect(first.differenceAfter.toFixed(2)).toBe('20.00');
      // El fondo pasa de 100 a 120: el esperado vigente usa los cobros congelados (0).
      await correction(session.id, {
        sequence: 2,
        kind: 'OPENING_AMOUNT',
        previous: '100',
        next: '120',
        expected: '120',
        counted: '120',
      });
      await correction(session.id, {
        sequence: 3,
        kind: 'NOTE',
        previous: null,
        next: null,
        expected: '120',
        counted: '120',
      });

      await expect(
        app.prisma
          .$executeRaw`UPDATE cash_session_corrections SET reason = 'otro motivo cualquiera' WHERE cash_session_id = ${session.id}::uuid`,
      ).rejects.toThrow(/solo inserción/);
      await expect(
        app.prisma
          .$executeRaw`DELETE FROM cash_session_corrections WHERE cash_session_id = ${session.id}::uuid`,
      ).rejects.toThrow(/solo inserción/);
      // La sesión original no cambió.
      const stored = await app.prisma.cashSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(stored.countedCash?.toFixed(2)).toBe('100.00');
      expect(stored.openingAmount.toFixed(2)).toBe('100.00');
    });
  });

  describe('incidencias y datos del negocio', () => {
    it('una incidencia no se borra, solo se cierra una vez y al cerrar no cambia lo reportado', async () => {
      const incident = await app.prisma.saleIncident.create({
        data: {
          kind: 'OTHER',
          description: 'Se cobró con el medio equivocado',
          reportedById: userId,
          clientRequestId: randomUUID(),
        },
      });
      await expect(
        app.prisma.$executeRaw`DELETE FROM sale_incidents WHERE id = ${incident.id}::uuid`,
      ).rejects.toThrow(/no se borran/);
      await expect(
        app.prisma.$executeRaw`
          UPDATE sale_incidents SET status = 'CLOSED', resolution = 'Resuelto fuera del sistema',
            resolved_by_id = ${userId}::uuid, resolved_at = now(), description = 'Otra descripción larga'
          WHERE id = ${incident.id}::uuid`,
      ).rejects.toThrow(/solo cambian el estado/);
      await app.prisma.$executeRaw`
        UPDATE sale_incidents SET status = 'CLOSED', resolution = 'Resuelto fuera del sistema',
          resolved_by_id = ${userId}::uuid, resolved_at = now()
        WHERE id = ${incident.id}::uuid`;
      await expect(
        app.prisma
          .$executeRaw`UPDATE sale_incidents SET resolution = 'Otra resolución distinta' WHERE id = ${incident.id}::uuid`,
      ).rejects.toThrow(/solo se puede cerrar una incidencia abierta/);
    });

    it('los datos del negocio son un registro único', async () => {
      await app.prisma.businessSettings.create({ data: { id: 1, tradeName: 'Joyería Sole' } });
      await expect(
        app.prisma.businessSettings.create({ data: { id: 2, tradeName: 'Otra' } }),
      ).rejects.toThrow(/business_settings_singleton_check/);
    });
  });

  describe('endurecimiento tras la revisión de seguridad', () => {
    it('B-3: un pago QR no admite efectivo recibido aunque el vuelto sea nulo', async () => {
      const { saleId } = await confirmedSale();
      await expect(
        app.prisma.$executeRaw`
          INSERT INTO sale_payments (id, sale_id, method_id, method_is_cash, method_name, amount, tendered_amount, change_given)
          VALUES (uuidv7(), ${saleId}::uuid, ${qrMethodId}::uuid, false, 'QR', 1, 1, NULL)`,
      ).rejects.toThrow(/sale_payments_cash_fields_check/);
      await expect(
        app.prisma.$executeRaw`
          INSERT INTO sale_payments (id, sale_id, method_id, method_is_cash, method_name, amount, tendered_amount, change_given)
          VALUES (uuidv7(), ${saleId}::uuid, ${qrMethodId}::uuid, false, 'QR', 1, NULL, 0)`,
      ).rejects.toThrow(/sale_payments_cash_fields_check/);
    });

    it('B-7: una incidencia no se puede insertar ya cerrada ni con datos de cierre', async () => {
      for (const values of [
        { status: 'CLOSED', resolution: 'Resuelta fuera del sistema', by: userId },
        { status: 'OPEN', resolution: 'Resuelta fuera del sistema', by: null },
      ]) {
        await expect(
          app.prisma.$executeRaw`
            INSERT INTO sale_incidents (id, kind, description, status, reported_by_id, resolution,
              resolved_by_id, resolved_at, client_request_id)
            VALUES (uuidv7(), 'OTHER', 'Incidencia insertada por SQL', ${values.status}::sale_incident_status,
              ${userId}::uuid, ${values.resolution}, ${values.by}::uuid,
              ${values.by ? new Date() : null}::timestamptz, ${randomUUID()}::uuid)`,
        ).rejects.toThrow(/se registra abierta/);
      }
      expect(await app.prisma.saleIncident.count()).toBe(0);
    });

    it('B-6: existe el índice por fecha de reporte de las incidencias', async () => {
      const [row] = await app.prisma.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM pg_indexes
        WHERE tablename = 'sale_incidents' AND indexname = 'sale_incidents_reported_at_idx'`;
      expect(row?.count).toBe(1);
    });
  });
});
