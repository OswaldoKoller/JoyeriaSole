import {
  computeEntryCosts,
  formatMoney,
  formatUnitCost,
  parseExchangeRate,
  parseMoney,
  parseUnitCost,
  stockEntryItemInputSchema,
  unitsToCents,
  type StockEntryCurrency,
  type StockEntryDetail,
  type StockEntryItemInput,
  type StockEntryTotals,
} from '@joyeria/shared';

/** Línea del borrador tal como se edita: los campos son el texto de los <input>. */
export interface Line {
  variantId: string;
  sku: string;
  productName: string;
  variantLabel: string | null;
  profileIncomplete: boolean;
  expectedQty: string;
  receivedQty: string;
  /** Precio de compra unitario en la moneda del ingreso. */
  unitPrice: string;
  differenceReason: string;
  notes: string;
}

export const ingressLabel = (number: number) => `ING-${number.toString().padStart(6, '0')}`;

/** Sin ceros de relleno: «10.0000» → «10», «12.5000» → «12.5». */
export const trimZeros = (value: string) => value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');

export function fromServer(items: StockEntryDetail['items']): Line[] {
  return items.map((item) => ({
    variantId: item.variantId,
    sku: item.sku,
    productName: item.productName,
    variantLabel: item.variantLabel,
    profileIncomplete: item.profileIncomplete,
    expectedQty: item.expectedQty === null ? '' : String(item.expectedQty),
    receivedQty: String(item.receivedQty),
    unitPrice: item.cost ? trimZeros(item.cost.unitPrice) : '',
    differenceReason: item.differenceReason ?? '',
    notes: item.notes ?? '',
  }));
}

export type ParsedLines =
  { ok: true; items: StockEntryItemInput[] } | { ok: false; errors: Record<string, string> };

/** Valida las líneas con el mismo esquema que la API; devuelve un error legible por variante. */
export function toInput(lines: readonly Line[]): ParsedLines {
  const items: StockEntryItemInput[] = [];
  const errors: Record<string, string> = {};
  for (const line of lines) {
    const result = stockEntryItemInputSchema.safeParse({
      variantId: line.variantId,
      expectedQty: line.expectedQty.trim() === '' ? null : Number(line.expectedQty),
      receivedQty: line.receivedQty.trim() === '' ? Number.NaN : Number(line.receivedQty),
      unitPrice: line.unitPrice.trim(),
      differenceReason: line.differenceReason,
      notes: line.notes,
    });
    if (result.success) {
      items.push(result.data);
      continue;
    }
    const issue = result.error.issues[0];
    const field = issue?.path[0];
    errors[line.variantId] =
      field === 'receivedQty'
        ? 'La cantidad recibida debe ser un entero de 0 o más.'
        : field === 'expectedQty'
          ? 'La cantidad esperada debe ser un entero de 0 o más.'
          : field === 'unitPrice'
            ? 'El precio de compra admite hasta 4 decimales.'
            : (issue?.message ?? 'Línea inválida.');
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, items };
}

/** Líneas con diferencia entre lo esperado y lo recibido y sin justificar (C2). */
export function missingReasons(lines: readonly Line[]): Line[] {
  return lines.filter((line) => {
    if (line.expectedQty.trim() === '' || line.receivedQty.trim() === '') return false;
    const expected = Number(line.expectedQty);
    const received = Number(line.receivedQty);
    return (
      Number.isFinite(expected) &&
      Number.isFinite(received) &&
      expected !== received &&
      line.differenceReason.trim() === ''
    );
  });
}

/** Una fila del panel de costos: lo que se muestra de cada ítem. */
export interface CostRow {
  variantId: string;
  sku: string;
  productName: string;
  variantLabel: string | null;
  receivedQty: number;
  /** Precio unitario en la moneda del ingreso. */
  unitPrice: string;
  unitCostBob: string;
  subtotalBob: string;
  /** null mientras no se pueda repartir (valor de compra cero con costos adicionales). */
  extraAllocated: string | null;
  totalCost: string | null;
  unitExtraCost: string | null;
  unitTotalCost: string | null;
}

export interface Preview {
  rows: CostRow[];
  totals: StockEntryTotals;
  /** Hay costos adicionales pero el valor de compra es cero (ADR-015). */
  zeroValue: boolean;
  /** Motivo por el que no se puede calcular (p. ej. falta el tipo de cambio). */
  error: string | null;
}

const EMPTY_TOTALS: StockEntryTotals = {
  purchaseOriginal: '0.00',
  purchaseBob: '0.00',
  extras: '0.00',
  grand: '0.00',
};

