import { stockEntryCostInputSchema, type StockEntryCostLine } from '@joyeria/shared';
import { trimZeros } from './lines.ts';

/** Línea de costo adicional tal como se edita: textos de los campos. */
export interface CostLine {
  /** Identificador local para la clave de React; no viaja a la API. */
  key: string;
  costTypeId: string;
  amount: string;
  note: string;
}

let nextKey = 0;
export const newCostKey = () => `cost-${(nextKey += 1)}`;

export function costsFromServer(costs: readonly StockEntryCostLine[] | null): CostLine[] {
  return (costs ?? []).map((cost) => ({
    key: newCostKey(),
    costTypeId: cost.costTypeId,
    // Como el precio de compra de los ítems: el campo muestra el monto como se escribe («11»,
    // «10.5»), no el decimal crudo de la API («11.00»). El texto de solo lectura usa formatBs.
    amount: trimZeros(cost.amount),
    note: cost.note ?? '',
  }));
}

export type ParsedCosts =
  | { ok: true; costs: { costTypeId: string; amount: string; note: string | null }[] }
  | { ok: false; errors: Record<string, string> };

/** Valida con el mismo esquema que la API; el error se asocia a la línea. */
export function costsToInput(lines: readonly CostLine[]): ParsedCosts {
  const costs: { costTypeId: string; amount: string; note: string | null }[] = [];
  const errors: Record<string, string> = {};
  for (const line of lines) {
    const result = stockEntryCostInputSchema.safeParse({
      costTypeId: line.costTypeId,
      amount: line.amount.trim(),
      note: line.note,
    });
    if (result.success) {
      costs.push({
        costTypeId: result.data.costTypeId,
        amount: result.data.amount,
        note: result.data.note ?? null,
      });
    } else {
      const field = result.error.issues[0]?.path[0];
      errors[line.key] =
        field === 'costTypeId'
          ? 'Seleccione el tipo de costo.'
          : field === 'amount'
            ? 'El monto debe ser mayor que cero, con hasta 2 decimales.'
            : 'Línea inválida.';
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, costs };
}
