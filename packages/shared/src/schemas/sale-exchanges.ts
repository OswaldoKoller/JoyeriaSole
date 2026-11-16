import { z } from 'zod';
import {
  EXCHANGE_NOTE_MAX_LENGTH,
  INT32_MAX,
  SALE_MAX_PAYMENTS,
  SALE_MAX_QUANTITY,
} from '../sales.ts';
import {
  moneyOutputSchema,
  optionalText,
  pageMetaSchema,
  pageQueryShape,
  positiveMoneyInputSchema,
} from './money.ts';
import {
  businessInfoSchema,
  checkPaymentFields,
  salePaymentInputSchema,
  salePaymentSchema,
} from './sales.ts';

/**
 * Cambio de pieza de una venta (ADR-026). Política de la tienda (asesor legal, 2026-11-14): NO hay
 * devoluciones; solo se cambia una pieza por OTRA de igual o mayor precio, con el comprobante de la
 * venta, sin plazo. La diferencia de precio se cobra en la caja abierta; nunca se cambia por una
 * pieza más económica. El cambio es un documento aparte: la venta original no se modifica (DEC-V07).
 * Ninguna respuesta contiene costos.
 */

export const createSaleExchangeSchema = z
  .strictObject({
    saleId: z.uuid(),
    /** Pieza devuelta: una línea de la venta… */
    sourceItemId: z.uuid().optional(),
    /** …o la pieza entregada en un cambio anterior de la misma venta. Exactamente una. */
    sourceExchangeId: z.uuid().optional(),
    deliveredVariantId: z.uuid(),
    /** Unidades que se cambian (misma cantidad devuelta y entregada). */
    quantity: z
      .number()
      .int('La cantidad debe ser un número entero')
      .min(1, 'La cantidad mínima es 1')
      .max(SALE_MAX_QUANTITY, `La cantidad máxima es ${SALE_MAX_QUANTITY}`),
    /** Precio unitario de la pieza entregada que vio el vendedor; si cambió, `409 PRICE_CHANGED`. */
    expectedDeliveredUnitPrice: positiveMoneyInputSchema,
    /** Cobro de la diferencia: vacío si no hay diferencia. */
    payments: z
      .array(salePaymentInputSchema)
      .max(SALE_MAX_PAYMENTS, `Un cambio admite hasta ${SALE_MAX_PAYMENTS} pagos`)
      .refine(
        (payments) =>
          new Set(payments.map((payment) => payment.methodCode)).size === payments.length,
        'Use un solo pago por medio',
      ),
    note: optionalText(
      EXCHANGE_NOTE_MAX_LENGTH,
      `La observación admite hasta ${EXCHANGE_NOTE_MAX_LENGTH} caracteres`,
    ),
  })
  .superRefine((value, ctx) => {
    if ((value.sourceItemId === undefined) === (value.sourceExchangeId === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceItemId'],
        message: 'Indique la pieza que se devuelve',
      });
    }
    checkPaymentFields(value.payments, ctx);
  });

export const saleExchangeLookupQuerySchema = z.strictObject({
  /** Número de la venta (el que lleva el comprobante, sin el prefijo VTA-). */
  number: z.coerce.number().int().min(1).max(INT32_MAX),
});

export const saleExchangeIdParamsSchema = z.strictObject({ id: z.uuid() });

export const saleExchangeListQuerySchema = z.strictObject({
  ...pageQueryShape,
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  number: z.coerce.number().int().min(1).max(INT32_MAX).optional(),
  saleId: z.uuid().optional(),
  cashSessionId: z.uuid().optional(),
});

/** Lo que el cliente conserva de la venta y todavía se puede cambiar. */
export const exchangeHoldingSchema = z.strictObject({
  /** De dónde sale: una línea de la venta o la pieza entregada en un cambio anterior. */
  origin: z.enum(['SALE', 'EXCHANGE']),
  sourceItemId: z.uuid().nullable(),
  sourceExchangeId: z.uuid().nullable(),
  /** Número (CMB-) del cambio de origen, solo si `origin = EXCHANGE`. */
  exchangeNumber: z.number().int().nullable(),
  variantId: z.uuid(),
  sku: z.string(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
  /** Unidades que aún se pueden cambiar. */
  remaining: z.number().int(),
  /** Lo que el cliente pagó por cada unidad: la pieza nueva nunca puede costar menos. */
  creditUnitPrice: moneyOutputSchema,
});

export const saleExchangeLookupSchema = z.strictObject({
  saleId: z.uuid(),
  number: z.number().int(),
  soldAt: z.string(),
  holdings: z.array(exchangeHoldingSchema),
});

const exchangePieceSchema = z.strictObject({
  variantId: z.uuid(),
  sku: z.string(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
});

export const saleExchangeSummarySchema = z.strictObject({
  id: z.uuid(),
  number: z.number().int(),
  saleId: z.uuid(),
  saleNumber: z.number().int(),
  createdAt: z.string(),
  sellerId: z.uuid(),
  sellerName: z.string(),
  cashSessionId: z.uuid(),
  cashSessionNumber: z.number().int(),
  returned: exchangePieceSchema,
  delivered: exchangePieceSchema,
  quantity: z.number().int(),
  creditUnitPrice: moneyOutputSchema,
  deliveredUnitPrice: moneyOutputSchema,
  /** Lo cobrado por la diferencia (0.00 si ambas piezas valen lo mismo). */
  difference: moneyOutputSchema,
});

export const saleExchangeDetailSchema = saleExchangeSummarySchema.extend({
  payments: z.array(salePaymentSchema),
  /** Vuelto total entregado (Σ vuelto de los pagos en efectivo). */
  changeGiven: moneyOutputSchema,
  note: z.string().nullable(),
});

/** Comprobante del cambio: proyección de filas inmutables, sin costos ni referencias de pago. */
export const saleExchangeReceiptSchema = z.strictObject({
  exchangeId: z.uuid(),
  number: z.number().int(),
  saleNumber: z.number().int(),
  createdAt: z.string(),
  currency: z.literal('BOB'),
  returned: exchangePieceSchema,
  delivered: exchangePieceSchema,
  quantity: z.number().int(),
  creditUnitPrice: moneyOutputSchema,
  deliveredUnitPrice: moneyOutputSchema,
  difference: moneyOutputSchema,
  payments: z.array(
    z.strictObject({
      methodName: z.string(),
      amount: moneyOutputSchema,
      tendered: moneyOutputSchema.nullable(),
      changeGiven: moneyOutputSchema.nullable(),
    }),
  ),
  seller: z.strictObject({ name: z.string() }).nullable(),
  business: businessInfoSchema,
});

export const saleExchangeListSchema = z.strictObject({
  data: z.array(saleExchangeSummarySchema),
  meta: pageMetaSchema,
});

export type CreateSaleExchangeInput = z.infer<typeof createSaleExchangeSchema>;
export type SaleExchangeListQuery = z.infer<typeof saleExchangeListQuerySchema>;
export type ExchangeHolding = z.infer<typeof exchangeHoldingSchema>;
export type SaleExchangeLookup = z.infer<typeof saleExchangeLookupSchema>;
export type SaleExchangeSummary = z.infer<typeof saleExchangeSummarySchema>;
export type SaleExchangeDetail = z.infer<typeof saleExchangeDetailSchema>;
export type SaleExchangeReceipt = z.infer<typeof saleExchangeReceiptSchema>;
