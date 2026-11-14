import { z } from 'zod';

export const inventoryItemSchema = z.object({
  variantId: z.uuid(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
  sku: z.string(),
  barcode: z.string().nullable(),
  quantity: z.number(),
  minStock: z.number(),
  canInitialize: z.boolean(),
  level: z.enum(['OUT', 'LOW', 'OK']),
});

export const inventoryMovementSchema = z.object({
  id: z.string(),
  type: z.string(),
  quantity: z.number(),
  balanceBefore: z.number(),
  balanceAfter: z.number(),
  reason: z.string().nullable(),
  notes: z.string().nullable(),
  /**
   * Quién registró el movimiento. `null` en los movimientos `SALE` de OTRO vendedor cuando la persona
   * no tiene `sales:read-all` (sigue a D-02: el Vendedor no ve ventas ajenas, tampoco por el kardex).
   */
  userId: z.uuid().nullable(),
  createdAt: z.string(),
});

export const globalInventoryMovementSchema = inventoryMovementSchema.extend({
  variantId: z.uuid(),
  sku: z.string(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
});

/** Tipos de movimiento del libro (espejo del enum `MovementType` de la base). */
export const MOVEMENT_TYPES = [
  'INITIAL_STOCK',
  'STOCK_ENTRY',
  'ADJUSTMENT',
  'COUNT_ADJUSTMENT',
  'LOSS',
  'SALE',
  'CUSTOMER_RETURN',
  'EXCHANGE',
  'EXCHANGE_IN',
  'EXCHANGE_OUT',
] as const;

/** Día calendario de La Paz, «AAAA-MM-DD», que existe de verdad (no «2026-02-31»). */
const businessDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD')
  .refine((day) => {
    // Las comprobaciones de Zod no se cortan en la primera que falla: aquí puede llegar texto no fecha.
    const parsed = new Date(`${day}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
  }, 'La fecha no existe');

/**
 * Filtros del historial global de movimientos. Los usan el listado y su exportación CSV, de modo
 * que «exportar lo que se ve» devuelve exactamente las mismas filas. Las fechas son días de La Paz,
 * ambas inclusivas.
 */
export const movementFiltersObject = z.object({
  from: businessDay.optional(),
  to: businessDay.optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  variantId: z.uuid().optional(),
  productId: z.uuid().optional(),
});

/** Regla común de los esquemas con `from`/`to`: la fecha inicial no puede ser posterior a la final. */
export function withValidDateRange<T extends z.ZodType<{ from?: string; to?: string }>>(schema: T) {
  return schema.refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'La fecha inicial no puede ser posterior a la final',
    path: ['to'],
  });
}

export const movementFiltersSchema = withValidDateRange(movementFiltersObject);

/** Niveles de stock del listado de saldos y de su exportación. */
export const INVENTORY_LEVELS = ['all', 'OUT', 'LOW', 'OK'] as const;

/** Tope de filas de una exportación CSV: sobre esto se pide acotar los filtros. */
export const CSV_EXPORT_MAX_ROWS = 50_000;

export const initialStockSchema = z.object({
  quantity: z.number().int().positive(),
  reason: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).nullable().optional(),
});

/** Respuesta de `POST /inventory/:variantId/initial`. */
export const initialStockResultSchema = z.object({ quantity: z.number() });

export type InventoryItem = z.infer<typeof inventoryItemSchema>;
export type GlobalInventoryMovement = z.infer<typeof globalInventoryMovementSchema>;
export type MovementFilters = z.infer<typeof movementFiltersSchema>;
export type InitialStockInput = z.infer<typeof initialStockSchema>;
export type InitialStockResult = z.infer<typeof initialStockResultSchema>;
