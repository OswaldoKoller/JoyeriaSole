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
  userId: z.uuid(),
  createdAt: z.string(),
});

export const globalInventoryMovementSchema = inventoryMovementSchema.extend({
  sku: z.string(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
});

export const initialStockSchema = z.object({
  quantity: z.number().int().positive(),
  reason: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export type InventoryItem = z.infer<typeof inventoryItemSchema>;
export type GlobalInventoryMovement = z.infer<typeof globalInventoryMovementSchema>;
export type InitialStockInput = z.infer<typeof initialStockSchema>;
