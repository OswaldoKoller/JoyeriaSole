/**
 * Fechas del negocio. La tienda opera en Bolivia (UTC-4, sin horario de verano): «hoy» se calcula
 * siempre en America/La_Paz, no en la zona del servidor ni del navegador.
 */
export const BUSINESS_TIME_ZONE = 'America/La_Paz';

/** La fecha del documento puede ir hasta 30 días hacia atrás (C6). */
export const DOCUMENT_DATE_MAX_AGE_DAYS = 30;

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Fecha de hoy en La Paz, «AAAA-MM-DD». */
export function todayInLaPaz(now: Date = new Date()): string {
  return formatter.format(now);
}

/** Desfase fijo de La Paz respecto de UTC: Bolivia no tiene horario de verano. */
const LA_PAZ_UTC_OFFSET = '-04:00';

/**
 * Instantes (UTC) de inicio y fin INCLUSIVE de un día calendario de La Paz, «AAAA-MM-DD».
 * 20:00 del día 5 en La Paz son las 00:00 UTC del día 6 y siguen siendo del día 5.
 */
export function dayRangeLaPaz(day: string): { start: Date; end: Date } {
  return {
    start: new Date(`${day}T00:00:00.000${LA_PAZ_UTC_OFFSET}`),
    end: new Date(`${day}T23:59:59.999${LA_PAZ_UTC_OFFSET}`),
  };
}

function shiftDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** Rango permitido para la fecha del documento: [hoy − 30 días, hoy], en La Paz. */
export function documentDateBounds(now: Date = new Date()): { min: string; max: string } {
  const max = todayInLaPaz(now);
  return { min: shiftDays(max, -DOCUMENT_DATE_MAX_AGE_DAYS), max };
}

/** Devuelve el motivo por el que la fecha no es válida, o null si lo es (C6). */
export function checkDocumentDate(
  date: string,
  now: Date = new Date(),
): 'FUTURE' | 'TOO_OLD' | null {
  const { min, max } = documentDateBounds(now);
  if (date > max) return 'FUTURE';
  if (date < min) return 'TOO_OLD';
  return null;
}
