import { z } from 'zod';

/**
 * Ajustes manuales de inventario con solicitud y aprobación (ADR-017, amplía ADR-009).
 * PENDING → APPROVED (único estado que mueve stock) | REJECTED | CANCELLED.
 */
export const ADJUSTMENT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type AdjustmentStatus = (typeof ADJUSTMENT_STATUSES)[number];

/** Código del motivo que obliga a escribir una observación («Otro»). */
export const ADJUSTMENT_REASON_OTHER = 'OTHER';

/**
 * Catálogo inicial de motivos (P-20, reunión 2026-11-05). Lo siembra el seed de forma idempotente;
 * después puede ampliarse desde la base de datos sin tocar el código.
 */
export const DEFAULT_ADJUSTMENT_REASONS: readonly {
  code: string;
  name: string;
  requiresNotes: boolean;
}[] = [
  { code: 'THEFT', name: 'Robo', requiresNotes: false },
  { code: 'LOSS', name: 'Pérdida', requiresNotes: false },
  { code: 'SAMPLE', name: 'Muestra', requiresNotes: false },
  { code: 'BREAKAGE', name: 'Rotura', requiresNotes: false },
  { code: 'REGISTRATION_ERROR', name: 'Error de registro', requiresNotes: false },
  { code: ADJUSTMENT_REASON_OTHER, name: 'Otro', requiresNotes: true },
];

/** Número legible del documento: 7 → «AJ-000007». */
export const adjustmentLabel = (number: number) => `AJ-${number.toString().padStart(6, '0')}`;

/** Piezas máximas por línea: evita errores de tipeo y desbordes del saldo (columna entera). */
export const MAX_ADJUSTMENT_QUANTITY = 1_000_000;

const notes = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => value || null)
  .nullable()
  .optional();

export const adjustmentItemInputSchema = z.object({
  variantId: z.uuid(),
  /** Diferencia con signo: negativa = salida, positiva = entrada. Nunca 0. */
  quantityDelta: z
    .number()
    .int('Indique piezas enteras')
    .min(-MAX_ADJUSTMENT_QUANTITY)
    .max(MAX_ADJUSTMENT_QUANTITY)
    .refine((value) => value !== 0, 'La diferencia no puede ser cero'),
});

export const createAdjustmentSchema = z.object({
  reasonId: z.uuid(),
  /** Obligatoria si el motivo lo exige («Otro»): la valida el servidor contra el catálogo. */
  notes,
  items: z
    .array(adjustmentItemInputSchema)
    .min(1, 'Agregue al menos una variante')
    .max(50)
    .refine(
      (items) => new Set(items.map((item) => item.variantId)).size === items.length,
      'No repita la misma variante en un ajuste',
    ),
});

export const rejectAdjustmentSchema = z.object({
  notes: z.string().trim().min(1, 'Indique el motivo del rechazo').max(2000),
});

export const adjustmentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['all', ...ADJUSTMENT_STATUSES]).default('all'),
  variantId: z.uuid().optional(),
  /** Rango de fechas de solicitud (día calendario, hora de La Paz), ambos extremos incluidos. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export const adjustmentReasonSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  requiresNotes: z.boolean(),
});

export const adjustmentSummarySchema = z.object({
  id: z.uuid(),
  number: z.number(),
  status: z.enum(ADJUSTMENT_STATUSES),
  reasonId: z.uuid(),
  reasonName: z.string(),
  notes: z.string().nullable(),
  requestedById: z.uuid(),
  requestedByName: z.string(),
  createdAt: z.string(),
  resolvedByName: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  itemsCount: z.number(),
  /** Suma de las diferencias de todas las líneas (piezas). */
  netUnits: z.number(),
  /** Valor estimado/real de la diferencia en Bs. Solo con `costs:read`; si no, null. */
  valueImpact: z.string().nullable(),
});

export const adjustmentItemSchema = z.object({
  id: z.uuid(),
  variantId: z.uuid(),
  sku: z.string(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
  quantityDelta: z.number(),
  /** Saldo visto al solicitar (informativo). */
  quantityAtRequest: z.number(),
  /** Saldo actual: solo mientras el ajuste está pendiente (para ver si aún se puede aprobar). */
  currentQuantity: z.number().nullable(),
  /** Cantidad anterior y nueva registradas al aprobar. */
  balanceBefore: z.number().nullable(),
  balanceAfter: z.number().nullable(),
  /** Costo unitario (vigente si está pendiente, el registrado si está aprobado). `costs:read`. */
  unitCost: z.string().nullable(),
  valueImpact: z.string().nullable(),
});

export const adjustmentDetailSchema = adjustmentSummarySchema.extend({
  resolutionNotes: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  items: z.array(adjustmentItemSchema),
  /** Motivos por los que hoy no se puede aprobar (vacío = se puede). Solo si está pendiente. */
  blockers: z.array(z.string()),
});

export type AdjustmentReason = z.infer<typeof adjustmentReasonSchema>;
export type AdjustmentSummary = z.infer<typeof adjustmentSummarySchema>;
export type AdjustmentItem = z.infer<typeof adjustmentItemSchema>;
export type AdjustmentDetail = z.infer<typeof adjustmentDetailSchema>;
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;
export type RejectAdjustmentInput = z.infer<typeof rejectAdjustmentSchema>;
