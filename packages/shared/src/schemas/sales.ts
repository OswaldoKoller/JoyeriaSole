import { z } from 'zod';
import {
  INT32_MAX,
  PAYMENT_METHOD_CODES,
  PAYMENT_REFERENCE_MAX_LENGTH,
  RECEIPT_FORMATS,
  SALE_MAX_ITEMS,
  SALE_MAX_PAYMENTS,
  SALE_MAX_QUANTITY,
} from '../sales.ts';
import {
  moneyInputSchema,
  moneyOutputSchema,
  pageQueryShape,
  positiveMoneyInputSchema,
} from './money.ts';

/**
 * Venta de mostrador (E1, plan 11 §4.5; ADR-022). Esquemas ESTRICTOS. Ninguna respuesta de ventas
 * contiene costos, para ningún rol (R-25). Una venta confirmada no se anula ni se modifica
 * (DEC-V07): no hay esquemas de edición ni de reversión.
 */

export const saleItemInputSchema = z.strictObject({
  variantId: z.uuid(),
  quantity: z
    .number()
    .int('La cantidad debe ser un número entero')
    .min(1, 'La cantidad mínima es 1')
    .max(SALE_MAX_QUANTITY, `La cantidad máxima por línea es ${SALE_MAX_QUANTITY}`),
  /** Precio unitario que vio el vendedor; si ya no es el vigente, `409 PRICE_CHANGED`. */
  expectedUnitPrice: positiveMoneyInputSchema,
});

export const salePaymentInputSchema = z.strictObject({
  methodCode: z.enum(PAYMENT_METHOD_CODES),
  /** Importe aplicado a la venta (neto de vuelto). */
  amount: positiveMoneyInputSchema,
  /** Efectivo recibido: obligatorio en efectivo y prohibido en QR y transferencia. */
  tendered: moneyInputSchema.optional(),
  /** D-09: referencia opcional de QR o transferencia (no se imprime); prohibida en efectivo. */
  reference: z
    .string()
    .trim()
    .min(1, 'La referencia no puede estar vacía')
    .max(
      PAYMENT_REFERENCE_MAX_LENGTH,
      `La referencia admite hasta ${PAYMENT_REFERENCE_MAX_LENGTH} caracteres`,
    )
    .optional(),
});

export const createSaleSchema = z
  .strictObject({
    items: z
      .array(saleItemInputSchema)
      .min(1, 'Agregue al menos una pieza')
      .max(SALE_MAX_ITEMS, `Una venta admite hasta ${SALE_MAX_ITEMS} líneas`)
      .refine(
        (items) => new Set(items.map((item) => item.variantId)).size === items.length,
        'No repita la misma variante: cambie la cantidad de la línea',
      ),
    payments: z
      .array(salePaymentInputSchema)
      .min(1, 'Indique al menos un pago')
      .max(SALE_MAX_PAYMENTS, `Una venta admite hasta ${SALE_MAX_PAYMENTS} pagos`)
      .refine(
        (payments) =>
          new Set(payments.map((payment) => payment.methodCode)).size === payments.length,
        'Use un solo pago por medio',
      ),
    /** Total que vio el vendedor en la revisión previa. */
    expectedTotal: positiveMoneyInputSchema,
  })
  .superRefine((value, ctx) => {
    value.payments.forEach((payment, index) => {
      const isCash = payment.methodCode === 'CASH';
      if (isCash && payment.tendered === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['payments', index, 'tendered'],
          message: 'Indique el efectivo recibido',
        });
      }
      if (!isCash && payment.tendered !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['payments', index, 'tendered'],
          message: 'El efectivo recibido solo corresponde a pagos en efectivo',
        });
      }
      if (isCash && payment.reference !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['payments', index, 'reference'],
          message: 'La referencia solo corresponde a QR o transferencia',
        });
      }
    });
  });

export const saleListQuerySchema = z.strictObject({
  ...pageQueryShape,
  /** Día de venta (calendario de La Paz), ambos extremos incluidos. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  number: z.coerce.number().int().min(1).max(INT32_MAX).optional(),
  /** Solo con `sales:read-all`; sin ese permiso siempre se filtran las ventas propias. */
  sellerId: z.uuid().optional(),
  cashSessionId: z.uuid().optional(),
  methodCode: z.enum(PAYMENT_METHOD_CODES).optional(),
});

export const saleIdParamsSchema = z.strictObject({ id: z.uuid() });

export const receiptPrintInputSchema = z.strictObject({
  format: z.enum(RECEIPT_FORMATS),
});

export const paymentMethodSchema = z.strictObject({
  code: z.enum(PAYMENT_METHOD_CODES),
  name: z.string(),
  isCash: z.boolean(),
});

export const saleSummarySchema = z.strictObject({
  id: z.uuid(),
  number: z.number().int(),
  soldAt: z.string(),
  sellerId: z.uuid(),
  sellerName: z.string(),
  total: moneyOutputSchema,
  itemsCount: z.number().int(),
  paymentMethods: z.array(z.enum(PAYMENT_METHOD_CODES)),
  cashSessionId: z.uuid(),
  cashSessionNumber: z.number().int(),
});

export const saleItemSchema = z.strictObject({
  variantId: z.uuid(),
  sku: z.string(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
  quantity: z.number().int(),
  unitPrice: moneyOutputSchema,
  lineTotal: moneyOutputSchema,
});

export const salePaymentSchema = z.strictObject({
  methodCode: z.enum(PAYMENT_METHOD_CODES),
  methodName: z.string(),
  amount: moneyOutputSchema,
  tendered: moneyOutputSchema.nullable(),
  changeGiven: moneyOutputSchema.nullable(),
  reference: z.string().nullable(),
});

export const saleDetailSchema = saleSummarySchema.extend({
  items: z.array(saleItemSchema),
  payments: z.array(salePaymentSchema),
  /** Vuelto total entregado (Σ vuelto de los pagos en efectivo). */
  changeGiven: moneyOutputSchema,
  /** Impresiones registradas del comprobante (la primera es el original). */
  receiptPrints: z.number().int(),
});

export const businessInfoSchema = z.strictObject({
  tradeName: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  taxId: z.string().nullable(),
});

/**
 * Comprobante interno (DEC-V12): proyección de filas inmutables. Sin costos y sin referencia de
 * pago (D-09). El encabezado del negocio es el VIGENTE (D-08). `seller` solo si la configuración lo
 * indica (D-04).
 */
export const saleReceiptSchema = z.strictObject({
  saleId: z.uuid(),
  number: z.number().int(),
  soldAt: z.string(),
  currency: z.literal('BOB'),
  items: z.array(
    z.strictObject({
      sku: z.string(),
      productName: z.string(),
      variantLabel: z.string().nullable(),
      quantity: z.number().int(),
      unitPrice: moneyOutputSchema,
      lineTotal: moneyOutputSchema,
    }),
  ),
  total: moneyOutputSchema,
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
  /** Impresiones ya registradas: si es ≥ 1, la próxima será una copia. */
  printCount: z.number().int(),
});

export const receiptPrintEventSchema = z.strictObject({
  copyNumber: z.number().int(),
  isCopy: z.boolean(),
  printedAt: z.string(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type SaleListQuery = z.infer<typeof saleListQuerySchema>;
export type ReceiptPrintInput = z.infer<typeof receiptPrintInputSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type SaleSummary = z.infer<typeof saleSummarySchema>;
export type SaleDetail = z.infer<typeof saleDetailSchema>;
export type SaleReceipt = z.infer<typeof saleReceiptSchema>;
export type ReceiptPrintEvent = z.infer<typeof receiptPrintEventSchema>;
