import { z } from 'zod';

/**
 * Pendientes de aprobación (Q-14). Cada total es `null` si la persona no puede resolver ese tipo
 * de pendiente (no se le revela cuántos hay).
 */
export const pendingApprovalsSchema = z.object({
  adjustments: z.number().int().nullable(),
  prices: z.number().int().nullable(),
  counts: z.number().int().nullable(),
  total: z.number().int(),
});
export type PendingApprovals = z.infer<typeof pendingApprovalsSchema>;
