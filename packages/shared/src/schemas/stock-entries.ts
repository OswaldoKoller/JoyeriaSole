import { z } from 'zod';
import { parseExchangeRate, parseMoney } from '../costing.ts';

/** `parse` lanza con formatos inválidos: la regla de formato ya reporta ese caso, aquí solo no se rompe. */
const isPositive = (parse: (value: string) => bigint) => (value: string) => {
  try {
    return parse(value) > 0n;
  } catch {
    return false;
  }
};

/** Importes del documento (costos adicionales): hasta 2 decimales, en bolivianos. */
const money = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/, 'Importe inválido');
/** Precio de compra unitario en la moneda del ingreso: hasta 4 decimales. */
const unitPrice = z.string().regex(/^(0|[1-9]\d{0,7})(\.\d{1,4})?$/, 'Precio unitario inválido');
/** Tipo de cambio: bolivianos por dólar, mayor que cero, hasta 4 decimales (ADR-016). */
export const exchangeRateSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,3})(\.\d{1,4})?$/, 'Tipo de cambio inválido')
  .refine(isPositive(parseExchangeRate), 'El tipo de cambio debe ser mayor que cero');

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

export const STOCK_ENTRY_STATUSES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
export type StockEntryStatus = (typeof STOCK_ENTRY_STATUSES)[number];

/** Moneda de compra de un ingreso (Q-07): solo bolivianos o dólares. */
export const STOCK_ENTRY_CURRENCIES = ['BOB', 'USD'] as const;
export const stockEntryCurrencySchema = z.enum(STOCK_ENTRY_CURRENCIES);
export type StockEntryCurrency = z.infer<typeof stockEntryCurrencySchema>;
export const STOCK_ENTRY_CURRENCY_LABELS: Record<StockEntryCurrency, string> = {
  BOB: 'Bolivianos (Bs)',
  USD: 'Dólares (USD)',
};

export const createStockEntrySchema = z
  .object({
    supplierId: z.uuid(),
    /** Texto libre (P-12). */
    documentType: optionalText(40),
    /** Puede repetirse entre ingresos del mismo proveedor: entregas parciales (C5). */
    documentNumber: optionalText(60),
    /** No futura y hasta 30 días hacia atrás en La Paz (C6); la valida el servicio. */
    documentDate: z.iso.date().nullable().optional(),
    currency: stockEntryCurrencySchema.default('BOB'),
    /** Obligatorio si la moneda es USD; no se admite en bolivianos. */
    exchangeRate: exchangeRateSchema.nullable().optional(),
    notes: optionalText(2000),
  })
  .superRefine((value, ctx) => {
    if (value.currency === 'USD' && !value.exchangeRate) {
      ctx.addIssue({
        code: 'custom',
        path: ['exchangeRate'],
        message: 'Indique el tipo de cambio de este ingreso',
      });
    }
    if (value.currency === 'BOB' && value.exchangeRate) {
      ctx.addIssue({
        code: 'custom',
        path: ['exchangeRate'],
        message: 'El tipo de cambio solo se indica en ingresos en dólares',
      });
    }
  });

/**
 * Cambios a la cabecera. Moneda y tipo de cambio se validan juntos en el servicio (hay que
 * combinar con lo guardado): en USD el tipo de cambio es obligatorio; al pasar a BOB se borra.
 */
export const updateStockEntrySchema = z
  .object({
    supplierId: z.uuid().optional(),
    documentType: optionalText(40),
    documentNumber: optionalText(60),
    documentDate: z.iso.date().nullable().optional(),
    currency: stockEntryCurrencySchema.optional(),
    exchangeRate: exchangeRateSchema.nullable().optional(),
    notes: optionalText(2000),
  })
  .refine((value) => Object.keys(value).length > 0, 'Indique al menos un cambio');

export const stockEntryItemInputSchema = z.object({
  variantId: z.uuid(),
  /** Cantidad según el documento del proveedor (si lo indica). */
  expectedQty: z.number().int().min(0).max(1_000_000).nullable().optional(),
  /** Cantidad verificada físicamente: la que ingresa al stock al confirmar. */
  receivedQty: z.number().int().min(0).max(1_000_000),
  /** Precio de compra unitario en la MONEDA DEL INGRESO. */
  unitPrice,
  /** Obligatoria para confirmar si la cantidad esperada difiere de la recibida (C2). */
  differenceReason: optionalText(500),
  notes: optionalText(500),
});

