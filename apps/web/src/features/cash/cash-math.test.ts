import { describe, expect, it } from 'vitest';
import { moneyTextToCents, normalizeMoneyText } from '../../lib/money-input.ts';
import {
  correctionPreview,
  differenceLabel,
  differenceLabelOf,
  noteIsValid,
  noteRequired,
  previewDifference,
} from './cash-math.ts';

describe('importes escritos', () => {
  it('acepta coma o punto y nunca trata el vacío como cero', () => {
    expect(normalizeMoneyText(' 150,50 ')).toBe('150.50');
    expect(moneyTextToCents('150,5')).toBe(15050n);
    expect(moneyTextToCents('0')).toBe(0n);
    expect(moneyTextToCents('')).toBeNull();
    expect(moneyTextToCents('   ')).toBeNull();
    expect(moneyTextToCents('-5')).toBeNull();
    expect(moneyTextToCents('1.234')).toBeNull();
    expect(moneyTextToCents('abc')).toBeNull();
  });

  it('suma en centavos sin errores de coma flotante (0,10 + 0,20)', () => {
    const sum = (moneyTextToCents('0,10') ?? 0n) + (moneyTextToCents('0,20') ?? 0n);
    expect(sum).toBe(30n);
  });
});

describe('arqueo', () => {
  it('diferencia = contado − esperado, con signo', () => {
    expect(previewDifference('250.00', '245')).toBe(-500n);
    expect(previewDifference('250.00', '260,50')).toBe(1050n);
    expect(previewDifference('250.00', '250')).toBe(0n);
    expect(previewDifference('250.00', '')).toBeNull();
  });

  it('anuncia sobrante o faltante con texto, no solo con color', () => {
    expect(differenceLabel(0n)).toBe('Sin diferencia');
    expect(differenceLabel(1050n)).toMatch(/^Sobrante de .*10,50/);
    expect(differenceLabel(-500n)).toMatch(/^Faltante de .*5,00/);
    expect(differenceLabelOf('-0.50')).toMatch(/^Faltante de .*0,50/);
  });

  it('toda diferencia distinta de cero exige observación de al menos 3 caracteres (R-14)', () => {
    expect(noteRequired(0n)).toBe(false);
    expect(noteRequired(null)).toBe(false);
    expect(noteRequired(1n)).toBe(true);
    expect(noteRequired(-1n)).toBe(true);
    expect(noteIsValid('  ab ')).toBe(false);
    expect(noteIsValid('abc')).toBe(true);
  });
});

describe('vista previa de una corrección', () => {
  const current = { openingAmount: '100.00', expectedCash: '250.00', countedCash: '245.00' };

  it('corregir el contado cambia solo la diferencia', () => {
    expect(correctionPreview(current, 'COUNTED_CASH', '250')).toEqual({
      expectedCents: 25000n,
      countedCents: 25000n,
      differenceCents: 0n,
    });
  });

  it('corregir el fondo cambia el esperado (los cobros congelados no cambian)', () => {
    expect(correctionPreview(current, 'OPENING_AMOUNT', '95')).toEqual({
      expectedCents: 24500n,
      countedCents: 24500n,
      differenceCents: 0n,
    });
  });

  it('un valor inválido no da vista previa', () => {
    expect(correctionPreview(current, 'COUNTED_CASH', '')).toBeNull();
  });
});
