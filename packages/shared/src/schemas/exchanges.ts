import { z } from 'zod';

/**
 * Cambios de pieza (ADR-019, Q-12 A / 12.1 A; C9: solo cambios, no existen devoluciones).
 * Un cambio mueve DOS variantes en una sola operación atómica: la pieza devuelta por el cliente
 * entra al stock vendible (`EXCHANGE_IN`) y la entregada en su lugar sale (`EXCHANGE_OUT`).
 */

/** Piezas máximas por lado: evita errores de tipeo y desbordes del saldo (columna entera). */
export const MAX_EXCHANGE_QUANTITY = 1_000_000;

/** Etiquetas en español de TODOS los tipos de movimiento del libro, para historial y kardex. */
export const MOVEMENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  INITIAL_STOCK: 'Stock inicial',
  STOCK_ENTRY: 'Ingreso',
  ADJUSTMENT: 'Ajuste',
  COUNT_ADJUSTMENT: 'Conteo',
  LOSS: 'Pérdida',
  SALE: 'Venta',
  CUSTOMER_RETURN: 'Devolución de cliente',
  EXCHANGE: 'Cambio',
  EXCHANGE_IN: 'Cambio: entrada de pieza devuelta',
  EXCHANGE_OUT: 'Cambio: salida de pieza entregada',
};

/** Etiqueta de un tipo de movimiento; si no se conoce, devuelve el código tal cual. */
export const movementTypeLabel = (type: string): string => MOVEMENT_TYPE_LABELS[type] ?? type;

const piece = z.object({
  variantId: z.uuid(),
  quantity: z
    .number()
    .int('Indique piezas enteras')
    .min(1, 'La cantidad debe ser mayor que cero')
    .max(MAX_EXCHANGE_QUANTITY),
});

const optionalNotes = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => value || null)
  .nullable()
  .optional();

export const createExchangeSchema = z.object({
  /** Pieza que el cliente devuelve: vuelve al stock vendible (12.1 A). */
  returned: piece,
  /** Pieza que se entrega en su lugar: sale del stock. */
  delivered: piece,
  /** Motivo obligatorio del cambio. */
  reason: z.string().trim().min(1, 'Indique el motivo del cambio').max(200),
  notes: optionalNotes,
});

export const exchangeLineSchema = z.object({
  movementId: z.string(),
  movementType: z.enum(['EXCHANGE_IN', 'EXCHANGE_OUT']),
  variantId: z.uuid(),
  sku: z.string(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
  /** Con signo: positivo en la pieza devuelta, negativo en la entregada. */
  quantity: z.number(),
  balanceBefore: z.number(),
  balanceAfter: z.number(),
  /** Costo unitario vigente de la variante; `null` sin el permiso de costos. */
  unitCost: z.string().nullable(),
});

export const exchangeAuditSchema = z.object({
  action: z.string(),
  userId: z.uuid().nullable(),
  createdAt: z.string(),
  after: z.record(z.string(), z.unknown()).nullable(),
});

export const exchangeSchema = z.object({
  referenceId: z.uuid(),
  reason: z.string(),
  notes: z.string().nullable(),
  userId: z.uuid(),
  createdAt: z.string(),
  returned: exchangeLineSchema,
  delivered: exchangeLineSchema,
  /** Registro de auditoría del cambio; `null` sin permiso para verlo. */
  audit: exchangeAuditSchema.nullable(),
});

export type CreateExchangeInput = z.infer<typeof createExchangeSchema>;
export type ExchangeLine = z.infer<typeof exchangeLineSchema>;
export type Exchange = z.infer<typeof exchangeSchema>;