/** Reemplaza todos los ítems del borrador (operación atómica). */
export const replaceStockEntryItemsSchema = z.object({
  items: z
    .array(stockEntryItemInputSchema)
    .max(200)
    .refine(
      (items) => new Set(items.map((item) => item.variantId)).size === items.length,
      'No repita la misma variante en un ingreso',
    ),
});

/** Línea de costo adicional del ingreso: tipo + monto en Bs + nota opcional (Q-08). */
export const stockEntryCostInputSchema = z.object({
  costTypeId: z.uuid(),
  amount: money.refine(isPositive(parseMoney), 'El monto debe ser mayor que cero'),
  note: optionalText(300),
});

/** Reemplaza toda la lista de costos adicionales del borrador (operación atómica). */
export const replaceStockEntryCostsSchema = z.object({
  costs: z.array(stockEntryCostInputSchema).max(50),
});

/**
 * Alta rápida de una pieza nueva dentro del ingreso (C1/P-24): datos mínimos. Crea el producto
 * (activo, una variante con SKU correlativo, precio de venta 0, ficha incompleta) y la agrega como
 * ítem del borrador.
 */
export const quickCreateStockEntryItemSchema = z.object({
  categoryId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  /** Código que trae la pieza del proveedor (opcional). */
  supplierCode: optionalText(64),
  receivedQty: z.number().int().min(1).max(1_000_000),
  /** Precio de compra unitario en la MONEDA DEL INGRESO. */
  unitPrice,
});

export const stockEntryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['all', ...STOCK_ENTRY_STATUSES]).default('all'),
  supplierId: z.uuid().optional(),
  /** Busca por número de documento o número de ingreso. */
  q: z.string().trim().max(60).default(''),
});

/**
 * Los campos de COSTO (`purchaseTotal`, `extrasTotal`, `exchangeRate`, `costs`, `totals` y
 * `cost` de cada ítem) llegan `null` a quien no tiene `costs:read`: el Vendedor y cualquier rol
 * sin ese permiso nunca reciben costos, en ninguna respuesta.
 */
export const stockEntrySummarySchema = z.object({
  id: z.uuid(),
  number: z.number(),
  status: z.enum(STOCK_ENTRY_STATUSES),
  supplierId: z.uuid(),
  supplierName: z.string(),
  documentType: z.string().nullable(),
  documentNumber: z.string().nullable(),
  documentDate: z.string().nullable(),
  currency: stockEntryCurrencySchema,
  itemsCount: z.number(),
  /** Valor de compra de los ítems en bolivianos (cantidad recibida × costo unitario en Bs). */
  purchaseTotal: z.string().nullable(),
  /** Suma de la lista de costos adicionales, en bolivianos. */
  extrasTotal: z.string().nullable(),
  createdAt: z.string(),
  confirmedAt: z.string().nullable(),
});

/** Desglose de costos de un ítem. Los campos del reparto son null si aún no se puede repartir. */
export const stockEntryItemCostSchema = z.object({
  /** Precio de compra unitario en la moneda del ingreso. */
  unitPrice: z.string(),
  /** Equivalente unitario en Bs. */
  unitCostBob: z.string(),
  /** Subtotal de compra en la moneda del ingreso (cantidad × precio). */
  subtotalOriginal: z.string(),
  /** Subtotal de compra en Bs. */
  subtotalBob: z.string(),
  /** Parte de los costos adicionales asignada al ítem, en Bs. */
  extraAllocated: z.string().nullable(),
  /** Costo total del ítem en Bs (compra + costos adicionales asignados). */
  totalCost: z.string().nullable(),
  /** Costo adicional por pieza. */
  unitExtraCost: z.string().nullable(),
  /** Costo unitario total (compra + adicional) = último costo de la variante. */
  unitTotalCost: z.string().nullable(),
});

