import { DEFAULT_ADJUSTMENT_REASONS, type Permission } from '@joyeria/shared';
import { hashPassword } from '../../src/lib/password.ts';
import type { PrismaClient } from '../../src/lib/prisma.ts';

/** Vacía todas las tablas (TRUNCATE no dispara los triggers append-only, que son por fila). */
export async function resetDatabase(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

let counter = 0;

/** Crea un usuario de prueba con un rol ad-hoc que tiene exactamente los permisos indicados. */
export async function createTestUser(
  prisma: PrismaClient,
  options: { permissions?: Permission[]; password?: string; isActive?: boolean } = {},
) {
  counter += 1;
  const password = options.password ?? 'clave-de-prueba-123';
  const permissions = options.permissions ?? [];

  const role = await prisma.role.create({
    data: {
      code: `TEST_ROLE_${counter}`,
      name: `Rol de prueba ${counter}`,
      permissions: {
        create: permissions.map((code) => ({
          permission: { connectOrCreate: { where: { code }, create: { code } } },
        })),
      },
    },
  });

  const user = await prisma.user.create({
    data: {
      email: `usuario${counter}@test.local`,
      name: `Usuario ${counter}`,
      passwordHash: await hashPassword(password),
      isActive: options.isActive ?? true,
      roles: { create: { roleId: role.id } },
    },
  });

  return { user, password };
}

/** Siembra el catálogo de motivos de ajuste (resetDatabase lo vacía, igual que el resto). */
export async function seedAdjustmentReasons(prisma: PrismaClient) {
  const reasons = new Map<string, string>();
  for (const [index, reason] of DEFAULT_ADJUSTMENT_REASONS.entries()) {
    const row = await prisma.adjustmentReason.upsert({
      where: { code: reason.code },
      update: {},
      create: { ...reason, sortOrder: index },
    });
    reasons.set(reason.code, row.id);
  }
  return reasons;
}
