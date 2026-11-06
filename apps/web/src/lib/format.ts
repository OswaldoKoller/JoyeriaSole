import { BUSINESS_TIME_ZONE } from '@joyeria/shared';

/**
 * Formatos de números, dinero y fechas de la interfaz (es-BO, hora de La Paz). Las instancias de
 * `Intl` se crean una sola vez por módulo: construirlas en cada render es costoso.
 */

type Amount = number | string | null | undefined;
type Instant = Date | string | number | null | undefined;

const DASH = '—';

const bs = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' });
const bsPrecise = new Intl.NumberFormat('es-BO', {
  style: 'currency',
  currency: 'BOB',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const usd = new Intl.NumberFormat('es-BO', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const integer = new Intl.NumberFormat('es-BO');
const ratio = new Intl.NumberFormat('es-BO', { style: 'percent', maximumFractionDigits: 0 });
const percentPoints = new Intl.NumberFormat('es-BO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const date = new Intl.DateTimeFormat('es-BO', { timeZone: BUSINESS_TIME_ZONE, dateStyle: 'short' });
const dateTime = new Intl.DateTimeFormat('es-BO', {
  timeZone: BUSINESS_TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'short',
});
const dateTimeSeconds = new Intl.DateTimeFormat('es-BO', {
  timeZone: BUSINESS_TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'medium',
});
const dateTimeLong = new Intl.DateTimeFormat('es-BO', {
  timeZone: BUSINESS_TIME_ZONE,
  dateStyle: 'long',
  timeStyle: 'medium',
});
const weekdayDate = new Intl.DateTimeFormat('es-BO', {
  timeZone: BUSINESS_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function withAmount(value: Amount, format: (n: number) => string): string {
  return value === null || value === undefined ? DASH : format(Number(value));
}

function withInstant(value: Instant, format: (d: Date) => string): string {
  return value === null || value === undefined || value === '' ? DASH : format(new Date(value));
}

/** Bolivianos con 2 decimales: «Bs 12,50». `null`/`undefined` se muestran como «—». */
export function formatBs(value: Amount): string {
  return withAmount(value, (n) => bs.format(n));
}

/** Bolivianos con 2 a 4 decimales (costos y precios unitarios). */
export function formatBsPrecise(value: Amount): string {
  return withAmount(value, (n) => bsPrecise.format(n));
}

/** Dólares con 2 a 4 decimales. */
export function formatUsd(value: Amount): string {
  return withAmount(value, (n) => usd.format(n));
}

/** Entero/cantidad con separador de miles local. */
export function formatInt(value: number): string {
  return integer.format(value);
}

/** Proporción (0–1) como porcentaje sin decimales: «45 %». */
export function formatRatio(value: number): string {
  return ratio.format(value);
}

/** Valor ya expresado en porcentaje, con 2 decimales: «12,50 %». */
export function formatPercent(value: Amount): string {
  return value === null || value === undefined ? DASH : `${percentPoints.format(Number(value))} %`;
}

/** Fecha corta en hora de La Paz. */
export function formatDate(value: Instant): string {
  return withInstant(value, (d) => date.format(d));
}

/** Fecha y hora cortas en hora de La Paz. */
export function formatDateTime(value: Instant): string {
  return withInstant(value, (d) => dateTime.format(d));
}

/** Fecha corta y hora con segundos (auditoría). */
export function formatDateTimeSeconds(value: Instant): string {
  return withInstant(value, (d) => dateTimeSeconds.format(d));
}

/** Fecha larga y hora con segundos (detalle de auditoría). */
export function formatDateTimeLong(value: Instant): string {
  return withInstant(value, (d) => dateTimeLong.format(d));
}

/** «sábado, 7 de noviembre» (encabezado del Inicio). */
export function formatWeekdayDate(value: Date = new Date()): string {
  return weekdayDate.format(value);
}
