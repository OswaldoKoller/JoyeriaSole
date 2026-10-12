import {
  allocateExtraCosts,
  formatMoney,
  formatUnitCost,
  parseUnitCost,
  stockEntryItemInputSchema,
  unitsToCents,
  type StockEntryDetail,
  type StockEntryItemInput,
} from '@joyeria/shared';

/** Línea del borrador tal como se edita: los campos son el texto de los <input>. */
export interface Line {
  variantId: string;
  sku: string;
  productName: string;
  variantLabel: string | null;
  expectedQty: string;
  receivedQty: string;
  unitCost: string;
  notes: string;
}

export const ingressLabel = (number: number) => `ING-${number.toString().padStart(6, '0')}`;

export function fromServer(items: StockEntryDetail['items']): Line[] {
  return items.map((item) => ({
    variantId: item.variantId,
    sku: item.sku,
    productName: item.productName,
    variantLabel: item.variantLabel,
    expectedQty: item.expectedQty === null ? '' : String(item.expectedQty),
    receivedQty: String(item.receivedQty),
    // Sin ceros de relleno: «10.0000» → «10», «12.5000» → «12.5».
    unitCost: item.unitCost.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''),
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
      unitCost: line.unitCost.trim(),
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
          : field === 'unitCost'
            ? 'El costo unitario admite hasta 4 decimales.'
            : (issue?.message ?? 'Línea inválida.');
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, items };
}

export interface Preview {
  purchaseTotal: string;
  extrasTotal: string;
  grandTotal: string;
  /** Costo adicional y total por pieza, por variante; vacío si no se puede repartir. */
  perVariant: Map<string, { unitExtra: string; unitTotal: string }>;
  /** Hay costos adicionales pero el valor de compra es cero (ADR-015). */
  zeroValue: boolean;
}

/** Vista previa en pantalla con el MISMO algoritmo que ejecuta la API al confirmar. */
export function previewLines(items: readonly StockEntryItemInput[], extrasCents: bigint): Preview {
  const result = allocateExtraCosts(
    items.map((item) => ({
      key: item.variantId,
      receivedQty: item.receivedQty,
      unitCost: parseUnitCost(item.unitCost),
    })),
    extrasCents,
  );
  const purchaseUnits = items.reduce(
    (sum, item) => sum + BigInt(item.receivedQty) * parseUnitCost(item.unitCost),
    0n,
  );
  const purchaseCents = unitsToCents(purchaseUnits);
  const perVariant = new Map<string, { unitExtra: string; unitTotal: string }>();
  if (result.ok) {
    for (const line of result.lines) {
      perVariant.set(line.key, {
        unitExtra: formatUnitCost(line.unitExtra),
        unitTotal: formatUnitCost(line.unitTotal),
      });
    }
  }
  return {
    purchaseTotal: formatMoney(purchaseCents),
    extrasTotal: formatMoney(extrasCents),
    grandTotal: formatMoney(purchaseCents + extrasCents),
    perVariant,
    zeroValue: !result.ok,
  };
}
