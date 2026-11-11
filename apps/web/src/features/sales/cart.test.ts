import { SALE_MAX_QUANTITY } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAIN, RING } from '../../test/sales-fixtures.ts';
import {
  POS_DRAFT_STORAGE_KEY,
  addPiece,
  applyAvailable,
  applyCurrentPrices,
  cartTotal,
  loadPosDraft,
  pieceFromLookup,
  removeLine,
  saleItemsInput,
  savePosDraft,
  setQuantity,
  type CartLine,
  type Piece,
} from './cart.ts';

const ring = pieceFromLookup(RING); // 120.50, stock 2
const chain = pieceFromLookup(CHAIN); // 80.00, stock 5

function cartWith(...pieces: Piece[]): CartLine[] {
  let cart: CartLine[] = [];
  for (const piece of pieces) {
    const result = addPiece(cart, piece);
    if (!result.ok) throw new Error(result.reason);
    cart = result.cart;
  }
  return cart;
}

describe('carrito', () => {
  it('agrega una línea por variante y suma 1 al volver a escanear', () => {
    const cart = cartWith(ring, chain, ring);
    expect(cart.map((line) => [line.sku, line.quantity])).toEqual([
      ['SKU-000001', 2],
      ['SKU-000002', 1],
    ]);
  });

  it('no agrega piezas inactivas, sin precio o sin stock', () => {
    expect(addPiece([], { ...ring, active: false })).toEqual({ ok: false, reason: 'INACTIVE' });
    expect(addPiece([], { ...ring, unitPrice: '0.00' })).toEqual({ ok: false, reason: 'NO_PRICE' });
    expect(addPiece([], { ...ring, available: 0 })).toEqual({ ok: false, reason: 'NO_STOCK' });
    // Stock 2: la tercera unidad ya no entra.
    expect(addPiece(cartWith(ring, ring), ring)).toEqual({ ok: false, reason: 'NO_STOCK' });
  });

  it('sin stock visible (null) solo aplica el límite técnico', () => {
    const unknown = { ...ring, available: null };
    const cart = setQuantity(cartWith(unknown), ring.variantId, SALE_MAX_QUANTITY);
    expect(addPiece(cart, unknown)).toEqual({ ok: false, reason: 'MAX_QUANTITY' });
  });

  it('la cantidad queda entre 1 y el stock disponible', () => {
    const cart = cartWith(chain);
    expect(setQuantity(cart, chain.variantId, 9)[0]?.quantity).toBe(5);
    expect(setQuantity(cart, chain.variantId, 0)[0]?.quantity).toBe(1);
    expect(setQuantity(cart, chain.variantId, Number.NaN)[0]?.quantity).toBe(1);
    expect(setQuantity(cart, chain.variantId, 3)[0]?.quantity).toBe(3);
  });

  it('quita líneas', () => {
    expect(removeLine(cartWith(ring, chain), ring.variantId).map((line) => line.sku)).toEqual([
      'SKU-000002',
    ]);
  });

  it('calcula el total en centavos enteros', () => {
    const cart = setQuantity(cartWith(ring, chain), chain.variantId, 3);
    expect(cartTotal(cart)).toBe(12050n + 3n * 8000n);
    const cents = cartWith({ ...chain, unitPrice: '0.10', available: null });
    expect(cartTotal(setQuantity(cents, chain.variantId, 3))).toBe(30n);
  });

  it('arma las líneas de la venta con el precio que vio el vendedor', () => {
    expect(saleItemsInput(cartWith(ring, ring))).toEqual([
      { variantId: ring.variantId, quantity: 2, expectedUnitPrice: '120.50' },
    ]);
  });

  it('aplica precios y stock informados por la API', () => {
    const cart = cartWith(ring, chain);
    expect(
      applyCurrentPrices(cart, [{ variantId: ring.variantId, currentUnitPrice: '130.00' }])[0]
        ?.unitPrice,
    ).toBe('130.00');
    expect(applyAvailable(cart, [{ variantId: chain.variantId, available: 0 }])[1]?.available).toBe(
      0,
    );
  });
});

describe('borrador en sessionStorage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('guarda y recupera carrito, pagos y el intento con su clave', () => {
    const draft = {
      lines: cartWith(ring),
      payments: { cash: '200', qr: '', transfer: '', qrReference: '', transferReference: '' },
      attempt: { key: 'k-1', body: '{}', uncertain: true },
    };
    savePosDraft(draft);
    expect(loadPosDraft()).toEqual(draft);
  });

  it('un borrador vacío no se guarda', () => {
    savePosDraft(loadPosDraft());
    expect(window.sessionStorage.getItem(POS_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('un dato corrupto o un almacenamiento bloqueado dan un borrador vacío', () => {
    window.sessionStorage.setItem(POS_DRAFT_STORAGE_KEY, '{no es json');
    expect(loadPosDraft().lines).toEqual([]);
    window.sessionStorage.setItem(POS_DRAFT_STORAGE_KEY, JSON.stringify({ lines: 'x' }));
    expect(loadPosDraft().attempt).toBeNull();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(loadPosDraft().lines).toEqual([]);
  });
});
