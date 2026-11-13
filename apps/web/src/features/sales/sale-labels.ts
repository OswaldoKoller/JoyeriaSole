import { formatIncidentNumber, type PaymentMethodCode, type SaleIncident } from '@joyeria/shared';

/** Textos de interfaz de ventas e incidencias. */

export const METHOD_NAMES: Record<PaymentMethodCode, string> = {
  CASH: 'Efectivo',
  QR: 'QR',
  BANK_TRANSFER: 'Transferencia',
};

export const INCIDENT_KIND_LABELS: Record<SaleIncident['kind'], string> = {
  WRONG_SALE: 'Venta equivocada (pieza o cantidad)',
  WRONG_PAYMENT: 'Cobro mal registrado (medio o importe)',
  DUPLICATE: 'Venta registrada dos veces',
  OTHER: 'Otro',
};

export const INCIDENT_STATUS_LABELS: Record<SaleIncident['status'], string> = {
  OPEN: 'Abierta',
  CLOSED: 'Cerrada',
};

/** Texto fijo de las incidencias (C5, D-10): son solo trazabilidad. */
export const INCIDENT_NO_EFFECT_NOTICE = 'La incidencia no modifica la venta, el stock ni la caja.';

/**
 * Número de venta escrito por la persona: «VTA-000123», «vta 123» o «123» → 123. `null` si no
 * contiene un número válido.
 */
export function parseSaleNumber(text: string): number | null {
  const digits = /^\s*(?:vta[\s-]*)?0*(\d{1,9})\s*$/i.exec(text)?.[1];
  if (!digits) return null;
  const value = Number(digits);
  return value >= 1 ? value : null;
}

/** Mensaje de confirmación tras reportar una incidencia. */
export function reportedMessage(incident: SaleIncident): string {
  return `Incidencia ${formatIncidentNumber(incident.number)} registrada. El Administrador la revisará. ${INCIDENT_NO_EFFECT_NOTICE}`;
}
