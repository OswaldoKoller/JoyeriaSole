import { SYSTEM_COST_TYPES } from '@joyeria/shared';
import type { PrismaClient } from '../../src/lib/prisma.ts';

/**
 * `resetDatabase` vacía todas las tablas, también el catálogo de tipos de costo que siembra el
 * seed: las pruebas que lo necesitan lo recrean con esto y reciben el id por código.
 */
export async function seedCostTypes(prisma: PrismaClient) {
  const ids: Record<string, string> = {};
  for (const [index, type] of SYSTEM_COST_TYPES.entries()) {
    const created = await prisma.stockEntryCostType.upsert({
      where: { code: type.code },
      update: {},
      create: { ...type, isSystem: true, sortOrder: index + 1 },
    });
    ids[type.code] = created.id;
  }
  return ids as Record<(typeof SYSTEM_COST_TYPES)[number]['code'], string>;
}
