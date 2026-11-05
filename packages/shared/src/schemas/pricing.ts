import { z } from 'zod';

/** Precio de venta neto en Bs, hasta 2 decimales (D7). Cero es válido: «Sin precio» (D9). */
export const salePriceSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/, 'Precio inválido');

export const PRICE_CHANGE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export const priceChangeStatusSchema = z.enum(PRICE_CHANGE_STATUSES);
export type PriceChangeStatus = z.infer<typeof priceChangeStatusSchema>;
export const PRICE_CHANGE_STATUS_LABELS: Record<PriceChangeStatus, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  CANCELLED: 'Cancelado',
};

export const PRICE_CHANGE_ORIGINS = ['REQUEST', 'ADMIN_DIRECT', 'INITIAL'] as const;
export const priceChangeOriginSchema = z.enum(PRICE_CHANGE_ORIGINS);
export type PriceChangeOrigin = z.infer<typeof priceChangeOriginSchema>;
export const PRICE_CHANGE_ORIGIN_LABELS: Record<PriceChangeOrigin, string> = {
  REQUEST: 'Solicitud',
  ADMIN_DIRECT: 'Cambio directo del Administrador',
  INITIAL: 'Precio inicial',
};

/** Máximo de elementos por operación en lote (solicitar, aplicar, aprobar, rechazar). */
export const PRICING_BATCH_MAX = 200;

const optionalReason = z
  .string()
  .trim()
  .max(500)
  .transform((value) => value || null)
  .nullable()
  .optional();

const priceItems = z
  .array(z.object({ variantId: z.uuid(), newPrice: salePriceSchema }))
  .min(1, 'Indique al menos un cambio')
  .max(PRICING_BATCH_MAX)
  .refine(
    (items) => new Set(items.map((item) => item.variantId)).size === items.length,
    'No repita variantes',
  );

/** Solicitar (prices:propose) o aplicar directamente (prices:approve) uno o varios precios. */
export const priceChangesInputSchema = z.object({
  items: priceItems,
  reason: optionalReason,
});

const ids = z
  .array(z.uuid())
  .min(1, 'Seleccione al menos una solicitud')
  .max(PRICING_BATCH_MAX)
  .refine((values) => new Set(values).size === values.length, 'No repita solicitudes');

export const approvePriceChangesSchema = z.object({ ids });
export const rejectPriceChangesSchema = z.object({
  ids,
  /** Obligatorio: el solicitante debe saber por qué se rechazó. */
  comment: z.string().trim().min(3, 'Indique el motivo del rechazo').max(500),
});

const queryBoolean = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const pricingVariantsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  /** Busca por SKU, código de barras, nombre del producto o etiqueta de la variante. */
  q: z.string().trim().max(100).default(''),
  categoryId: z.uuid().optional(),
  /** Solo variantes con precio 0. */
  noPrice: queryBoolean,
  /** Solo variantes con una solicitud pendiente. */
  withPending: queryBoolean,
});
export type PricingVariantsQuery = z.infer<typeof pricingVariantsQuerySchema>;

export const priceChangesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: priceChangeStatusSchema.optional(),
  q: z.string().trim().max(100).default(''),
  variantId: z.uuid().optional(),
});
export type PriceChangesQuery = z.infer<typeof priceChangesQuerySchema>;

export const pricingMetaSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});

/** Panel de costos (Q-04/Q-06). Solo con `costs:read`; sin él, `costs` es `null`. */
export const pricingCostsSchema = z.object({
  /** Precio de compra unitario del último ingreso confirmado, en Bs. */
  purchaseUnitCost: z.string().nullable(),
  purchaseQty: z.number().nullable(),
  /** Cantidad × precio de compra del último ingreso, en Bs. */
  purchaseSubtotal: z.string().nullable(),
  /** Costos adicionales asignados por pieza (último ingreso), en Bs. */
  extraUnitCost: z.string().nullable(),
  /** Costo total unitario vigente (`product_variants.cost_price`), en Bs. */
  totalUnitCost: z.string(),
  lastEntryId: z.uuid().nullable(),
  lastEntryNumber: z.number().nullable(),
  lastEntryAt: z.string().nullable(),
});

export const pricingVariantSchema = z.object({
  variantId: z.uuid(),
  sku: z.string(),
  barcode: z.string().nullable(),
  productId: z.uuid(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
  categoryId: z.uuid(),
  categoryName: z.string(),
  /** Precio de venta neto vigente, en Bs con 2 decimales. */
  salePrice: z.string(),
  /** Solo con `inventory:read`. */
  stockQuantity: z.number().nullable(),
  costs: pricingCostsSchema.nullable(),
  pending: z
    .object({
      id: z.uuid(),
      newPrice: z.string(),
      requestedByName: z.string(),
      createdAt: z.string(),
      reason: z.string().nullable(),
    })
    .nullable(),
});
export type PricingVariant = z.infer<typeof pricingVariantSchema>;

export const priceChangeSchema = z.object({
  id: z.uuid(),
  variantId: z.uuid(),
  sku: z.string(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
  previousPrice: z.string(),
  newPrice: z.string(),
  status: priceChangeStatusSchema,
  origin: priceChangeOriginSchema,
  requestedBy: z.object({ id: z.uuid(), name: z.string() }),
  decidedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  reason: z.string().nullable(),
  decisionComment: z.string().nullable(),
  /** Costo total unitario al registrar el cambio. `null` sin `costs:read`. */
  costSnapshot: z.string().nullable(),
  batchId: z.uuid().nullable(),
});
export type PriceChange = z.infer<typeof priceChangeSchema>;

export type PriceChangesInput = z.infer<typeof priceChangesInputSchema>;
export type ApprovePriceChangesInput = z.infer<typeof approvePriceChangesSchema>;
export type RejectPriceChangesInput = z.infer<typeof rejectPriceChangesSchema>;
