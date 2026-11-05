import { z } from 'zod';

const moneySchema = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/, 'Precio inválido');

export const productVariantSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  barcode: z.string().nullable(),
  label: z.string().nullable(),
  /** Precio de venta NETO, antes de impuestos (D7). 0 = «sin precio» (D9). */
  salePrice: z.string(),
  minStock: z.number(),
  stockQuantity: z.number().optional(),
  stockLevel: z.enum(['OUT', 'LOW', 'OK']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

/** Valor de una característica descriptiva del producto (ProductAttributeValue). */
export const productAttributeValueSchema = z.object({
  attributeId: z.uuid(),
  name: z.string(),
  dataType: z.enum(['OPTION', 'TEXT', 'NUMBER', 'BOOLEAN']),
  unit: z.string().nullable(),
  optionId: z.uuid().nullable(),
  valueText: z.string().nullable(),
  valueNumber: z.string().nullable(),
  valueBoolean: z.boolean().nullable(),
  displayValue: z.string(),
});

export const productSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  categoryName: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']),
  /** C1: sin descripción y sin ningún valor de característica descriptiva. */
  isIncomplete: z.boolean(),
  /** C1/D9: alguna variante activa con precio de venta 0. */
  hasMissingPrice: z.boolean(),
  attributes: z.array(productAttributeValueSchema),
  /** Creada desde un ingreso con datos mínimos: falta completar la ficha (C1). */
  profileIncomplete: z.boolean(),
  axes: z.array(
    z.object({
      attributeId: z.uuid(),
      name: z.string(),
      options: z.array(z.object({ id: z.uuid(), value: z.string() })),
    }),
  ),
  variants: z.array(productVariantSchema),
});

/** Avisos no bloqueantes de una operación (p. ej. código del proveedor repetido, Q-10). */
export const warningsMetaSchema = z.object({ warnings: z.array(z.string()) });

export const productAttributeInputSchema = z.object({
  attributeId: z.uuid(),
  optionId: z.uuid().nullable().optional(),
  valueText: z.string().trim().min(1).max(500).nullable().optional(),
  valueNumber: z
    .string()
    .trim()
    .regex(/^-?\d{1,9}(\.\d{1,3})?$/, 'Número inválido')
    .nullable()
    .optional(),
  valueBoolean: z.boolean().nullable().optional(),
});
export const productAttributesInputSchema = z
  .array(productAttributeInputSchema)
  .max(30)
  .refine(
    (items) => new Set(items.map((item) => item.attributeId)).size === items.length,
    'No repita atributos',
  );

export const variantSelectionSchema = z.object({ attributeId: z.uuid(), optionId: z.uuid() });
const selections = z
  .array(variantSelectionSchema)
  .min(1)
  .max(12)
  .refine(
    (values) => new Set(values.map((item) => item.attributeId)).size === values.length,
    'No repita atributos',
  );

export const configureAxesSchema = z.object({ axes: selections });

export const createVariantSchema = z.object({
  values: selections,
  /** Código del proveedor. Si ya pertenece a otra pieza no se guarda (Q-10) y se avisa. */
  barcode: z.string().trim().max(64).nullable().optional(),
  /** Proveedor de la pieza: permite conservar su código en SupplierProduct. */
  supplierId: z.uuid().nullable().optional(),
  salePrice: moneySchema.optional(),
  minStock: z.number().int().min(0).default(0),
});

export const createProductSchema = z.object({
  categoryId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  model: z.string().trim().max(100).nullable().optional(),
  /** Código del proveedor de la variante base. */
  barcode: z.string().trim().max(64).nullable().optional(),
  supplierId: z.uuid().nullable().optional(),
  salePrice: moneySchema.optional(),
  /** B10: 0 = alerta desactivada. */
  minStock: z.number().int().min(0).default(0),
  /** Características descriptivas (opcionales: C1 permite fichas incompletas). */
  attributes: productAttributesInputSchema.default([]),
  /** Ejes de variante con los valores de la variante base. Sin ejes: pieza simple («Única»). */
  axes: selections.optional(),
});

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    model: z.string().trim().max(100).nullable().optional(),
    /** Desactivar se bloquea si alguna variante tiene stock (P-22). */
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    /** Reemplaza el conjunto completo de características descriptivas. */
    attributes: productAttributesInputSchema.optional(),
    /** Permite marcar la ficha como completa (o volver a marcarla incompleta). */
    profileIncomplete: z.boolean().optional(),
  })
  // El precio de venta NO se edita aquí: después de crear la pieza solo cambia por /pricing (ADR-018).
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Indique al menos un cambio');

/** B10: el stock mínimo por variante lo modifica quien gestiona el catálogo. */
export const updateVariantSchema = z.object({ minStock: z.number().int().min(0) });

export const updateVariantStatusSchema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) });

export const assignBarcodeSchema = z.object({
  barcode: z.string().trim().min(1).max(64),
  supplierId: z.uuid().nullable().optional(),
});

/** Filtros del listado de productos. */
export const productListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).default(''),
  status: z.enum(['all', 'DRAFT', 'ACTIVE', 'INACTIVE']).default('all'),
  categoryId: z.uuid().optional(),
  /** Solo fichas incompletas (C1). */
  incomplete: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /** Solo productos con alguna variante activa sin precio (D9). */
  withoutPrice: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

/** Resultado de buscar un código (SKU, código de barras o código del proveedor). */
export const variantLookupSchema = z.object({
  variantId: z.uuid(),
  productId: z.uuid(),
  productName: z.string(),
  categoryName: z.string(),
  label: z.string().nullable(),
  sku: z.string(),
  barcode: z.string().nullable(),
  salePrice: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  productStatus: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']),
  matchedBy: z.enum(['SKU', 'BARCODE', 'SUPPLIER_CODE']),
  stockQuantity: z.number().optional(),
});

/** Contadores de calidad del catálogo para el Inicio (sin costos). Solo productos no inactivos. */
export const catalogHealthSchema = z.object({
  incompleteProducts: z.number(),
  productsWithoutPrice: z.number(),
  activeProducts: z.number(),
});

export type Product = z.infer<typeof productSchema>;
export type ProductVariant = z.infer<typeof productVariantSchema>;
export type ProductAttributeValue = z.infer<typeof productAttributeValueSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type UpdateVariantStatusInput = z.infer<typeof updateVariantStatusSchema>;
export type AssignBarcodeInput = z.infer<typeof assignBarcodeSchema>;
export type ConfigureAxesInput = z.infer<typeof configureAxesSchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type ProductAttributeInput = z.infer<typeof productAttributeInputSchema>;
export type VariantLookup = z.infer<typeof variantLookupSchema>;
export type CatalogHealth = z.infer<typeof catalogHealthSchema>;
