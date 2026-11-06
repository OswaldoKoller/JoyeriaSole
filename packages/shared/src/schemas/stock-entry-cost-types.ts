import { z } from 'zod';

/** Tipos del sistema (Q-08); el seed y la migración de datos los crean. El Administrador puede agregar más. */
export const SYSTEM_COST_TYPES = [
  { code: 'TRANSPORT', name: 'Transporte' },
  { code: 'PACKAGING', name: 'Embolsado' },
  { code: 'CUSTOMS', name: 'Aduanización' },
  { code: 'COMMISSIONS', name: 'Comisiones' },
  { code: 'OTHER', name: 'Otro' },
] as const;

/** Tipos de costo adicional de un ingreso (Q-08). */
export const stockEntryCostTypeSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  /** Tipo del sistema (Transporte, Embolsado, Aduanización, Comisiones, Otro): no se edita. */
  isSystem: z.boolean(),
});

export const createStockEntryCostTypeSchema = z.object({
  name: z.string().trim().min(2).max(100),
});

export const updateStockEntryCostTypeSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Indique al menos un cambio');

export type StockEntryCostType = z.infer<typeof stockEntryCostTypeSchema>;
export type CreateStockEntryCostTypeInput = z.infer<typeof createStockEntryCostTypeSchema>;
export type UpdateStockEntryCostTypeInput = z.infer<typeof updateStockEntryCostTypeSchema>;
