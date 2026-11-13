import { z } from 'zod';
import {
  CASH_CLOSE_NOTES_MAX_LENGTH,
  CASH_CORRECTION_REASON_MAX_LENGTH,
  CASH_CORRECTION_REASON_MIN_LENGTH,
  PAYMENT_METHOD_CODES,
} from '../sales.ts';
import {
  moneyInputSchema,
  moneyOutputSchema,
  optionalText,
  pageQueryShape,
  userRefSchema,
} from './money.ts';

/**
 * Caja única (E3, plan 11 §4.4; ADR-023). Esquemas ESTRICTOS: una clave no prevista es un 400.
 * No existen reapertura, gastos, retiros ni movimientos de caja (B6, B7).
 */

export const CASH_SESSION_STATUSES = ['OPEN', 'CLOSED'] as const;
export type CashSessionStatus = (typeof CASH_SESSION_STATUSES)[number];

/** C2 · Apertura: fondo inicial obligatorio en campo libre; «0» explícito es válido (D-05). */
export const openCashSessionSchema = z.strictObject({
  openingAmount: moneyInputSchema,
});

/**
 * C6 · Cierre: el cliente envía SOLO el contado y la observación; el esperado lo calcula el servidor
 * (por eso `expectedCash` es una clave no admitida → 400).
 */
export const closeCashSessionSchema = z.strictObject({
  countedCash: moneyInputSchema,
  notes: optionalText(
    CASH_CLOSE_NOTES_MAX_LENGTH,
    `La observación admite hasta ${CASH_CLOSE_NOTES_MAX_LENGTH} caracteres`,
  ),
});

const correctionReason = z
  .string({ error: 'Indique el motivo de la corrección' })
  .trim()
  .min(
    CASH_CORRECTION_REASON_MIN_LENGTH,
    `El motivo debe tener al menos ${CASH_CORRECTION_REASON_MIN_LENGTH} caracteres`,
  )
  .max(
    CASH_CORRECTION_REASON_MAX_LENGTH,
    `El motivo admite hasta ${CASH_CORRECTION_REASON_MAX_LENGTH} caracteres`,
  );

/**
 * C7 · Corrección de un cierre (append-only, solo `cash:correct`). Lista cerrada de tipos (AE-1).
 * `NOTE` no lleva valores; `COUNTED_CASH` y `OPENING_AMOUNT` llevan el valor anterior visto por el
 * usuario (control de concurrencia) y el nuevo. Claves como `saleId`, `paymentId`, `methodId`,
 * `expectedCash` o `cashSalesTotal` se rechazan (AE-3).
 */
export const createCashCorrectionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('NOTE'), reason: correctionReason }),
  z.strictObject({
    kind: z.enum(['COUNTED_CASH', 'OPENING_AMOUNT']),
    expectedPreviousValue: moneyInputSchema,
    newValue: moneyInputSchema,
    reason: correctionReason,
  }),
]);

