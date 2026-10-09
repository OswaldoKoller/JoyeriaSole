import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  taxId: optionalText(30),
  contactName: optionalText(120),
  phone: optionalText(40),
  email: z.email().max(254).nullable().optional(),
  address: optionalText(300),
  notes: optionalText(2000),
});

export const updateSupplierSchema = createSupplierSchema
  .extend({ isActive: z.boolean().optional() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Indique al menos un campo para actualizar');

export const supplierSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  taxId: z.string().nullable(),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type Supplier = z.infer<typeof supplierSchema>;
