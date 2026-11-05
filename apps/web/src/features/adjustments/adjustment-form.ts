import {
  createAdjustmentSchema,
  type AdjustmentReason,
  type CreateAdjustmentInput,
} from '@joyeria/shared';

/** Línea del formulario: la variante, su saldo actual y la diferencia que escribe el usuario. */
export interface FormLine {
  variantId: string;
  sku: string;
  productName: string;
  variantLabel: string | null;
  /** Saldo visto al agregar la línea. */
  quantity: number;
  /** Texto del campo: «-3», «+2», «5». */
  delta: string;
}

/** «-3» → -3, «+2» → 2, «5» → 5. Vacío, cero o no entero → null. */
export function parseDelta(text: string): number | null {
  const clean = text.trim();
  if (!/^[+-]?\d{1,7}$/.test(clean)) return null;
  const value = Number(clean);
  return value === 0 ? null : value;
}

/** Saldo que quedaría si se aprueba hoy, o null si la diferencia aún no es válida. */
export function resultingQuantity(line: FormLine): number | null {
  const delta = parseDelta(line.delta);
  return delta === null ? null : line.quantity + delta;
}

/** Atajo «Ajustar a cero»: salida de todo el saldo actual. */
export function zeroDelta(quantity: number): string {
  return quantity > 0 ? String(-quantity) : '';
}

export type FormResult =
  | { ok: true; input: CreateAdjustmentInput }
  | { ok: false; formError: string; lineErrors: Record<string, string> };

/** Valida con el mismo esquema que la API, más las reglas que dependen del motivo y del saldo. */
export function buildInput(
  form: { reasonId: string; notes: string; lines: FormLine[] },
  reasons: readonly AdjustmentReason[],
): FormResult {
  const lineErrors: Record<string, string> = {};
  if (form.lines.length === 0) {
    return { ok: false, formError: 'Agregue al menos una variante.', lineErrors };
  }
  for (const line of form.lines) {
    const delta = parseDelta(line.delta);
    if (delta === null) {
      lineErrors[line.variantId] = 'Indique una diferencia entera distinta de cero (ej. -2 o 3).';
    } else if (line.quantity + delta < 0) {
      lineErrors[line.variantId] =
        `El saldo es ${line.quantity}: la salida máxima es ${line.quantity}.`;
    }
  }
  if (Object.keys(lineErrors).length > 0) {
    return { ok: false, formError: 'Revise las cantidades marcadas.', lineErrors };
  }

  const reason = reasons.find((item) => item.id === form.reasonId);
  if (!reason) return { ok: false, formError: 'Elija el motivo del ajuste.', lineErrors };
  const notes = form.notes.trim();
  if (reason.requiresNotes && !notes) {
    return {
      ok: false,
      formError: `El motivo «${reason.name}» exige una observación.`,
      lineErrors,
    };
  }

  const parsed = createAdjustmentSchema.safeParse({
    reasonId: form.reasonId,
    notes,
    items: form.lines.map((line) => ({
      variantId: line.variantId,
      quantityDelta: parseDelta(line.delta),
    })),
  });
  if (!parsed.success) {
    return {
      ok: false,
      formError: parsed.error.issues[0]?.message ?? 'Datos inválidos.',
      lineErrors,
    };
  }
  return { ok: true, input: parsed.data };
}
