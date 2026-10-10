import { z } from 'zod';

const moneySchema = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/, 'Precio inválido');

export const productVariantSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  barcode: z.string().nullable(),
  label: z.string().nullable(),
  salePrice: z.string(),
  minStock: z.number(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export const productSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  categoryName: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']),
  axes: z.array(
    z.object({
      attributeId: z.uuid(),
      name: z.string(),
      options: z.array(z.object({ id: z.uuid(), value: z.string() })),
    }),
  ),
  variants: z.array(productVariantSchema),
});

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
  barcode: z.string().trim().max(64).nullable().optional(),
  salePrice: moneySchema.optional(),
  minStock: z.number().int().min(0).default(0),
});

export const createProductSchema = z.object({
  categoryId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  model: z.string().trim().max(100).nullable().optional(),
  barcode: z.string().trim().max(64).nullable().optional(),
  salePrice: moneySchema.optional(),
  minStock: z.number().int().min(0).default(0),
});

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    model: z.string().trim().max(100).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Indique al menos un cambio');

export const assignBarcodeSchema = z.object({ barcode: z.string().trim().min(1).max(64) });

export type Product = z.infer<typeof productSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type AssignBarcodeInput = z.infer<typeof assignBarcodeSchema>;
export type ConfigureAxesInput = z.infer<typeof configureAxesSchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
