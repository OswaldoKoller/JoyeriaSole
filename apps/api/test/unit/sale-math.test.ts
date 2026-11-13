/** Aritmética y validación pura de la venta (plan 11 §4.5, §6.1). Sin base de datos. */
import {
  createSaleSchema,
  ERROR_CODES,
  evaluatePayments,
  formatCashSessionNumber,
  formatIncidentNumber,
  formatSaleNumber,
  saleTotalCents,
} from '@joyeria/shared';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/lib/errors.ts';
import { hashRequest } from '../../src/lib/idempotency.ts';
import {
  planPayments,
  planSale,
  type PaymentMethodRow,
  type VariantSnapshot,
} from '../../src/modules/sales/sale-math.ts';

const isCash = (code: string) => code === 'CASH';

function errorOf(fn: () => unknown): AppError {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('No lanzó');
}

describe('total y vuelto en centavos', () => {
  it('suma cantidad × precio sin coma flotante', () => {
    expect(
      saleTotalCents([
        { quantity: 3, unitPrice: '0.10' },
        { quantity: 1, unitPrice: '0.20' },
        { quantity: 2, unitPrice: '1499.99' },
      ]),
    ).toBe(300_048n);
  });

  it('el vuelto es recibido − aplicado y solo sale del efectivo', () => {
    const result = evaluatePayments(
      8_000n,
      [
        { methodCode: 'QR', amount: '50' },
        { methodCode: 'CASH', amount: '30', tendered: '50' },
      ],
      isCash,
    );
    expect(result).toEqual({
      ok: true,
      paidCents: 8_000n,
      changeCents: 2_000n,
      payments: [
        { methodCode: 'QR', amountCents: 5_000n, tenderedCents: null, changeCents: null },
        { methodCode: 'CASH', amountCents: 3_000n, tenderedCents: 5_000n, changeCents: 2_000n },
      ],
    });
  });

  it('rechaza Σ pagos ≠ total (falta o sobra), recibido < aplicado y recibido fuera del efectivo', () => {
    const run = (payments: Parameters<typeof evaluatePayments>[1]) =>
      evaluatePayments(10_000n, payments, isCash);
    expect(run([{ methodCode: 'CASH', amount: '90', tendered: '90' }])).toMatchObject({
      ok: false,
      reason: 'SUM_MISMATCH',
      paidCents: 9_000n,
    });
    expect(run([{ methodCode: 'QR', amount: '110' }])).toMatchObject({
      ok: false,
      reason: 'SUM_MISMATCH',
    });
    expect(run([{ methodCode: 'CASH', amount: '100', tendered: '99.99' }])).toMatchObject({
      ok: false,
      reason: 'TENDERED_TOO_LOW',
    });
    expect(run([{ methodCode: 'QR', amount: '100', tendered: '100' }])).toMatchObject({
      ok: false,
      reason: 'TENDERED_NOT_CASH',
    });
    expect(run([{ methodCode: 'CASH', amount: '100' }])).toMatchObject({
      ok: false,
      reason: 'TENDERED_MISSING',
    });
  });
});

describe('planSale: validación con datos vigentes', () => {
  const variant = (overrides: Partial<VariantSnapshot> = {}): VariantSnapshot => ({
    id: '00000000-0000-7000-8000-000000000001',
    sku: 'SKU-1',
    label: 'Plata',
    productName: 'Anillo',
    active: true,
    salePrice: '150.00',
    costPrice: '60.0000',
    available: 5,
    ...overrides,
  });
  const map = (...variants: VariantSnapshot[]) => new Map(variants.map((v) => [v.id, v]));
  const item = (quantity = 2, expectedUnitPrice = '150') => ({
    variantId: variant().id,
    quantity,
    expectedUnitPrice,
  });

  it('devuelve líneas con precio vigente y total; nunca expone el costo fuera de la línea interna', () => {
    const plan = planSale([item()], '300', map(variant()));
    expect(plan.total).toBe('300.00');
    expect(plan.lines[0]).toMatchObject({
      unitPrice: '150.00',
      lineTotal: '300.00',
      unitCost: '60.0000',
    });
  });

  it('variante inexistente, inactiva o sin precio → 422 VARIANT_NOT_SELLABLE', () => {
    for (const [variants, reason] of [
      [map(), 'NOT_FOUND'],
      [map(variant({ active: false })), 'INACTIVE'],
      [map(variant({ salePrice: '0.00' })), 'NO_PRICE'],
    ] as const) {
      const error = errorOf(() => planSale([item()], '300', variants));
      expect(error.code).toBe(ERROR_CODES.VARIANT_NOT_SELLABLE);
      expect(error.details).toEqual({ items: [expect.objectContaining({ reason })] });
    }
  });

  it('precio unitario o total esperado distintos → 409 PRICE_CHANGED (sin costos en el detalle)', () => {
    const byUnit = errorOf(() => planSale([item(2, '140')], '280', map(variant())));
    expect(byUnit.statusCode).toBe(409);
    expect(byUnit.code).toBe(ERROR_CODES.PRICE_CHANGED);
    expect(byUnit.details).toEqual({
      items: [{ variantId: variant().id, expectedUnitPrice: '140.00', currentUnitPrice: '150.00' }],
      expectedTotal: '280.00',
      currentTotal: '300.00',
    });
    expect(JSON.stringify(byUnit.details)).not.toMatch(/60|cost/i);
    const byTotal = errorOf(() => planSale([item()], '299.99', map(variant())));
    expect(byTotal.code).toBe(ERROR_CODES.PRICE_CHANGED);
  });

  it('stock insuficiente → 422 INSUFFICIENT_STOCK con disponible y pedido', () => {
    const error = errorOf(() => planSale([item(6)], '900', map(variant())));
    expect(error.code).toBe(ERROR_CODES.INSUFFICIENT_STOCK);
    expect(error.details).toEqual({
      items: [{ variantId: variant().id, sku: 'SKU-1', available: 5, requested: 6 }],
    });
  });
});

