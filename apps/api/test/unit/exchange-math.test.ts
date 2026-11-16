/**
 * Lógica pura del cambio de pieza (ADR-026): qué se puede cambiar de una venta y las reglas del
 * responsable (2026-11-14): nunca por una pieza más económica; la diferencia se cobra. Sin base de
 * datos.
 */
import {
  ERROR_CODES,
  createSaleExchangeSchema,
  formatExchangeNumber,
  type ExchangeHolding,
} from '@joyeria/shared';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/lib/errors.ts';
import {
  computeHoldings,
  findHolding,
  planExchange,
  type ExchangeRow,
  type SaleItemRow,
} from '../../src/modules/sale-exchanges/exchange-math.ts';
import type { VariantSnapshot } from '../../src/modules/sales/sale-math.ts';

const ITEM: SaleItemRow = {
  id: 'item-1',
  variantId: 'var-old',
  sku: 'SKU-OLD',
  productName: 'Anillo',
  variantLabel: 'Talla 10',
  quantity: 3,
  unitPrice: '150.00',
};

function exchange(overrides: Partial<ExchangeRow>): ExchangeRow {
  return {
    id: 'ex-1',
    number: 1,
    sourceItemId: 'item-1',
    sourceExchangeId: null,
    quantity: 1,
    deliveredVariantId: 'var-new',
    deliveredSku: 'SKU-NEW',
    deliveredProductName: 'Anillo',
    deliveredVariantLabel: 'Talla 12',
    deliveredUnitPrice: '200.00',
    ...overrides,
  };
}

function variant(overrides: Partial<VariantSnapshot> = {}): VariantSnapshot {
  return {
    id: 'var-new',
    sku: 'SKU-NEW',
    label: 'Talla 12',
    productName: 'Anillo',
    active: true,
    salePrice: '150.00',
    costPrice: '60.0000',
    available: 5,
    ...overrides,
  };
}

function holding(overrides: Partial<ExchangeHolding> = {}): ExchangeHolding {
  return {
    origin: 'SALE',
    sourceItemId: 'item-1',
    sourceExchangeId: null,
    exchangeNumber: null,
    variantId: 'var-old',
    sku: 'SKU-OLD',
    productName: 'Anillo',
    variantLabel: 'Talla 10',
    remaining: 3,
    creditUnitPrice: '150.00',
    ...overrides,
  };
}

function errorOf(fn: () => unknown): AppError {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('No lanzó');
}

describe('computeHoldings: lo que el cliente conserva de la venta', () => {
  it('sin cambios, cada línea vendida está completa al precio que se pagó', () => {
    expect(computeHoldings([ITEM], [])).toEqual([
      expect.objectContaining({
        origin: 'SALE',
        sourceItemId: 'item-1',
        remaining: 3,
        creditUnitPrice: '150.00',
      }),
    ]);
  });

  it('un cambio descuenta de la línea y agrega la pieza entregada al precio que se cobró por ella', () => {
    const holdings = computeHoldings([ITEM], [exchange({ quantity: 2 })]);
    expect(holdings).toEqual([
      expect.objectContaining({ origin: 'SALE', remaining: 1 }),
      expect.objectContaining({
        origin: 'EXCHANGE',
        sourceExchangeId: 'ex-1',
        exchangeNumber: 1,
        variantId: 'var-new',
        remaining: 2,
        creditUnitPrice: '200.00',
      }),
    ]);
  });

  it('lo agotado desaparece y el cambio de un cambio descuenta del cambio de origen', () => {
    const first = exchange({ quantity: 3 });
    const second = exchange({
      id: 'ex-2',
      number: 2,
      sourceItemId: null,
      sourceExchangeId: 'ex-1',
      quantity: 1,
      deliveredVariantId: 'var-3',
      deliveredUnitPrice: '260.00',
    });
    const holdings = computeHoldings([ITEM], [second, first]);
    // La línea se agotó (3 de 3); del primer cambio queda 2 y del segundo 1.
    expect(holdings.map((h) => [h.origin, h.exchangeNumber, h.remaining])).toEqual([
      ['EXCHANGE', 1, 2],
      ['EXCHANGE', 2, 1],
    ]);
  });

  it('findHolding encuentra por línea de venta o por cambio', () => {
    const holdings = computeHoldings([ITEM], [exchange({ quantity: 1 })]);
    expect(findHolding(holdings, { sourceItemId: 'item-1' })?.origin).toBe('SALE');
    expect(findHolding(holdings, { sourceExchangeId: 'ex-1' })?.origin).toBe('EXCHANGE');
    expect(findHolding(holdings, { sourceItemId: 'otro' })).toBeUndefined();
  });
});

