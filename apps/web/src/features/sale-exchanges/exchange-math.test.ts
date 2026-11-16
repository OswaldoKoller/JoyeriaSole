import type { ExchangeHolding } from '@joyeria/shared';
import { describe, expect, it } from 'vitest';
import type { Piece } from '../sales/cart.ts';
import { exchangeIssueMessage, holdingKey, previewExchange } from './exchange-math.ts';

const HOLDING: ExchangeHolding = {
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
};

function piece(overrides: Partial<Piece> = {}): Piece {
  return {
    variantId: 'var-new',
    sku: 'SKU-NEW',
    productName: 'Anillo',
    variantLabel: 'Talla 12',
    unitPrice: '150.00',
    active: true,
    available: 5,
    ...overrides,
  };
}

describe('previewExchange', () => {
  it('mismo precio: se puede y no hay nada que cobrar', () => {
    expect(previewExchange(HOLDING, 1, piece())).toEqual({ issue: null, differenceCents: 0n });
  });

  it('pieza más cara: cantidad × (nueva − pagada), en centavos exactos', () => {
    expect(previewExchange(HOLDING, 3, piece({ unitPrice: '150.35' }))).toEqual({
      issue: null,
      differenceCents: 105n,
    });
  });

  it('nunca por una pieza más barata, ni por un centavo', () => {
    expect(previewExchange(HOLDING, 1, piece({ unitPrice: '149.99' })).issue).toBe('CHEAPER');
  });

  it('la misma pieza, una inactiva, sin precio o sin stock no se pueden entregar', () => {
    expect(previewExchange(HOLDING, 1, piece({ variantId: 'var-old' })).issue).toBe('SAME_PIECE');
    expect(previewExchange(HOLDING, 1, piece({ active: false })).issue).toBe('INACTIVE');
    expect(previewExchange(HOLDING, 1, piece({ unitPrice: '0.00' })).issue).toBe('NO_PRICE');
    expect(previewExchange(HOLDING, 2, piece({ available: 1 })).issue).toBe('NO_STOCK');
  });

  it('si no se conoce el stock, la API decide', () => {
    expect(previewExchange(HOLDING, 2, piece({ available: null })).issue).toBeNull();
  });
});

describe('textos', () => {
  const prices = { credit: 'Bs 150,00', piece: 'Bs 120,00' };
  it('explican cada problema en lenguaje sencillo', () => {
    expect(exchangeIssueMessage('CHEAPER', prices, piece())).toMatch(
      /cuesta menos.*igual o mayor precio/,
    );
    expect(exchangeIssueMessage('NO_STOCK', prices, piece({ available: 0 }))).toBe(
      'Esta pieza no tiene stock.',
    );
    expect(exchangeIssueMessage('NO_STOCK', prices, piece({ available: 2 }))).toMatch(/quedan 2/);
    expect(exchangeIssueMessage('SAME_PIECE', prices, piece())).toMatch(/misma pieza/);
  });

  it('la clave de una pieza es su línea de venta o el cambio que la entregó', () => {
    expect(holdingKey(HOLDING)).toBe('item-1');
    expect(holdingKey({ sourceItemId: null, sourceExchangeId: 'ex-1' })).toBe('ex-1');
  });
});
