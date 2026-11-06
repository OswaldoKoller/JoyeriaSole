import { valueOfDelta } from '@joyeria/shared';
import { describe, expect, it } from 'vitest';
import { MAX_BALANCE, planBalanceChange } from '../../src/modules/inventory/stock-ledger.ts';

describe('planBalanceChange', () => {
  it('suma la diferencia con signo al saldo', () => {
    expect(planBalanceChange(5, 3)).toEqual({ ok: true, after: 8 });
    expect(planBalanceChange(5, -2)).toEqual({ ok: true, after: 3 });
  });

  it('permite llegar exactamente a cero (ajustar a cero)', () => {
    expect(planBalanceChange(7, -7)).toEqual({ ok: true, after: 0 });
  });

  it('rechaza dejar el saldo negativo', () => {
    expect(planBalanceChange(2, -3)).toEqual({ ok: false, reason: 'NEGATIVE' });
    expect(planBalanceChange(0, -1)).toEqual({ ok: false, reason: 'NEGATIVE' });
  });

  it('rechaza superar el máximo de la columna entera', () => {
    expect(planBalanceChange(MAX_BALANCE, 1)).toEqual({ ok: false, reason: 'OVERFLOW' });
    expect(planBalanceChange(MAX_BALANCE - 1, 1)).toEqual({ ok: true, after: MAX_BALANCE });
  });

  it('rechaza diferencias nulas o no enteras', () => {
    expect(planBalanceChange(5, 0)).toEqual({ ok: false, reason: 'INVALID_DELTA' });
    expect(planBalanceChange(5, 1.5)).toEqual({ ok: false, reason: 'INVALID_DELTA' });
  });
});

describe('valueOfDelta', () => {
  it('valora la diferencia con signo, en bolivianos con 2 decimales', () => {
    expect(valueOfDelta(3, '10.5000')).toBe('31.50');
    expect(valueOfDelta(-3, '10.5000')).toBe('-31.50');
  });

  it('redondea la mitad hacia arriba en magnitud, también en salidas', () => {
    // 3 × 0.0050 = 0.0150 → 0.02 ; la salida es simétrica.
    expect(valueOfDelta(3, '0.0050')).toBe('0.02');
    expect(valueOfDelta(-3, '0.0050')).toBe('-0.02');
  });

  it('costo cero da valor cero', () => {
    expect(valueOfDelta(-4, '0.0000')).toBe('0.00');
  });
});
