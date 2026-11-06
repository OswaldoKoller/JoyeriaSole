import { describe, expect, it } from 'vitest';
import {
  finalCountOf,
  findScopeOverlaps,
  needsRecount,
  normalizeScanCode,
  reconcileCount,
} from '../../src/modules/inventory-counts/count-logic.ts';

describe('reconcileCount (conciliación de ADR-014)', () => {
  it('sin movimientos posteriores, la diferencia es contado − sistema', () => {
    expect(reconcileCount({ countedQty: 8, currentQty: 10, movementsSince: 0 })).toEqual({
      expectedQty: 10,
      difference: -2,
      targetQty: 8,
    });
  });

  it('un ingreso confirmado durante el conteo no es una diferencia', () => {
    // Se contaron 10 piezas; mientras tanto entraron 5 (saldo vigente 15, posteriores +5).
    const result = reconcileCount({ countedQty: 10, currentQty: 15, movementsSince: 5 });
    expect(result.expectedQty).toBe(10);
    expect(result.difference).toBe(0);
    expect(result.targetQty).toBe(15);
  });

  it('la diferencia real se aplica sobre el saldo vigente, no sobre la foto inicial', () => {
    // Foto 10; entraron 5 después de contar; se contaron 8 (faltan 2).
    const result = reconcileCount({ countedQty: 8, currentQty: 15, movementsSince: 5 });
    expect(result.difference).toBe(-2);
    expect(result.targetQty).toBe(13); // 8 contadas + 5 que llegaron después
  });

  it('una salida posterior también se concilia', () => {
    const result = reconcileCount({ countedQty: 10, currentQty: 7, movementsSince: -3 });
    expect(result.difference).toBe(0);
    expect(result.targetQty).toBe(7);
  });

  it('detecta un saldo resultante negativo (lo rechaza el libro de stock)', () => {
    const result = reconcileCount({ countedQty: 0, currentQty: 2, movementsSince: -5 });
    expect(result.targetQty).toBe(-5); // 0 contadas + (−5 posteriores)
  });

  it('sobrante: contó más de lo esperado', () => {
    expect(reconcileCount({ countedQty: 12, currentQty: 10, movementsSince: 0 }).difference).toBe(
      2,
    );
  });
});

describe('needsRecount', () => {
  it('solo las variantes con diferencia requieren segundo recuento', () => {
    expect(needsRecount({ countedQty: 5, currentQty: 5, movementsSince: 0 })).toBe(false);
    expect(needsRecount({ countedQty: 4, currentQty: 5, movementsSince: 0 })).toBe(true);
    expect(needsRecount({ countedQty: 5, currentQty: 8, movementsSince: 3 })).toBe(false);
  });
});

describe('finalCountOf', () => {
  it('el recuento prevalece sobre el primer conteo', () => {
    expect(finalCountOf({ qty: 4, cursor: 10n }, { qty: 5, cursor: 20n })).toEqual({
      qty: 5,
      cursor: 20n,
    });
  });

  it('sin recuento rige el primer conteo; sin lecturas es 0', () => {
    expect(finalCountOf({ qty: 4, cursor: 10n }, { qty: null, cursor: null })).toEqual({
      qty: 4,
      cursor: 10n,
    });
    expect(finalCountOf({ qty: null, cursor: null }, { qty: null, cursor: null }).qty).toBe(0);
  });

  it('un recuento de 0 también prevalece', () => {
    expect(finalCountOf({ qty: 3, cursor: 1n }, { qty: 0, cursor: 2n }).qty).toBe(0);
  });
});

describe('findScopeOverlaps (conteos simultáneos, Q-13 B)', () => {
  const others = [
    { id: 'b', number: 2, variantIds: ['v3', 'v4'] },
    { id: 'a', number: 1, variantIds: ['v1', 'v2', 'v3'] },
    { id: 'c', number: 3, variantIds: ['v9'] },
  ];

  it('sin variantes en común no hay solapamiento', () => {
    expect(findScopeOverlaps(['v7', 'v8'], others)).toEqual([]);
  });

  it('informa cada conteo que comparte variantes, ordenados por número', () => {
    expect(findScopeOverlaps(['v3', 'v1'], others)).toEqual([
      { countId: 'a', number: 1, sharedVariants: 2 },
      { countId: 'b', number: 2, sharedVariants: 1 },
    ]);
  });

  it('sin otros conteos no hay conflicto', () => {
    expect(findScopeOverlaps(['v1'], [])).toEqual([]);
  });
});

describe('normalizeScanCode', () => {
  it('quita espacios y caracteres de control del lector', () => {
    expect(normalizeScanCode('  SKU-000123\r\n')).toBe('SKU-000123');
    expect(normalizeScanCode('\u0002775001\u0003')).toBe('775001');
  });

  it('conserva los caracteres válidos del código', () => {
    expect(normalizeScanCode('AB-12/3 x')).toBe('AB-12/3 x');
  });
});
