import {
  cashDifferenceCents,
  CASH_CLOSE_NOTES_MIN_LENGTH,
  expectedCashCents,
  formatMoney,
  parseMoney,
} from '@joyeria/shared';

/**
 * Cálculo puro del arqueo al cerrar (B5, B6, R-14). La aritmética base vive en `@joyeria/shared`
 * (la web muestra exactamente las mismas cifras); aquí se decide si el cierre es aceptable.
 */
export interface ClosingFigures {
  cashSalesTotal: string;
  cashMovementsNet: string;
  expectedCash: string;
  countedCash: string;
  difference: string;
}

export type ClosingPlan =
  | { ok: true; figures: ClosingFigures }
  | { ok: false; reason: 'NOTE_REQUIRED'; figures: ClosingFigures };

/**
 * Esperado = fondo + cobros en efectivo (sin gastos ni retiros, B6). Diferencia = contado − esperado
 * (positivo sobrante, negativo faltante). Toda diferencia distinta de cero exige observación de al
 * menos 3 caracteres; no hay tolerancia ni tope (R-14).
 */
export function planClosing(input: {
  openingAmount: string;
  cashSalesTotal: string;
  countedCash: string;
  notes: string | null | undefined;
}): ClosingPlan {
  const cashSales = parseMoney(input.cashSalesTotal);
  const expected = expectedCashCents(parseMoney(input.openingAmount), cashSales);
  const counted = parseMoney(input.countedCash);
  const difference = cashDifferenceCents(counted, expected);
  const figures: ClosingFigures = {
    cashSalesTotal: formatMoney(cashSales),
    cashMovementsNet: formatMoney(0n),
    expectedCash: formatMoney(expected),
    countedCash: formatMoney(counted),
    difference: formatMoney(difference),
  };
  const notes = input.notes?.trim() ?? '';
  if (difference !== 0n && notes.length < CASH_CLOSE_NOTES_MIN_LENGTH) {
    return { ok: false, reason: 'NOTE_REQUIRED', figures };
  }
  return { ok: true, figures };
}
