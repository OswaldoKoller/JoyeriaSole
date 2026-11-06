import { z } from 'zod';

/** Atributo asignado a una categoría (plantilla para la ficha): obligatorio y/o eje sugerido. */
export const categoryAttributeSchema = z.object({
  attributeId: z.uuid(),
  isRequired: z.boolean(),
  isVariantAxisDefault: z.boolean(),
  sortOrder: z.number(),
});

export const categorySchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  attributes: z.array(categoryAttributeSchema),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.uuid().nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
    /** Desactivar no borra: los productos conservan su categoría. */
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Indique al menos un cambio');

/** Reemplaza el conjunto completo de atributos asignados a la categoría. */
export const setCategoryAttributesSchema = z.object({
  attributes: z
    .array(
      z.object({
        attributeId: z.uuid(),
        isRequired: z.boolean().default(false),
        isVariantAxisDefault: z.boolean().default(false),
      }),
    )
    .max(30)
    .refine(
      (items) => new Set(items.map((item) => item.attributeId)).size === items.length,
      'No repita atributos',
    ),
});

export type Category = z.infer<typeof categorySchema>;
export type CategoryAttribute = z.infer<typeof categoryAttributeSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type SetCategoryAttributesInput = z.infer<typeof setCategoryAttributesSchema>;
