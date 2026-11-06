/** Valor JSON de la auditoría (antes/después/metadatos). */
export type AuditJson =
  string | number | boolean | null | AuditJson[] | { [key: string]: AuditJson };

export interface DiffRow {
  /** Ruta del campo; los objetos anidados se aplanan con punto: `address.city`. */
  field: string;
  before: AuditJson | undefined;
  after: AuditJson | undefined;
  changed: boolean;
}

/** Profundidad máxima de aplanado; más allá, el objeto se compara como un único valor. */
const MAX_DEPTH = 4;

function isPlainObject(value: AuditJson | undefined): value is { [key: string]: AuditJson } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function flatten(
  value: AuditJson | undefined,
  prefix: string,
  out: Map<string, AuditJson>,
  depth: number,
) {
  if (isPlainObject(value) && depth < MAX_DEPTH && Object.keys(value).length > 0) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out, depth + 1);
    }
    return;
  }
  if (value !== undefined) out.set(prefix, value);
}

/** Aplana un valor JSON a pares campo/valor (para mostrar los datos adicionales). */
export function flattenAudit(value: AuditJson | null | undefined): [string, AuditJson][] {
  const out = new Map<string, AuditJson>();
  flatten(value ?? undefined, '', out, 0);
  return [...out].map(([field, child]) => [field === '' ? '(valor)' : field, child]);
}

/**
 * Compara antes y después campo por campo. Devuelve una fila por campo presente en cualquiera de
 * los dos lados (primero los que cambian, luego los que no), conservando el orden de aparición.
 * Un lado ausente (`null`/`undefined`, p. ej. una creación) deja ese lado sin valor.
 */
export function diffAudit(
  before: AuditJson | null | undefined,
  after: AuditJson | null | undefined,
): DiffRow[] {
  const left = new Map<string, AuditJson>();
  const right = new Map<string, AuditJson>();
  flatten(before ?? undefined, '', left, 0);
  flatten(after ?? undefined, '', right, 0);

  const fields = [...new Set([...left.keys(), ...right.keys()])];
  const rows = fields.map((field): DiffRow => {
    const a = left.get(field);
    const b = right.get(field);
    return {
      field: field === '' ? '(valor)' : field,
      before: a,
      after: b,
      changed: JSON.stringify(a) !== JSON.stringify(b),
    };
  });
  return [...rows.filter((row) => row.changed), ...rows.filter((row) => !row.changed)];
}

/** Texto legible de un valor para la tabla de diferencias (no es HTML: React lo escapa). */
export function formatAuditValue(value: AuditJson | undefined): string {
  if (value === undefined) return '—';
  if (value === null) return 'vacío';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'string') return value === '' ? '(texto vacío)' : value;
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}