export const cashSessionListQuerySchema = z.strictObject({
  ...pageQueryShape,
  status: z.enum(['all', ...CASH_SESSION_STATUSES]).default('all'),
  /** Día de apertura (calendario de La Paz), ambos extremos incluidos. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export const cashSessionIdParamsSchema = z.strictObject({ id: z.uuid() });

/** C1 · Estado visible para quien vende: sin cifras. */
export const cashStatusSchema = z.strictObject({
  open: z.boolean(),
  session: z
    .strictObject({
      id: z.uuid(),
      number: z.number().int(),
      openedAt: z.string(),
      openedByName: z.string(),
    })
    .nullable(),
});

/** Cifras vigentes (tras correcciones). En una sesión abierta, contado y diferencia son `null`. */
export const currentCashFiguresSchema = z.strictObject({
  openingAmount: moneyOutputSchema,
  expectedCash: moneyOutputSchema,
  countedCash: moneyOutputSchema.nullable(),
  difference: moneyOutputSchema.nullable(),
});

export const cashMethodTotalSchema = z.strictObject({
  methodCode: z.enum(PAYMENT_METHOD_CODES),
  methodName: z.string(),
  /** Solo el efectivo entra al arqueo; QR y transferencia se informan aparte (B8). */
  isCash: z.boolean(),
  amount: moneyOutputSchema,
  paymentsCount: z.number().int(),
});

export const cashSessionDetailSchema = z.strictObject({
  id: z.uuid(),
  number: z.number().int(),
  status: z.enum(CASH_SESSION_STATUSES),
  openedAt: z.string(),
  openedBy: userRefSchema,
  /** Cifras ORIGINALES (inmutables). Las del cierre son `null` mientras la sesión está abierta. */
  openingAmount: moneyOutputSchema,
  closedAt: z.string().nullable(),
  closedBy: userRefSchema.nullable(),
  cashSalesTotal: moneyOutputSchema.nullable(),
  expectedCash: moneyOutputSchema.nullable(),
  countedCash: moneyOutputSchema.nullable(),
  difference: moneyOutputSchema.nullable(),
  notes: z.string().nullable(),
  /** Solo en una sesión abierta: fondo + cobros en efectivo hasta ahora. */
  liveExpectedCash: moneyOutputSchema.nullable(),
  totalsByMethod: z.array(cashMethodTotalSchema),
  salesCount: z.number().int(),
  salesTotal: moneyOutputSchema,
  /** Ventas pagadas con más de un medio. */
  mixedSales: z.strictObject({ count: z.number().int(), amount: moneyOutputSchema }),
  /** Cifras vigentes tras las correcciones (iguales a las originales si no hay ninguna). */
  current: currentCashFiguresSchema,
  corrections: z.strictObject({ count: z.number().int(), lastAt: z.string().nullable() }),
});

export const cashSessionSummarySchema = z.strictObject({
  id: z.uuid(),
  number: z.number().int(),
  status: z.enum(CASH_SESSION_STATUSES),
  openedAt: z.string(),
  openedByName: z.string(),
  closedAt: z.string().nullable(),
  closedByName: z.string().nullable(),
  openingAmount: moneyOutputSchema,
  expectedCash: moneyOutputSchema.nullable(),
  countedCash: moneyOutputSchema.nullable(),
  difference: moneyOutputSchema.nullable(),
  salesCount: z.number().int(),
  salesTotal: moneyOutputSchema,
  /** Cifras vigentes; la marca «Corregida (N)» usa `correctionsCount`. */
  current: currentCashFiguresSchema,
  correctionsCount: z.number().int(),
});

export const cashCorrectionSchema = z.strictObject({
  id: z.uuid(),
  sequence: z.number().int(),
  kind: z.enum(['COUNTED_CASH', 'OPENING_AMOUNT', 'NOTE']),
  previousValue: moneyOutputSchema.nullable(),
  newValue: moneyOutputSchema.nullable(),
  expectedCashAfter: moneyOutputSchema,
  countedCashAfter: moneyOutputSchema,
  differenceAfter: moneyOutputSchema,
  reason: z.string(),
  correctedBy: userRefSchema,
  correctedAt: z.string(),
});

export const cashCorrectionResultSchema = z.strictObject({
  correction: cashCorrectionSchema,
  session: cashSessionDetailSchema,
});

export type OpenCashSessionInput = z.infer<typeof openCashSessionSchema>;
export type CloseCashSessionInput = z.infer<typeof closeCashSessionSchema>;
export type CreateCashCorrectionInput = z.infer<typeof createCashCorrectionSchema>;
export type CashSessionListQuery = z.infer<typeof cashSessionListQuerySchema>;
export type CashStatus = z.infer<typeof cashStatusSchema>;
export type CashSessionDetail = z.infer<typeof cashSessionDetailSchema>;
export type CashSessionSummary = z.infer<typeof cashSessionSummarySchema>;
export type CashCorrection = z.infer<typeof cashCorrectionSchema>;
export type CashCorrectionResult = z.infer<typeof cashCorrectionResultSchema>;
