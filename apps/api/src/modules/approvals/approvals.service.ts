import type { PendingApprovals } from '@joyeria/shared';
import { PERMISSIONS } from '@joyeria/shared';
import type { PrismaClient } from '../../lib/prisma.ts';

/** Cuenta, sin modificar nada, lo que espera una resolución del Administrador o del Responsable. */
export class ApprovalsService {
  constructor(private readonly prisma: PrismaClient) {}

  async pending(permissions: readonly string[]): Promise<PendingApprovals> {
    const can = (permission: string) => permissions.includes(permission);
    const [adjustments, prices, counts] = await Promise.all([
      can(PERMISSIONS.INVENTORY_ADJUST_APPROVE)
        ? this.prisma.inventoryAdjustment.count({ where: { status: 'PENDING' } })
        : null,
      can(PERMISSIONS.PRICES_APPROVE)
        ? this.prisma.priceChange.count({ where: { status: 'PENDING' } })
        : null,
      can(PERMISSIONS.INVENTORY_COUNTS_APPROVE)
        ? this.prisma.inventoryCount.count({ where: { status: 'IN_REVIEW' } })
        : null,
    ]);
    return {
      adjustments,
      prices,
      counts,
      total: (adjustments ?? 0) + (prices ?? 0) + (counts ?? 0),
    };
  }
}
