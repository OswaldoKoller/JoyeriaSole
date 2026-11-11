import { z } from 'zod';
import { SALE_INCIDENT_TEXT_MAX_LENGTH, SALE_INCIDENT_TEXT_MIN_LENGTH } from '../sales.ts';
import { pageQueryShape, userRefSchema } from './money.ts';

/**
 * Incidencias de venta (C5, C6; D-10 y D-11 POR DEFECTO — PENDIENTE DE CONFIRMACIÓN, ver X-1).
 * Son SOLO trazabilidad: no tienen importes, cantidades, variantes, movimientos ni pagos, y ningún
 * módulo las consume para actuar. No modifican la venta, el stock ni la caja. Esquemas ESTRICTOS:
 * claves como `amount`, `quantity`, `variantId` o `refund` se rechazan con 400.
 */

export const SALE_INCIDENT_KINDS = ['WRONG_SALE', 'WRONG_PAYMENT', 'DUPLICATE', 'OTHER'] as const;
export const SALE_INCIDENT_STATUSES = ['OPEN', 'CLOSED'] as const;

const incidentText = (field: string) =>
  z
    .string({ error: `Indique ${field}` })
    .trim()
    .min(
      SALE_INCIDENT_TEXT_MIN_LENGTH,
      `Escriba al menos ${SALE_INCIDENT_TEXT_MIN_LENGTH} caracteres`,
    )
    .max(
      SALE_INCIDENT_TEXT_MAX_LENGTH,
      `Se admiten hasta ${SALE_INCIDENT_TEXT_MAX_LENGTH} caracteres`,
    );

export const createSaleIncidentSchema = z.strictObject({
  kind: z.enum(SALE_INCIDENT_KINDS),
  description: incidentText('la descripción'),
  /** Número de la venta (entero de `VTA-000123`); opcional si no se conoce. */
  saleNumber: z.number().int().min(1).optional(),
});

export const closeSaleIncidentSchema = z.strictObject({
  /** Qué se resolvió FUERA del sistema (la incidencia no cambia nada dentro). */
  resolution: incidentText('la resolución'),
});

export const saleIncidentListQuerySchema = z.strictObject({
  ...pageQueryShape,
  status: z.enum(['all', ...SALE_INCIDENT_STATUSES]).default('all'),
  /** Día de reporte (calendario de La Paz), ambos extremos incluidos. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export const saleIncidentIdParamsSchema = z.strictObject({ id: z.uuid() });

export const saleIncidentSchema = z.strictObject({
  id: z.uuid(),
  number: z.number().int(),
  kind: z.enum(SALE_INCIDENT_KINDS),
  description: z.string(),
  status: z.enum(SALE_INCIDENT_STATUSES),
  sale: z.strictObject({ id: z.uuid(), number: z.number().int() }).nullable(),
  reportedBy: userRefSchema,
  reportedAt: z.string(),
  resolution: z.string().nullable(),
  resolvedBy: userRefSchema.nullable(),
  resolvedAt: z.string().nullable(),
});

export type CreateSaleIncidentInput = z.infer<typeof createSaleIncidentSchema>;
export type CloseSaleIncidentInput = z.infer<typeof closeSaleIncidentSchema>;
export type SaleIncidentListQuery = z.infer<typeof saleIncidentListQuerySchema>;
export type SaleIncident = z.infer<typeof saleIncidentSchema>;