describe('planExchange: reglas del cambio', () => {
  const input = { quantity: 1, expectedDeliveredUnitPrice: '150.00' };

  it('mismo precio: sin diferencia', () => {
    expect(planExchange(input, holding(), variant())).toMatchObject({
      creditUnitPrice: '150.00',
      deliveredUnitPrice: '150.00',
      differenceCents: 0n,
      difference: '0.00',
    });
  });

  it('pieza más cara: la diferencia es cantidad × (nueva − pagada), exacta en centavos', () => {
    const plan = planExchange(
      { quantity: 3, expectedDeliveredUnitPrice: '150.35' },
      holding(),
      variant({ salePrice: '150.35' }),
    );
    expect(plan.differenceCents).toBe(105n); // 3 × 0,35
    expect(plan.difference).toBe('1.05');
  });

  it('NUNCA por una pieza más económica, ni por un centavo', () => {
    const error = errorOf(() =>
      planExchange(
        { quantity: 1, expectedDeliveredUnitPrice: '149.99' },
        holding(),
        variant({ salePrice: '149.99' }),
      ),
    );
    expect(error.code).toBe(ERROR_CODES.EXCHANGE_CHEAPER_NOT_ALLOWED);
    expect(error.statusCode).toBe(422);
    expect(error.details).toEqual({ creditUnitPrice: '150.00', deliveredUnitPrice: '149.99' });
  });

  it('la pieza nueva debe ser otra variante', () => {
    const error = errorOf(() => planExchange(input, holding(), variant({ id: 'var-old' })));
    expect(error.code).toBe(ERROR_CODES.EXCHANGE_SAME_PIECE);
  });

  it('no se cambian más unidades de las que quedan', () => {
    const error = errorOf(() =>
      planExchange({ ...input, quantity: 2 }, holding({ remaining: 1 }), variant()),
    );
    expect(error.code).toBe(ERROR_CODES.EXCHANGE_QUANTITY_EXCEEDED);
    expect(error.details).toEqual({ remaining: 1, requested: 2 });
  });

  it('el precio esperado debe ser el vigente (409) y se avisa antes que la regla del precio', () => {
    const error = errorOf(() =>
      planExchange({ quantity: 1, expectedDeliveredUnitPrice: '140.00' }, holding(), variant()),
    );
    expect(error.code).toBe(ERROR_CODES.PRICE_CHANGED);
    expect(error.statusCode).toBe(409);
  });

  it('la pieza nueva debe existir, estar activa y tener precio', () => {
    for (const piece of [undefined, variant({ active: false }), variant({ salePrice: '0.00' })]) {
      const error = errorOf(() => planExchange(input, holding(), piece));
      expect(error.code).toBe(ERROR_CODES.VARIANT_NOT_SELLABLE);
    }
  });

  it('exige stock de la pieza nueva y nunca lo informa con costos', () => {
    const error = errorOf(() =>
      planExchange({ ...input, quantity: 2 }, holding(), variant({ available: 1 })),
    );
    expect(error.code).toBe(ERROR_CODES.INSUFFICIENT_STOCK);
    expect(JSON.stringify(error.details)).not.toMatch(/cost/i);
  });
});

describe('formato y validación del cuerpo', () => {
  it('numera los cambios como CMB-000012', () => {
    expect(formatExchangeNumber(12)).toBe('CMB-000012');
  });

  const uuid = '01900000-0000-7000-8000-000000000001';
  const base = {
    saleId: uuid,
    sourceItemId: uuid,
    deliveredVariantId: uuid,
    quantity: 1,
    expectedDeliveredUnitPrice: '150',
    payments: [],
  };

  it('exige exactamente un origen y valida el efectivo recibido', () => {
    expect(createSaleExchangeSchema.safeParse(base).success).toBe(true);
    expect(createSaleExchangeSchema.safeParse({ ...base, sourceItemId: undefined }).success).toBe(
      false,
    );
    expect(createSaleExchangeSchema.safeParse({ ...base, sourceExchangeId: uuid }).success).toBe(
      false,
    );
    expect(
      createSaleExchangeSchema.safeParse({
        ...base,
        payments: [{ methodCode: 'CASH', amount: '10' }],
      }).success,
    ).toBe(false);
    expect(createSaleExchangeSchema.safeParse({ ...base, quantity: 1.5 }).success).toBe(false);
  });
});
