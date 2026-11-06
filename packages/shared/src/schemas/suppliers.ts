import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

/** Tipo de proveedor (C8). Por defecto NATIONAL (valor por defecto en la base de datos). */
export const SUPPLIER_TYPES = ['NATIONAL', 'FOREIGN'] as const;
export const supplierTypeSchema = z.enum(SUPPLIER_TYPES);
export type SupplierType = z.infer<typeof supplierTypeSchema>;
export const SUPPLIER_TYPE_LABELS: Record<SupplierType, string> = {
  NATIONAL: 'Nacional',
  FOREIGN: 'Del exterior',
};

/** Moneda habitual de compra. Por defecto BOB (valor por defecto en la base de datos). */
export const SUPPLIER_CURRENCIES = ['BOB', 'USD'] as const;
export const supplierCurrencySchema = z.enum(SUPPLIER_CURRENCIES);
export type SupplierCurrency = z.infer<typeof supplierCurrencySchema>;
export const SUPPLIER_CURRENCY_LABELS: Record<SupplierCurrency, string> = {
  BOB: 'Bolivianos (Bs)',
  USD: 'Dólares (USD)',
};

// `type` y `defaultCurrency` no llevan `.default()` aquí: así el PATCH parcial no los reinicia;
// cuando se omiten al crear, aplica el valor por defecto de la base de datos.
export const createSupplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: supplierTypeSchema.optional(),
  country: optionalText(80),
  taxId: optionalText(30),
  contactName: optionalText(120),
  phone: optionalText(40),
  whatsapp: optionalText(40),
  email: z.email().max(254).nullable().optional(),
  address: optionalText(300),
  defaultCurrency: supplierCurrencySchema.optional(),
  paymentTerms: optionalText(300),
  notes: optionalText(2000),
});

export const updateSupplierSchema = createSupplierSchema
  .extend({ isActive: z.boolean().optional() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Indique al menos un campo para actualizar');

export const supplierSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: supplierTypeSchema,
  country: z.string().nullable(),
  taxId: z.string().nullable(),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  whatsapp: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  /** Moneda habitual de compra; S5 la usa como valor sugerido en el ingreso. */
  defaultCurrency: supplierCurrencySchema,
  paymentTerms: z.string().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type Supplier = z.infer<typeof supplierSchema>;
