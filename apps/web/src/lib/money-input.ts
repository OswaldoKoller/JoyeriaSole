import { MONEY_PATTERN, formatMoney, parseMoney, parseSignedMoney } from '@joyeria/shared';

/**
 * Importes escritos por la persona (Bs). Se acepta coma o punto decimal («150,50» o «150.50») y se
 * envían a la API siempre con punto. Toda la aritmética se hace en centavos enteros (`bigint`):
 * nunca se suma dinero en coma flotante. Vacío NO es cero (D-05): el cero se escribe a propósito.
 */

/** Texto normalizado para la API: sin espacios y con punto decimal. */
export function normalizeMoneyText(text: string): string {
  return text.trim().replace(',', '.');
}

/** Centavos del texto escrito, o `null` si está vacío o no es un importe válido. */
export function moneyTextToCents(text: string): bigint | null {
  const normalized = normalizeMoneyText(text);
  if (!MONEY_PATTERN.test(normalized)) return null;
  return parseMoney(normalized);
}

/** ¿El texto está vacío (sin contar espacios)? */
export function isBlank(text: string): boolean {
  return text.trim() === '';
}

/** Centavos de un importe de la API («150.00», «-0.50»). */
export function amountToCents(value: string): bigint {
  return parseSignedMoney(value);
}

/** Centavos → texto de la API con 2 decimales («150.50», «-0.50»). */
export function centsToAmount(cents: bigint): string {
  return formatMoney(cents);
}
