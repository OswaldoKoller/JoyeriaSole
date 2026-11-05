/**
 * Seed idempotente: se puede ejecutar varias veces sin duplicar datos.
 *   npm run db:seed
 *
 * Carga SOLO datos estructurales:
 *   - Permisos (desde packages/shared/src/permissions.ts)
 *   - Roles preliminares y su asignación de permisos (PENDIENTE P-01/P-02)
 *   - Usuario administrador inicial (desde variables SEED_ADMIN_*)
 *   - Definiciones de atributos mencionadas en el requerimiento, SIN valores (P-15)
 *   - Tipos de costo adicional de ingresos del sistema (Q-08)
 *
 * NO carga productos, categorías, proveedores ni stock: esos datos los define el cliente.
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PASSWORD_MIN_LENGTH,
  PERMISSION_DESCRIPTIONS,
  ROLES,
  SYSTEM_COST_TYPES,
  type RoleCode,
} from '@joyeria/shared';
import { AttributeDataType } from '../src/generated/prisma/client.ts';
import { hashPassword } from '../src/lib/password.ts';
import { createPrismaClient } from '../src/lib/prisma.ts';

loadEnv({ path: path.resolve(import.meta.dirname, '../../../.env'), quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL no está definida');

const prisma = createPrismaClient(databaseUrl);

/** Atributos citados en el requerimiento. Tipos preliminares; valores los carga el cliente. */
const ATTRIBUTES: { code: string; name: string; dataType: AttributeDataType; unit?: string }[] = [
  { code: 'material', name: 'Material', dataType: AttributeDataType.OPTION },
  { code: 'color', name: 'Color', dataType: AttributeDataType.OPTION },
  { code: 'tono', name: 'Tono', dataType: AttributeDataType.OPTION },
  { code: 'talla', name: 'Talla', dataType: AttributeDataType.OPTION },
  { code: 'tamano', name: 'Tamaño', dataType: AttributeDataType.OPTION },
  { code: 'longitud', name: 'Longitud', dataType: AttributeDataType.OPTION, unit: 'cm' },
  { code: 'dimensiones', name: 'Dimensiones', dataType: AttributeDataType.TEXT },
  { code: 'acabado', name: 'Acabado', dataType: AttributeDataType.OPTION },
  { code: 'piedra', name: 'Piedra', dataType: AttributeDataType.OPTION },
  { code: 'tipo_cierre', name: 'Tipo de cierre', dataType: AttributeDataType.OPTION },
  { code: 'genero', name: 'Género', dataType: AttributeDataType.OPTION },
  { code: 'coleccion', name: 'Colección', dataType: AttributeDataType.OPTION },
];

async function seedPermissionsAndRoles() {
  for (const code of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: { description: PERMISSION_DESCRIPTIONS[code] },
      create: { code, description: PERMISSION_DESCRIPTIONS[code] },
    });
  }

  const permissions = await prisma.permission.findMany();
  const permissionId = new Map(permissions.map((p) => [p.code, p.id]));

  for (const [code, def] of Object.entries(DEFAULT_ROLE_PERMISSIONS) as [
    RoleCode,
    (typeof DEFAULT_ROLE_PERMISSIONS)[RoleCode],
  ][]) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { name: def.name, description: def.description, isSystem: true },
      create: { code, name: def.name, description: def.description, isSystem: true },
    });

    // Solo se AGREGAN permisos faltantes; no se quitan los que un administrador haya asignado.
    await prisma.rolePermission.createMany({
      data: def.permissions.map((p) => {
        const id = permissionId.get(p);
        if (!id) throw new Error(`Permiso no encontrado: ${p}`);
        return { roleId: role.id, permissionId: id };
      }),
      skipDuplicates: true,
    });
  }
  console.log(`✔ ${ALL_PERMISSIONS.length} permisos y ${Object.keys(ROLES).length} roles`);
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? 'Administrador';

  if (!email || !password) {
    console.log('↷ SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD no definidos: se omite el administrador');
    return;
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`SEED_ADMIN_PASSWORD debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`↷ El administrador ${email} ya existe (no se modifica su contraseña)`);
    return;
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: ROLES.ADMIN } });
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      roles: { create: { roleId: adminRole.id } },
    },
  });
  await prisma.auditLog.create({
    data: {
      action: 'user.created',
      entityType: 'User',
      entityId: user.id,
      metadata: { source: 'seed' },
    },
  });
  console.log(`✔ Administrador creado: ${email}`);
}

async function seedAttributes() {
  for (const [index, attr] of ATTRIBUTES.entries()) {
    await prisma.attribute.upsert({
      where: { code: attr.code },
      update: {},
      create: { ...attr, unit: attr.unit ?? null, sortOrder: index },
    });
  }
  console.log(`✔ ${ATTRIBUTES.length} definiciones de atributos (sin valores)`);
}

async function seedCostTypes() {
  for (const [index, type] of SYSTEM_COST_TYPES.entries()) {
    // Se restablecen nombre y marca de sistema; nunca `isActive` ni los tipos agregados por el cliente.
    await prisma.stockEntryCostType.upsert({
      where: { code: type.code },
      update: { name: type.name, isSystem: true },
      create: { ...type, isSystem: true, sortOrder: index + 1 },
    });
  }
  console.log(`✔ ${SYSTEM_COST_TYPES.length} tipos de costo de ingreso del sistema`);
}

try {
  await seedPermissionsAndRoles();
  await seedAdmin();
  await seedAttributes();
  await seedCostTypes();
} finally {
  await prisma.$disconnect();
}