export const stockEntryItemSchema = z.object({
  id: z.uuid(),
  variantId: z.uuid(),
  sku: z.string(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
  /** La pieza se creó desde un ingreso y su ficha está incompleta (C1). */
  profileIncomplete: z.boolean(),
  expectedQty: z.number().nullable(),
  receivedQty: z.number(),
  differenceReason: z.string().nullable(),
  notes: z.string().nullable(),
  cost: stockEntryItemCostSchema.nullable(),
});

export const stockEntryCostLineSchema = z.object({
  id: z.uuid(),
  costTypeId: z.uuid(),
  costTypeName: z.string(),
  amount: z.string(),
  note: z.string().nullable(),
});

export const stockEntryTotalsSchema = z.object({
  /** Valor de compra en la moneda del ingreso. */
  purchaseOriginal: z.string(),
  /** Valor de compra en Bs. */
  purchaseBob: z.string(),
  /** Costos adicionales en Bs. */
  extras: z.string(),
  /** Valor de compra + costos adicionales, en Bs. */
  grand: z.string(),
});

export const relatedStockEntrySchema = z.object({
  id: z.uuid(),
  number: z.number(),
  status: z.enum(STOCK_ENTRY_STATUSES),
  documentDate: z.string().nullable(),
});

export const stockEntryDetailSchema = stockEntrySummarySchema.extend({
  /** Bs por USD fijado para este ingreso; null en bolivianos o sin `costs:read`. */
  exchangeRate: z.string().nullable(),
  notes: z.string().nullable(),
  createdByName: z.string(),
  confirmedByName: z.string().nullable(),
  items: z.array(stockEntryItemSchema),
  /** Lista de costos adicionales; null sin `costs:read`. */
  costs: z.array(stockEntryCostLineSchema).nullable(),
  totals: stockEntryTotalsSchema.nullable(),
  /** Otros ingresos del mismo proveedor con el mismo número de comprobante (entregas parciales). */
  relatedEntries: z.array(relatedStockEntrySchema),
  /** Motivos por los que hoy no se puede confirmar (vacío = se puede). Solo en borradores. */
  blockers: z.array(z.string()),
});

/** Respuesta del alta rápida: el ingreso actualizado y los avisos (p. ej. código repetido). */
export const quickCreateStockEntryResponseSchema = z.object({
  data: stockEntryDetailSchema,
  meta: z.object({
    variantId: z.uuid(),
    /** Producto recién creado: permite adjuntarle fotos (Q-09 9.1). */
    productId: z.uuid(),
    warnings: z.array(z.string()),
  }),
});

/** Una compra confirmada de una variante (historial de costos, C10). */
export const costHistoryEntrySchema = z.object({
  entryId: z.uuid(),
  entryNumber: z.number(),
  confirmedAt: z.string(),
  supplierName: z.string(),
  currency: stockEntryCurrencySchema,
  exchangeRate: z.string().nullable(),
  quantity: z.number(),
  /** Precio de compra unitario original (moneda del ingreso). */
  unitPrice: z.string(),
  /** Precio de compra unitario en Bs. */
  unitCostBob: z.string(),
  /** Costo adicional por pieza en Bs. */
  unitExtraCost: z.string().nullable(),
  /** Costo unitario total en Bs. */
  unitTotalCost: z.string().nullable(),
});

export type CreateStockEntryInput = z.infer<typeof createStockEntrySchema>;
export type UpdateStockEntryInput = z.infer<typeof updateStockEntrySchema>;
export type StockEntryItemInput = z.infer<typeof stockEntryItemInputSchema>;
export type ReplaceStockEntryItemsInput = z.infer<typeof replaceStockEntryItemsSchema>;
export type StockEntryCostInput = z.infer<typeof stockEntryCostInputSchema>;
export type ReplaceStockEntryCostsInput = z.infer<typeof replaceStockEntryCostsSchema>;
export type QuickCreateStockEntryItemInput = z.infer<typeof quickCreateStockEntryItemSchema>;
export type StockEntrySummary = z.infer<typeof stockEntrySummarySchema>;
export type StockEntryDetail = z.infer<typeof stockEntryDetailSchema>;
export type StockEntryItem = z.infer<typeof stockEntryItemSchema>;
export type StockEntryItemCost = z.infer<typeof stockEntryItemCostSchema>;
export type StockEntryCostLine = z.infer<typeof stockEntryCostLineSchema>;
export type StockEntryTotals = z.infer<typeof stockEntryTotalsSchema>;
export type CostHistoryEntry = z.infer<typeof costHistoryEntrySchema>;
