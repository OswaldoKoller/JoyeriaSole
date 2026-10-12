/**
 * Costeo de ingresos de mercadería (ADR-013 y ADR-015).
 *
 * Toda la aritmética es ENTERA y exacta (BigInt), nunca de coma flotante:
 *  - costo unitario: unidades de 1/10 000 (4 decimales);
 *  - importes del documento (transporte, embolsado, extras): centavos (2 decimales).
 *
 * Esta función la usan la API (al confirmar) y la interfaz (vista previa), por lo que ambas
 * calculan siempre el mismo resultado.
 */

const UNIT_RE = /^(0|[1-9]\d{0,7})(?:\.(\d{1,4}))?$/;
const MONEY_RE = /^(0|[1-9]\d{0,9})(?:\.(\d{1,2}))?$/;

/** «12.5» → 125000n (unidades de 1/10 000). Lanza si el formato no es válido. */
export function parseUnitCost(value: string): bigint {
  const match = UNIT_RE.exec(value);
  if (!match) throw new RangeError(`Costo unitario inválido: ${value}`);
  return BigInt(match[1] ?? '0') * 10_000n + BigInt((match[2] ?? '').padEnd(4, '0'));
}

/** «150.5» → 15050n (centavos). Lanza si el formato no es válido. */
export function parseMoney(value: string): bigint {
  const match = MONEY_RE.exec(value);
  if (!match) throw new RangeError(`Importe inválido: ${value}`);
  return BigInt(match[1] ?? '0') * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}

function format(units: bigint, decimals: number, scale: bigint): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / scale;
  const fraction = (abs % scale).toString().padStart(decimals, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
}

/** 125000n → «12.5000». */
export function formatUnitCost(units: bigint): string {
  return format(units, 4, 10_000n);
}

/** 15050n → «150.50». */
export function formatMoney(cents: bigint): string {
  return format(cents, 2, 100n);
}

/** Valor de una línea en unidades de 1/10 000 → centavos (mitad hacia arriba), para mostrar. */
export function unitsToCents(units: bigint): bigint {
  const cents = units / 100n;
  return units % 100n >= 50n ? cents + 1n : cents;
}

export interface AllocationInput {
  /** Identificador estable de la línea (para el desempate). */
  key: string;
  receivedQty: number;
  /** Costo unitario de compra en unidades de 1/10 000. */
  unitCost: bigint;
}

export interface AllocationLine {
  key: string;
  /** receivedQty × unitCost, en unidades de 1/10 000. */
  value: bigint;
  /** Parte de los costos adicionales asignada a la línea, en centavos. */
  extraCents: bigint;
  /** Costo adicional por pieza, en unidades de 1/10 000 (mitad hacia arriba). */
  unitExtra: bigint;
  /** Costo unitario total = compra + adicional. */
  unitTotal: bigint;
}

export type AllocationResult =
  { ok: true; lines: AllocationLine[]; totalValue: bigint } | { ok: false; reason: 'ZERO_VALUE' };

/**
 * Reparte `extrasCents` entre las líneas en proporción a su valor (ADR-013) y resuelve los
 * centavos sobrantes por mayor resto (ADR-015). La suma de las partes iguala exactamente el total.
 * Con costos adicionales y valor total cero no hay base de reparto: devuelve ZERO_VALUE.
 */
export function allocateExtraCosts(
  inputs: readonly AllocationInput[],
  extrasCents: bigint,
): AllocationResult {
  const values = inputs.map((input) => BigInt(input.receivedQty) * input.unitCost);
  const totalValue = values.reduce((sum, value) => sum + value, 0n);

  if (extrasCents > 0n && totalValue === 0n) return { ok: false, reason: 'ZERO_VALUE' };

  const shares = inputs.map((_, index) => {
    if (extrasCents === 0n) return { base: 0n, remainder: 0n };
    const numerator = extrasCents * (values[index] ?? 0n);
    return { base: numerator / totalValue, remainder: numerator % totalValue };
  });

  // Centavos que faltan para igualar el total: siempre menos que las líneas con resto > 0.
  const assigned = shares.reduce((sum, share) => sum + share.base, 0n);
  const leftover = Number(extrasCents - assigned);
  const order = inputs
    .map((input, index) => ({ index, key: input.key }))
    .sort((a, b) => {
      const byRemainder = (shares[b.index]?.remainder ?? 0n) - (shares[a.index]?.remainder ?? 0n);
      if (byRemainder !== 0n) return byRemainder > 0n ? 1 : -1;
      const byValue = (values[b.index] ?? 0n) - (values[a.index] ?? 0n);
      if (byValue !== 0n) return byValue > 0n ? 1 : -1;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
  const bonus = new Set(order.slice(0, leftover).map((entry) => entry.index));

  const lines = inputs.map((input, index): AllocationLine => {
    const extraCents = (shares[index]?.base ?? 0n) + (bonus.has(index) ? 1n : 0n);
    const quantity = BigInt(input.receivedQty);
    let unitExtra = 0n;
    if (quantity > 0n) {
      const numerator = extraCents * 100n;
      unitExtra = numerator / quantity;
      if ((numerator % quantity) * 2n >= quantity) unitExtra += 1n;
    }
    return {
      key: input.key,
      value: values[index] ?? 0n,
      extraCents,
      unitExtra,
      unitTotal: input.unitCost + unitExtra,
    };
  });

  return { ok: true, lines, totalValue };
}