/** Suma de montos válidos de la lista de costos adicionales, en centavos. */
export function sumCosts(amounts: readonly string[]): bigint {
  return amounts.reduce((sum, amount) => {
    try {
      return sum + parseMoney(amount.trim());
    } catch {
      return sum;
    }
  }, 0n);
}

/**
 * Vista previa en pantalla con el MISMO algoritmo que ejecuta la API al confirmar (conversión a
 * Bs con el tipo de cambio y reparto por valor con mayor resto: ADR-015 y ADR-016).
 */
export function previewEntry(args: {
  currency: StockEntryCurrency;
  exchangeRate: string | null;
  lines: readonly Line[];
  items: readonly StockEntryItemInput[];
  extrasCents: bigint;
}): Preview {
  const { currency, items, lines, extrasCents } = args;
  let rate: bigint | null = null;
  if (currency === 'USD') {
    try {
      rate = parseExchangeRate((args.exchangeRate ?? '').trim());
    } catch {
      return {
        rows: [],
        totals: { ...EMPTY_TOTALS, extras: formatMoney(extrasCents) },
        zeroValue: false,
        error: 'Indique el tipo de cambio del ingreso para ver los costos en bolivianos.',
      };
    }
  }
  const input = {
    currency,
    exchangeRate: rate,
    items: items.map((item) => ({
      key: item.variantId,
      receivedQty: item.receivedQty,
      unitPrice: parseUnitCost(item.unitPrice),
    })),
  };
  let result = computeEntryCosts({ ...input, extrasCents });
  const zeroValue = !result.ok && result.reason === 'ZERO_VALUE';
  // Sin base de reparto se muestran igual las conversiones y los subtotales de compra.
  if (zeroValue) result = computeEntryCosts({ ...input, extrasCents: 0n });
  if (!result.ok) {
    return {
      rows: [],
      totals: { ...EMPTY_TOTALS, extras: formatMoney(extrasCents) },
      zeroValue: false,
      error:
        result.reason === 'OVERFLOW'
          ? 'Un precio, convertido a bolivianos, supera el máximo permitido.'
          : 'Indique el tipo de cambio del ingreso para ver los costos en bolivianos.',
    };
  }
  const byVariant = new Map(lines.map((line) => [line.variantId, line]));
  const quantities = new Map(items.map((item) => [item.variantId, item.receivedQty]));
  const rows = result.lines.map((line): CostRow => {
    const meta = byVariant.get(line.key);
    return {
      variantId: line.key,
      sku: meta?.sku ?? '',
      productName: meta?.productName ?? '',
      variantLabel: meta?.variantLabel ?? null,
      receivedQty: quantities.get(line.key) ?? 0,
      unitPrice: formatUnitCost(line.unitPrice),
      unitCostBob: formatUnitCost(line.unitCostBob),
      subtotalBob: formatUnitCost(line.value),
      extraAllocated: zeroValue ? null : formatMoney(line.extraCents),
      totalCost: zeroValue ? null : formatUnitCost(line.totalCost),
      unitExtraCost: zeroValue ? null : formatUnitCost(line.unitExtra),
      unitTotalCost: zeroValue ? null : formatUnitCost(line.unitTotal),
    };
  });
  return {
    rows,
    totals: {
      purchaseOriginal: formatMoney(unitsToCents(result.totals.purchaseOriginal)),
      purchaseBob: formatMoney(unitsToCents(result.totals.purchaseBob)),
      extras: formatMoney(extrasCents),
      grand: formatMoney(unitsToCents(result.totals.purchaseBob + extrasCents * 100n)),
    },
    zeroValue,
    error: null,
  };
}

/** Panel de un ingreso ya cerrado, tal como quedó guardado en el servidor. */
export function storedPreview(entry: StockEntryDetail): Preview {
  return {
    rows: entry.items.flatMap((item) =>
      item.cost
        ? [
            {
              variantId: item.variantId,
              sku: item.sku,
              productName: item.productName,
              variantLabel: item.variantLabel,
              receivedQty: item.receivedQty,
              unitPrice: item.cost.unitPrice,
              unitCostBob: item.cost.unitCostBob,
              subtotalBob: item.cost.subtotalBob,
              extraAllocated: item.cost.extraAllocated,
              totalCost: item.cost.totalCost,
              unitExtraCost: item.cost.unitExtraCost,
              unitTotalCost: item.cost.unitTotalCost,
            },
          ]
        : [],
    ),
    totals: entry.totals ?? EMPTY_TOTALS,
    zeroValue: false,
    error: null,
  };
}
