import { z } from 'zod';
import { RECEIPT_FOOTER_NOTE_MAX_LENGTH } from '../sales.ts';
import { optionalText, userRefSchema } from './money.ts';

/**
 * Datos comerciales del comprobante interno (C1, C2; registro único en `business_settings`). Solo
 * el Administrador los edita (`settings:manage`, R-27). El logo se sube aparte (`PUT
 * /settings/business/logo`, multipart). Valores provisionales: `BUSINESS_SETTINGS_DEFAULTS` (D-07,
 * POR DEFECTO — PENDIENTE DE CONFIRMACIÓN).
 */
export const updateBusinessSettingsSchema = z.strictObject({
  tradeName: z
    .string({ error: 'Indique el nombre comercial' })
    .trim()
    .min(1, 'Indique el nombre comercial')
    .max(120, 'El nombre comercial admite hasta 120 caracteres'),
  address: optionalText(200, 'La dirección admite hasta 200 caracteres'),
  phone: optionalText(40, 'El teléfono admite hasta 40 caracteres'),
  /** NIT opcional (C1). */
  taxId: optionalText(20, 'El NIT admite hasta 20 caracteres'),
  /** D-04: imprimir el nombre del vendedor en el comprobante. */
  receiptShowSeller: z.boolean(),
  /** Leyenda al pie del comprobante; vacía = sin leyenda. */
  receiptFooterNote: optionalText(
    RECEIPT_FOOTER_NOTE_MAX_LENGTH,
    `La leyenda admite hasta ${RECEIPT_FOOTER_NOTE_MAX_LENGTH} caracteres`,
  ),
});

/** Metadatos del logo vigente (los bytes se piden aparte). */
export const businessLogoSchema = z.strictObject({
  sha256: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  sizeBytes: z.number().int(),
  updatedAt: z.string(),
});

export const businessSettingsSchema = z.strictObject({
  tradeName: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  taxId: z.string().nullable(),
  receiptShowSeller: z.boolean(),
  receiptFooterNote: z.string().nullable(),
  /** Logo vigente o `null` si no hay. */
  logo: businessLogoSchema.nullable(),
  /** `null` mientras nadie la haya editado (valores provisionales). */
  updatedAt: z.string().nullable(),
  updatedBy: userRefSchema.nullable(),
});

export type UpdateBusinessSettingsInput = z.infer<typeof updateBusinessSettingsSchema>;
export type BusinessSettings = z.infer<typeof businessSettingsSchema>;
export type BusinessLogo = z.infer<typeof businessLogoSchema>;
