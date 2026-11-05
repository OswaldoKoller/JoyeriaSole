import { computeProfit, formatMoney, parseMoney, salePriceSchema } from '@joyeria/shared';

const bob = new Intl.NumberFormat('es-BO', {
  style: 'currency',
  currency: 'BOB',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const percent = new Intl.NumberFormat('es-BO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateTime = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  dateStyle: 'short',
  timeStyle: 'short',
});

/** Dinero con coma decimal: «Bs 12,50». `null` y vacío se muestran como «—». */
export function formatBs(value: string | null | undefined): string {
  return value === null || value === undefined ? '—' : bob.format(Number(value));
}

export function formatPercent(value: string | null): string {
  return value === null ? '—' : `${percent.format(Number(value))} %`;
}

export function formatDateTime(iso: string | null): string {
  return iso ? dateTime.format(new Date(iso)) : '—';
}

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
