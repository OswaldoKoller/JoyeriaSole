import type { AuditQueryFilters } from './use-audit.ts';

/** Filtros tal como los edita la persona (fechas en formato AAAA-MM-DD de La Paz). */
export interface AuditFormFilters {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  from: string;
  to: string;
  q: string;
}

export const EMPTY_FILTERS: AuditFormFilters = {
  userId: '',
  action: '',
  entityType: '',
  entityId: '',
  from: '',
  to: '',
  q: '',
};

const FIELDS = Object.keys(EMPTY_FILTERS) as (keyof AuditFormFilters)[];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lee los filtros iniciales de la URL (p. ej. `/auditoria?entityType=Product&entityId=...`). */
export function filtersFromParams(params: URLSearchParams): AuditFormFilters {
  const filters = { ...EMPTY_FILTERS };
  for (const field of FIELDS) filters[field] = (params.get(field) ?? '').trim();
  if (!DATE.test(filters.from)) filters.from = '';
  if (!DATE.test(filters.to)) filters.to = '';
  if (filters.userId && !UUID.test(filters.userId)) filters.userId = '';
  return filters;
}

/** Serializa los filtros no vacíos a parámetros de URL. */
export function filtersToParams(filters: AuditFormFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const field of FIELDS) if (filters[field]) params.set(field, filters[field]);
  return params;
}

// America/La_Paz está en UTC-4 todo el año (sin horario de verano).
const LA_PAZ_OFFSET = '-04:00';

/** Convierte los filtros del formulario en los de la API: el día completo, hora de La Paz. */
export function toQueryFilters(filters: AuditFormFilters): AuditQueryFilters {
  return {
    ...filters,
    from: filters.from ? `${filters.from}T00:00:00.000${LA_PAZ_OFFSET}` : '',
    to: filters.to ? `${filters.to}T23:59:59.999${LA_PAZ_OFFSET}` : '',
  };
}

export function countActiveFilters(filters: AuditFormFilters): number {
  return FIELDS.filter((field) => filters[field] !== '').length;
}
