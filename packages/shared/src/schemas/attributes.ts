import { z } from 'zod';

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
  dataType: z.enum(['OPTION', 'TEXT', 'NUMBER', 'BOOLEAN']),
  unit: z.string().nullable(),
  isActive: z.boolean(),
  options: z.array(attributeOptionSchema),
});

export const createAttributeOptionSchema = z.object({
  value: z.string().trim().min(1).max(100),
  code: z.string().trim().max(20).nullable().optional(),
});

export type Attribute = z.infer<typeof attributeSchema>;
export type CreateAttributeOptionInput = z.infer<typeof createAttributeOptionSchema>;
