import { computeProfit, formatMoney, parseMoney, salePriceSchema } from '@joyeria/shared';

export type PriceInput =
  { status: 'empty' } | { status: 'invalid'; message: string } | { status: 'valid'; value: string };

/**
 * Interpreta lo que la persona escribe en «Nuevo precio». Acepta coma o punto como separador
 * decimal; el precio es neto (D7), con hasta 2 decimales; 0 es válido («Sin precio», D9).
 */
export function parsePriceInput(text: string): PriceInput {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return { status: 'empty' };
  const parsed = salePriceSchema.safeParse(trimmed);
  if (!parsed.success) {
    return {
      status: 'invalid',
      message: 'Use un número con hasta 2 decimales, por ejemplo 115,50',
    };
  }
  return { status: 'valid', value: formatMoney(parseMoney(parsed.data)) };
}

export interface ProfitView {
  /** Ganancia en Bs (con signo) o `null` si no se puede calcular. */
  profit: string | null;
  percent: string | null;
}

/** Ganancia y % sobre el costo total (Q-06). Sin costo disponible, ambos son `null`. */
export function profitView(price: string, totalCost: string | null | undefined): ProfitView {
  if (totalCost === null || totalCost === undefined) return { profit: null, percent: null };
  try {
    return computeProfit(price, totalCost);
  } catch {
    return { profit: null, percent: null };
  }
}