describe('planPayments', () => {
  const methods = new Map<string, PaymentMethodRow>([
    ['CASH', { id: 'c', code: 'CASH', name: 'Efectivo', isCash: true, isActive: true }],
    ['QR', { id: 'q', code: 'QR', name: 'QR', isCash: false, isActive: false }],
  ]);

  it('un medio inactivo o que no cuadra → 422 PAYMENT_MISMATCH con total y pagado', () => {
    const inactive = errorOf(() =>
      planPayments([{ methodCode: 'QR', amount: '10' }], 1_000n, methods),
    );
    expect(inactive.code).toBe(ERROR_CODES.PAYMENT_MISMATCH);
    const short = errorOf(() =>
      planPayments([{ methodCode: 'CASH', amount: '9', tendered: '9' }], 1_000n, methods),
    );
    expect(short.details).toEqual({ total: '10.00', paid: '9.00', reason: 'SUM_MISMATCH' });
  });
});

describe('cuerpo de la venta y hash de idempotencia', () => {
  const body = {
    items: [
      { variantId: '00000000-0000-7000-8000-000000000001', quantity: 1, expectedUnitPrice: '10' },
    ],
    payments: [{ methodCode: 'CASH', amount: '10', tendered: '20' }],
    expectedTotal: '10',
  };

  it('el esquema rechaza efectivo recibido en QR, referencia en efectivo, variantes repetidas y claves extra', () => {
    expect(createSaleSchema.safeParse(body).success).toBe(true);
    for (const invalid of [
      { ...body, payments: [{ methodCode: 'QR', amount: '10', tendered: '10' }] },
      { ...body, payments: [{ methodCode: 'CASH', amount: '10', tendered: '10', reference: 'x' }] },
      { ...body, payments: [{ methodCode: 'CASH', amount: '10' }] },
      { ...body, items: [body.items[0], body.items[0]] },
      { ...body, items: [{ ...body.items[0], quantity: 0 }] },
      { ...body, discount: '1' },
      { ...body, payments: [{ methodCode: 'CASH', amount: '-10', tendered: '10' }] },
    ]) {
      expect(createSaleSchema.safeParse(invalid).success, JSON.stringify(invalid)).toBe(false);
    }
  });

  it('el hash canónico no depende del orden de las claves', () => {
    const reordered = {
      expectedTotal: '10',
      payments: [{ tendered: '20', amount: '10', methodCode: 'CASH' }],
      items: [{ expectedUnitPrice: '10', quantity: 1, variantId: body.items[0]?.variantId }],
    };
    expect(hashRequest({ params: null, body: reordered })).toBe(
      hashRequest({ params: null, body }),
    );
    expect(hashRequest({ params: null, body: { ...body, expectedTotal: '11' } })).not.toBe(
      hashRequest({ params: null, body }),
    );
  });

  it('formatea los números de venta, sesión e incidencia', () => {
    expect(formatSaleNumber(123)).toBe('VTA-000123');
    expect(formatCashSessionNumber(7)).toBe('CAJ-000007');
    expect(formatIncidentNumber(1_234_567)).toBe('INC-1234567');
  });
});
