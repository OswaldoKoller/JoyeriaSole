import { formatMoney, parseMoney, parseUnitCost } from './costing.ts';

/**
 * Ganancia de una variante frente a su costo total unitario (Q-06, ADR-018).
 *
 * Aritmética entera exacta (BigInt), sin coma flotante, igual en API e interfaz:
 *   ganancia = precio de venta - costo total unitario           (Bs, redondeada a centavos)
 *   % sobre el costo total = (precio - costo) / costo x 100     (2 decimales)
 *
 * Con costo 0 el porcentaje no existe (`null`; la interfaz muestra «—»). Una ganancia negativa
 * (precio menor al costo) es válida: solo se advierte, nunca se bloquea.
 * Redondeo: mitad hacia arriba en valor absoluto (-0,005 pasa a -0,01).
 */
export interface ProfitResult {
  /** Ganancia en Bs con 2 decimales y signo `-` si es pérdida. */
  profit: string;
  /** Porcentaje sobre el costo total con 2 decimales, o `null` si el costo es 0. */
  percent: string | null;
}

/** División entera redondeando la mitad hacia arriba en valor absoluto. */
function divRound(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const quotient = (2n * abs + denominator) / (2n * denominator);
  return negative ? -quotient : quotient;
}

/**
 * @param salePrice precio de venta «12.50» (hasta 2 decimales)
 * @param totalCost costo total unitario «8.3333» (hasta 4 decimales)
 * @throws RangeError si algún formato no es válido
 */
export function computeProfit(salePrice: string, totalCost: string): ProfitResult {
  const priceUnits = parseMoney(salePrice) * 100n; // centavos → unidades de 1/10 000
  const costUnits = parseUnitCost(totalCost);
  const diff = priceUnits - costUnits;
  const profit = formatMoney(divRound(diff, 100n));
  const percent = costUnits === 0n ? null : formatMoney(divRound(diff * 10_000n, costUnits));
  return { profit, percent };
}

/** ¿El precio permite vender? D9: precio 0 es válido, pero no vendible (Fase 2). */
export function hasSalePrice(salePrice: string): boolean {
  return parseMoney(salePrice) > 0n;
}
