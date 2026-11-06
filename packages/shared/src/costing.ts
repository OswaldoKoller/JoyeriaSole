/**
 * Costeo de ingresos de mercadería (ADR-013 y ADR-015).
 *
 * Toda la aritmética es ENTERA y exacta (BigInt), nunca de coma flotante:
 *  - precios y costos unitarios: unidades de 1/10 000 (4 decimales);
 *  - tipo de cambio (Bs por USD): unidades de 1/10 000 (4 decimales);
 *  - costos adicionales del documento: centavos (2 decimales).
 *
 * Compras en dólares (ADR-016): el precio unitario digitado se convierte a bolivianos con el tipo
 * de cambio del ingreso (`convertToBob`) y SOBRE ese valor ya convertido se reparten los costos
 * adicionales (`allocateExtraCosts`, ADR-015). `computeEntryCosts` encadena ambos pasos.
 *
 * Estas funciones las usan la API (al confirmar) y la interfaz (vista previa), por lo que ambas
 * calculan siempre el mismo resultado.
 */

const UNIT_RE = /^(0|[1-9]\d{0,7})(?:\.(\d{1,4}))?$/;
const RATE_RE = /^(0|[1-9]\d{0,3})(?:\.(\d{1,4}))?$/;
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

/** Valor de `delta` piezas a `unitCost` (4 decimales), en Bs con 2 decimales y signo. */
export function valueOfDelta(delta: number, unitCost: string): string {
  const magnitude = unitsToCents(BigInt(Math.abs(delta)) * parseUnitCost(unitCost));
  return formatMoney(delta < 0 ? -magnitude : magnitude);
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

// ---------------------------------------------------------------------------
// Compras en dólares y costo total del ingreso (ADR-016)
// ---------------------------------------------------------------------------

/** Mayor costo unitario que cabe en la columna `Decimal(12,4)`: 99 999 999,9999. */
export const MAX_UNIT_COST_UNITS = 999_999_999_999n;

/**
 * «6.96» → 69600n (unidades de 1/10 000). Bolivianos por cada dólar, hasta 4 decimales, mayor que
 * cero y de hasta 4 cifras enteras. Lanza si el formato no es válido.
 */
export function parseExchangeRate(value: string): bigint {
  const match = RATE_RE.exec(value);
  if (!match) throw new RangeError(`Tipo de cambio inválido: ${value}`);
  const units = BigInt(match[1] ?? '0') * 10_000n + BigInt((match[2] ?? '').padEnd(4, '0'));
  if (units === 0n) throw new RangeError('El tipo de cambio debe ser mayor que cero');
  return units;
}

/**
 * Equivalente en bolivianos de un precio unitario: precio × tipo de cambio, redondeado a 4
 * decimales con la mitad hacia arriba. Ambos argumentos vienen en unidades de 1/10 000.
 */
export function convertToBob(priceUnits: bigint, rateUnits: bigint): bigint {
  return (priceUnits * rateUnits + 5_000n) / 10_000n;
}

export type PurchaseCurrency = 'BOB' | 'USD';

export interface EntryCostItemInput {
  /** Identificador estable de la línea (para el desempate del reparto). */
  key: string;
  receivedQty: number;
  /** Precio de compra unitario en la moneda del ingreso, en unidades de 1/10 000. */
  unitPrice: bigint;
}

export interface EntryCostLine extends AllocationLine {
  /** Precio unitario original (moneda del ingreso). */
  unitPrice: bigint;
  /** Equivalente unitario en Bs del precio de compra. */
  unitCostBob: bigint;
  /** receivedQty × unitPrice en la moneda del ingreso, unidades de 1/10 000. */
  valueOriginal: bigint;
  /** Costo total del ítem en Bs = valor de compra + costos adicionales asignados (1/10 000). */
  totalCost: bigint;
}

export interface EntryCostTotals {
  /** Valor de compra en la moneda del ingreso (1/10 000). */
  purchaseOriginal: bigint;
  /** Valor de compra en Bs (1/10 000). */
  purchaseBob: bigint;
  /** Costos adicionales del ingreso, centavos. */
  extrasCents: bigint;
  /** Valor de compra + costos adicionales, en Bs (1/10 000). */
  grand: bigint;
}

export type EntryCostResult =
  | { ok: true; lines: EntryCostLine[]; totals: EntryCostTotals }
  | { ok: false; reason: 'ZERO_VALUE' | 'MISSING_RATE' | 'OVERFLOW' };

/**
 * Conversión a Bs + reparto de costos adicionales de un ingreso completo.
 *  - BOB: el precio es ya el costo en Bs; no admite tipo de cambio.
 *  - USD: exige tipo de cambio; el costo unitario en Bs se redondea a 4 decimales ANTES de
 *    multiplicar por la cantidad, de modo que `cantidad × costo unitario` es exacto (ADR-016).
 *  - OVERFLOW: algún precio o costo convertido no cabe en `Decimal(12,4)`.
 *  - ZERO_VALUE: hay costos adicionales y el valor de compra es cero (ADR-015).
 */
export function computeEntryCosts(input: {
  currency: PurchaseCurrency;
  exchangeRate: bigint | null;
  items: readonly EntryCostItemInput[];
  extrasCents: bigint;
}): EntryCostResult {
  const { currency, exchangeRate } = input;
  if (currency === 'USD' && (exchangeRate === null || exchangeRate <= 0n)) {
    return { ok: false, reason: 'MISSING_RATE' };
  }

  const converted = input.items.map((item) => {
    const unitCostBob =
      currency === 'USD' && exchangeRate !== null
        ? convertToBob(item.unitPrice, exchangeRate)
        : item.unitPrice;
    return { item, unitCostBob };
  });
  if (
    converted.some(
      ({ item, unitCostBob }) =>
        item.unitPrice > MAX_UNIT_COST_UNITS || unitCostBob > MAX_UNIT_COST_UNITS,
    )
  ) {
    return { ok: false, reason: 'OVERFLOW' };
  }

  const allocation = allocateExtraCosts(
    converted.map(({ item, unitCostBob }) => ({
      key: item.key,
      receivedQty: item.receivedQty,
      unitCost: unitCostBob,
    })),
    input.extrasCents,
  );
  if (!allocation.ok) return { ok: false, reason: allocation.reason };

  const lines = allocation.lines.map((line, index): EntryCostLine => {
    const entry = converted[index];
    const unitPrice = entry?.item.unitPrice ?? 0n;
    return {
      ...line,
      unitPrice,
      unitCostBob: entry?.unitCostBob ?? 0n,
      valueOriginal: BigInt(entry?.item.receivedQty ?? 0) * unitPrice,
      totalCost: line.value + line.extraCents * 100n,
    };
  });
  return {
    ok: true,
    lines,
    totals: {
      purchaseOriginal: lines.reduce((sum, line) => sum + line.valueOriginal, 0n),
      purchaseBob: allocation.totalValue,
      extrasCents: input.extrasCents,
      grand: allocation.totalValue + input.extrasCents * 100n,
    },
  };
}
