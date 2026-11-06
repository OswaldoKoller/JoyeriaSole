/**
 * Lógica pura del conteo físico (ADR-014 y ADR-021). Sin acceso a la base de datos: se prueba aparte.
 */

export interface ReconcileInput {
  /** Conteo final de la variante (el recuento prevalece sobre el primer conteo). */
  countedQty: number;
  /** Saldo vigente en el libro al momento de conciliar. */
  currentQty: number;
  /** Suma de los movimientos de la variante posteriores al momento en que se contó la pieza. */
  movementsSince: number;
}

export interface Reconciliation {
  /** Lo que el sistema tenía en el momento del conteo: saldo vigente − movimientos posteriores. */
  expectedQty: number;
  /** Diferencia real a ajustar: conteo − esperado. 0 = sin ajuste. */
  difference: number;
  /** Saldo con el que queda la variante: conteo + movimientos posteriores (= vigente + diferencia). */
  targetQty: number;
}

/**
 * Concilia el conteo físico con los movimientos ocurridos mientras se contaba (p. ej. un ingreso
 * confirmado durante el conteo). La pieza se contó en cierto momento; los movimientos posteriores a
 * ese momento NO estaban en el estante cuando se contó, así que se conservan:
 *
 *   esperado   = vigente − posteriores            (lo que el sistema tenía al contar)
 *   diferencia = contado − esperado               (el ajuste real)
 *   resultado  = vigente + diferencia = contado + posteriores
 *
 * Nunca se aplica una diferencia calculada solo contra la foto inicial (ADR-014).
 */
export function reconcileCount(input: ReconcileInput): Reconciliation {
  const expectedQty = input.currentQty - input.movementsSince;
  const difference = input.countedQty - expectedQty;
  return { expectedQty, difference, targetQty: input.currentQty + difference };
}

export interface ScopeCandidate {
  id: string;
  number: number;
  variantIds: readonly string[];
}

export interface ScopeOverlap {
  countId: string;
  number: number;
  /** Cantidad de variantes que comparte con el conteo nuevo. */
  sharedVariants: number;
}

/**
 * Varios conteos simultáneos solo son posibles si no comparten variantes (Q-13 B). Devuelve, por
 * cada conteo no terminado que comparte alguna variante con `variantIds`, cuántas comparte.
 */
export function findScopeOverlaps(
  variantIds: Iterable<string>,
  others: readonly ScopeCandidate[],
): ScopeOverlap[] {
  const wanted = new Set(variantIds);
  const overlaps: ScopeOverlap[] = [];
  for (const other of others) {
    let shared = 0;
    for (const id of other.variantIds) if (wanted.has(id)) shared += 1;
    if (shared > 0)
      overlaps.push({ countId: other.id, number: other.number, sharedVariants: shared });
  }
  return overlaps.sort((a, b) => a.number - b.number);
}

/** Normaliza lo que entrega el lector: sin espacios ni caracteres de control alrededor. */
export function normalizeScanCode(raw: string): string {
  let cleaned = '';
  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 32 && code !== 127) cleaned += char;
  }
  return cleaned.trim();
}

export interface RecountSelectionItem {
  countedQty: number;
  currentQty: number;
  movementsSince: number;
}

/** ¿Esta variante requiere segundo recuento? Sí cuando el primer conteo difiere de lo esperado. */
export function needsRecount(item: RecountSelectionItem): boolean {
  return reconcileCount(item).difference !== 0;
}

/** Conteo final y cursor de conciliación de una variante: el recuento, si existe, prevalece. */
export function finalCountOf<T extends number | bigint>(
  counted: { qty: number | null; cursor: T | null },
  recount: { qty: number | null; cursor: T | null },
): { qty: number; cursor: T | null } {
  if (recount.qty !== null) return { qty: recount.qty, cursor: recount.cursor };
  return { qty: counted.qty ?? 0, cursor: counted.cursor };
}
