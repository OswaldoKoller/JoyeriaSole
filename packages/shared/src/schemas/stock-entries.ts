import { z } from 'zod';

/** Importes del documento (transporte, embolsado, extras): hasta 2 decimales, en bolivianos. */
const money = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/, 'Importe inválido');
/** Costo unitario de compra: hasta 4 decimales. */
const unitCost = z.string().regex(/^(0|[1-9]\d{0,7})(\.\d{1,4})?$/, 'Costo unitario inválido');

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

export const stockEntryHeaderFields = {
  supplierId: z.uuid(),
  /** Texto libre (P-12). */
  documentType: optionalText(40),
  documentNumber: optionalText(60),
  documentDate: z.iso.date().nullable().optional(),
  freightCost: money.default('0'),
  packagingCost: money.default('0'),
  otherCosts: money.default('0'),
  notes: optionalText(2000),
};

export const createStockEntrySchema = z.object(stockEntryHeaderFields);

export const updateStockEntrySchema = z
  .object({
    supplierId: z.uuid().optional(),
    documentType: optionalText(40),
    documentNumber: optionalText(60),
    documentDate: z.iso.date().nullable().optional(),
    freightCost: money.optional(),
    packagingCost: money.optional(),
    otherCosts: money.optional(),
    notes: optionalText(2000),
  })
  .refine((value) => Object.keys(value).length > 0, 'Indique al menos un cambio');

export const stockEntryItemInputSchema = z.object({
  variantId: z.uuid(),
  /** Cantidad según el documento del proveedor (si lo indica). */
  expectedQty: z.number().int().min(0).max(1_000_000).nullable().optional(),
  /** Cantidad verificada físicamente: la que ingresa al stock al confirmar. */
  receivedQty: z.number().int().min(0).max(1_000_000),
  unitCost,
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

export const stockEntryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['all', ...STOCK_ENTRY_STATUSES]).default('all'),
  supplierId: z.uuid().optional(),
  /** Busca por número de documento. */
  q: z.string().trim().max(60).default(''),
});

export const stockEntrySummarySchema = z.object({
  id: z.uuid(),
  number: z.number(),
  status: z.enum(STOCK_ENTRY_STATUSES),
  supplierId: z.uuid(),
  supplierName: z.string(),
  documentType: z.string().nullable(),
  documentNumber: z.string().nullable(),
  documentDate: z.string().nullable(),
  itemsCount: z.number(),
  /** Valor de compra de los ítems (cantidad recibida × costo unitario), en bolivianos. */
  purchaseTotal: z.string(),
  /** Transporte + embolsado + extras, en bolivianos. */
  extrasTotal: z.string(),
  createdAt: z.string(),
  confirmedAt: z.string().nullable(),
});

export const stockEntryItemSchema = z.object({
  id: z.uuid(),
  variantId: z.uuid(),
  sku: z.string(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
  expectedQty: z.number().nullable(),
  receivedQty: z.number(),
  unitCost: z.string(),
  /** Costo adicional por pieza (vista previa en borrador, valor guardado si está confirmado). */
  unitExtraCost: z.string().nullable(),
  /** Costo unitario total = compra + adicional. */
  unitTotalCost: z.string().nullable(),
  notes: z.string().nullable(),
});

export const stockEntryDetailSchema = stockEntrySummarySchema.extend({
  freightCost: z.string(),
  packagingCost: z.string(),
  otherCosts: z.string(),
  notes: z.string().nullable(),
  createdByName: z.string(),
  confirmedByName: z.string().nullable(),
  items: z.array(stockEntryItemSchema),
  /** Motivos por los que hoy no se puede confirmar (vacío = se puede). Solo en borradores. */
  blockers: z.array(z.string()),
});

export type CreateStockEntryInput = z.infer<typeof createStockEntrySchema>;
export type UpdateStockEntryInput = z.infer<typeof updateStockEntrySchema>;
export type StockEntryItemInput = z.infer<typeof stockEntryItemInputSchema>;
export type ReplaceStockEntryItemsInput = z.infer<typeof replaceStockEntryItemsSchema>;
export type StockEntrySummary = z.infer<typeof stockEntrySummarySchema>;
export type StockEntryDetail = z.infer<typeof stockEntryDetailSchema>;
export type StockEntryItem = z.infer<typeof stockEntryItemSchema>;
