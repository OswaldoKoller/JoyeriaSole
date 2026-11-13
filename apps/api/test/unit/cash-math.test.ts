/** Aritmética del arqueo de caja (B5, B6, R-14; documento 10 §4). Lógica pura, sin base de datos. */
import {
  cashDifferenceCents,
  currentCashFigures,
  expectedCashCents,
  parseSignedMoney,
} from '@joyeria/shared';
import { describe, expect, it } from 'vitest';
import { planClosing } from '../../src/modules/cash/cash-math.ts';

describe('efectivo esperado y diferencia del arqueo', () => {
  it('esperado = fondo + cobros en efectivo APLICADOS (netos de vuelto), sin gastos ni retiros', () => {
    // Documento 02 §6 sin gastos ni retiros (B6): fondo 200; venta 1 efectivo 100 (recibido 150,
    // vuelto 50); venta 2 QR 50 + efectivo 30; venta 3 transferencia 120.
    expect(expectedCashCents(20_000n, 10_000n + 3_000n)).toBe(33_000n);
    expect(expectedCashCents(20_000n, 13_000n, 0n)).toBe(33_000n);
  });

  it('la diferencia tiene signo: positivo sobrante, negativo faltante', () => {
    expect(cashDifferenceCents(32_950n, 33_000n)).toBe(-50n);
    expect(cashDifferenceCents(33_100n, 33_000n)).toBe(100n);
    expect(cashDifferenceCents(33_000n, 33_000n)).toBe(0n);
  });

  it('planClosing calcula las cifras y exige observación solo si hay diferencia', () => {
    const exact = planClosing({
      openingAmount: '200',
      cashSalesTotal: '130',
      countedCash: '330.00',
      notes: null,
    });
    expect(exact).toEqual({
      ok: true,
      figures: {
        cashSalesTotal: '130.00',
        cashMovementsNet: '0.00',
        expectedCash: '330.00',
        countedCash: '330.00',
        difference: '0.00',
      },
    });

    const missing = planClosing({
      openingAmount: '200',
      cashSalesTotal: '130',
      countedCash: '329.5',
      notes: '  ',
    });
    expect(missing.ok).toBe(false);
    expect(missing.figures.difference).toBe('-0.50');

    // Sin tolerancia: incluso un centavo exige observación (R-14); 3 caracteres bastan.
    expect(
      planClosing({ openingAmount: '0', cashSalesTotal: '0', countedCash: '0.01', notes: 'ab' }).ok,
    ).toBe(false);
    expect(
      planClosing({ openingAmount: '0', cashSalesTotal: '0', countedCash: '0.01', notes: 'abc' })
        .ok,
    ).toBe(true);
  });

  it('parseSignedMoney admite diferencias negativas', () => {
    expect(parseSignedMoney('-1800.00')).toBe(-180_000n);
    expect(parseSignedMoney('20.5')).toBe(2_050n);
  });
});

describe('cifras vigentes tras correcciones (documento 10 §4.1)', () => {
  const original = {
    openingAmount: '2000.00',
    cashSalesTotal: '450.00',
    cashMovementsNet: '0.00',
    countedCash: '650.00',
  };

  it('sin correcciones, las vigentes son las originales', () => {
    expect(currentCashFigures(original, [])).toEqual({
      openingAmount: '2000.00',
      expectedCash: '2450.00',
      countedCash: '650.00',
      difference: '-1800.00',
    });
  });

  it('ejemplo 10 §4.2: corregir el fondo a 200 deja la diferencia vigente en 0', () => {
    expect(currentCashFigures(original, [{ kind: 'OPENING_AMOUNT', newValue: '200.00' }])).toEqual({
      openingAmount: '200.00',
      expectedCash: '650.00',
      countedCash: '650.00',
      difference: '0.00',
    });
  });

  it('una cadena usa el último valor de cada tipo; las observaciones no cambian cifras', () => {
    const figures = currentCashFigures(original, [
      { kind: 'COUNTED_CASH', newValue: '600.00' },
      { kind: 'NOTE', newValue: null },
      { kind: 'OPENING_AMOUNT', newValue: '150.00' },
      { kind: 'COUNTED_CASH', newValue: '610.00' },
    ]);
    // Esperado vigente = fondo vigente + cobros CONGELADOS (nunca se teclea).
    expect(figures).toEqual({
      openingAmount: '150.00',
      expectedCash: '600.00',
      countedCash: '610.00',
      difference: '10.00',
    });
  });

  it('propiedad: con cualquier cadena, esperado = fondo vigente + cobros y diferencia = contado − esperado', () => {
    const kinds = ['COUNTED_CASH', 'OPENING_AMOUNT', 'NOTE'] as const;
    let seed = 7;
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed;
    };
    for (let run = 0; run < 200; run += 1) {
      const chain = Array.from({ length: next() % 6 }, () => {
        const kind = kinds[next() % 3] ?? 'NOTE';
        return {
          kind,
          newValue:
            kind === 'NOTE'
              ? null
              : `${String(next() % 5000)}.${String(next() % 100).padStart(2, '0')}`,
        };
      });
      const f = currentCashFigures(original, chain);
      const opening = parseSignedMoney(f.openingAmount);
      expect(parseSignedMoney(f.expectedCash)).toBe(opening + 45_000n);
      expect(parseSignedMoney(f.difference)).toBe(
        parseSignedMoney(f.countedCash) - parseSignedMoney(f.expectedCash),
      );
    }
  });
});
