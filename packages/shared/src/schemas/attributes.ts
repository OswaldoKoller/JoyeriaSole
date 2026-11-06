import { z } from 'zod';

export const attributeDataTypeSchema = z.enum(['OPTION', 'TEXT', 'NUMBER', 'BOOLEAN']);
/** Uso sugerido (B2): eje de variante o característica descriptiva. Es una guía para la UI. */
export const attributeUsageSchema = z.enum(['VARIANT_AXIS', 'DESCRIPTIVE']);

export const attributeOptionSchema = z.object({
  id: z.uuid(),
  value: z.string(),
  code: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number(),
});

export const attributeSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  dataType: attributeDataTypeSchema,
  unit: z.string().nullable(),
  suggestedUse: attributeUsageSchema,
  /** Definición base del sistema: se edita, pero no se desactiva ni se elimina. */
  isSystem: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  options: z.array(attributeOptionSchema),
});

export const createAttributeOptionSchema = z.object({
  value: z.string().trim().min(1).max(100),
  code: z.string().trim().max(20).nullable().optional(),
});

export const updateAttributeOptionSchema = z
  .object({
    value: z.string().trim().min(1).max(100).optional(),
    code: z.string().trim().max(20).nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Indique al menos un cambio');

/** `code` es opcional: si falta, la API lo deriva del nombre (minúsculas, sin tildes, con guiones bajos). */
export const createAttributeSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{0,59}$/, 'Código inválido (letras minúsculas, números y guion bajo)')
    .optional(),
  name: z.string().trim().min(1).max(100),
  dataType: attributeDataTypeSchema,
  unit: z.string().trim().max(20).nullable().optional(),
  suggestedUse: attributeUsageSchema.default('DESCRIPTIVE'),
});

export const updateAttributeSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    unit: z.string().trim().max(20).nullable().optional(),
    suggestedUse: attributeUsageSchema.optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Indique al menos un cambio');

export type Attribute = z.infer<typeof attributeSchema>;
export type AttributeOption = z.infer<typeof attributeOptionSchema>;
export type AttributeUsage = z.infer<typeof attributeUsageSchema>;
export type CreateAttributeInput = z.infer<typeof createAttributeSchema>;
export type UpdateAttributeInput = z.infer<typeof updateAttributeSchema>;
export type CreateAttributeOptionInput = z.infer<typeof createAttributeOptionSchema>;
export type UpdateAttributeOptionInput = z.infer<typeof updateAttributeOptionSchema>;
