import { CASH_CLOSE_NOTES_MIN_LENGTH, cashDifferenceCents } from '@joyeria/shared';
import { formatBs } from '../../lib/format.ts';
import { amountToCents, centsToAmount, moneyTextToCents } from '../../lib/money-input.ts';

/**
 * Lógica pura del arqueo para la interfaz (la API recalcula y decide; esto solo anticipa lo que
 * verá la persona). Centavos enteros: nunca coma flotante.
 */

/** Diferencia del arqueo en centavos (contado − esperado), o `null` si el contado no es válido. */
export function previewDifference(expectedCash: string, countedText: string): bigint | null {
  const counted = moneyTextToCents(countedText);
  if (counted === null) return null;
  return cashDifferenceCents(counted, amountToCents(expectedCash));
}

/**
 * Texto de una diferencia: el signo nunca se comunica solo con color (accesibilidad).
 * Positivo = sobrante, negativo = faltante.
 */
export function differenceLabel(cents: bigint): string {
  if (cents === 0n) return 'Sin diferencia';
  const magnitude = formatBs(centsToAmount(cents < 0n ? -cents : cents));
  return cents > 0n ? `Sobrante de ${magnitude}` : `Faltante de ${magnitude}`;
}

/** Igual que `differenceLabel`, a partir del importe con signo que devuelve la API. */
export function differenceLabelOf(amount: string): string {
  return differenceLabel(amountToCents(amount));
}

/** R-14: toda diferencia distinta de cero exige una observación (sin tolerancia). */
export function noteRequired(differenceCents: bigint | null): boolean {
  return differenceCents !== null && differenceCents !== 0n;
}

export interface CorrectionPreview {
  expectedCents: bigint;
  countedCents: bigint;
  differenceCents: bigint;
}

/**
 * Cifras que quedarían vigentes tras una corrección (doc. 10 §4.1): corregir el contado cambia la
 * diferencia; corregir el fondo cambia el esperado (los cobros congelados no cambian). `null` si el
 * valor nuevo no es un importe válido. Es solo una vista previa: la API recalcula.
 */
export function correctionPreview(
  current: { openingAmount: string; expectedCash: string; countedCash: string | null },
  kind: 'COUNTED_CASH' | 'OPENING_AMOUNT',
  newValueText: string,
): CorrectionPreview | null {
  const value = moneyTextToCents(newValueText);
  if (value === null || current.countedCash === null) return null;
  const opening = amountToCents(current.openingAmount);
  const expected = amountToCents(current.expectedCash);
  const counted = amountToCents(current.countedCash);
  const expectedCents = kind === 'OPENING_AMOUNT' ? expected - opening + value : expected;
  const countedCents = kind === 'COUNTED_CASH' ? value : counted;
  return {
    expectedCents,
    countedCents,
    differenceCents: cashDifferenceCents(countedCents, expectedCents),
  };
}

/** ¿La observación cumple el mínimo de caracteres que exige la API? */
export function noteIsValid(note: string): boolean {
  return note.trim().length >= CASH_CLOSE_NOTES_MIN_LENGTH;
}
