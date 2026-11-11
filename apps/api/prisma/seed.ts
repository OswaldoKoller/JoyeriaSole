/**
 * Seed idempotente: se puede ejecutar varias veces sin duplicar datos.
 *   npm run db:seed
 *
 * Carga SOLO datos estructurales:
 *   - Permisos (desde packages/shared/src/permissions.ts)
 *   - Roles preliminares y su asignación de permisos (PENDIENTE P-01/P-02)
 *   - Usuario administrador inicial (desde variables SEED_ADMIN_*)
 *   - Definiciones de atributos mencionadas en el requerimiento, SIN valores (P-15)
 *   - Catálogo de motivos de ajuste de inventario (P-20)
 *   - Tipos de costo adicional de ingresos del sistema (Q-08)
 *
 * NO carga productos, categorías, proveedores ni stock: esos datos los define el cliente.
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import {
  ALL_PERMISSIONS,
  DEFAULT_ADJUSTMENT_REASONS,
  DEFAULT_ROLE_PERMISSIONS,
  PASSWORD_MIN_LENGTH,
  PERMISSION_DESCRIPTIONS,
  ROLES,
  SYSTEM_COST_TYPES,
  type RoleCode,
} from '@joyeria/shared';
import type { AttributeDataType, AttributeUsage } from '../src/generated/prisma/client.ts';
import { hashPassword } from '../src/lib/password.ts';
import { createPrismaClient } from '../src/lib/prisma.ts';

loadEnv({ path: path.resolve(import.meta.dirname, '../../../.env'), quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL no está definida');

const prisma = createPrismaClient(databaseUrl);

/**
 * Las 12 definiciones base (B2, RESOLUCIONES-2026-11-05): uso sugerido como eje de variante o como
 * característica descriptiva. Los VALORES de las listas los entrega el cliente (P-15): no se inventan.
 */
const ATTRIBUTES: {
  code: string;
  name: string;
  dataType: AttributeDataType;
  suggestedUse: AttributeUsage;
  unit?: string;
}[] = [
  { code: 'material', name: 'Material', dataType: 'OPTION', suggestedUse: 'VARIANT_AXIS' },
  { code: 'color', name: 'Color', dataType: 'OPTION', suggestedUse: 'VARIANT_AXIS' },
  { code: 'tono', name: 'Tono', dataType: 'OPTION', suggestedUse: 'DESCRIPTIVE' },
  { code: 'talla', name: 'Talla', dataType: 'OPTION', suggestedUse: 'VARIANT_AXIS' },
  { code: 'tamano', name: 'Tamaño', dataType: 'OPTION', suggestedUse: 'VARIANT_AXIS' },
  {
    code: 'longitud',
    name: 'Longitud',
    dataType: 'OPTION',
    suggestedUse: 'VARIANT_AXIS',
    unit: 'cm',
  },
  { code: 'dimensiones', name: 'Dimensiones', dataType: 'TEXT', suggestedUse: 'DESCRIPTIVE' },
  { code: 'acabado', name: 'Acabado', dataType: 'OPTION', suggestedUse: 'DESCRIPTIVE' },
  { code: 'piedra', name: 'Piedra', dataType: 'OPTION', suggestedUse: 'DESCRIPTIVE' },
  { code: 'tipo_cierre', name: 'Tipo de cierre', dataType: 'OPTION', suggestedUse: 'DESCRIPTIVE' },
  { code: 'genero', name: 'Género', dataType: 'OPTION', suggestedUse: 'DESCRIPTIVE' },
  { code: 'coleccion', name: 'Colección', dataType: 'OPTION', suggestedUse: 'DESCRIPTIVE' },
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
    // Pantalla «Roles» (P-46): los roles creados allí llevan código `CUSTOM_*` y el seed nunca los toca.
    // En los de sistema la pantalla no cambia nombre ni descripción ni quita estos permisos base, de
    // modo que el seed no deshace nada hecho por pantalla (los permisos extra agregados se conservan).
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
      // Solo se asegura la marca de sistema: el uso sugerido y el nombre pueden haberlos cambiado
      // desde la aplicación y el seed no los pisa.
      update: { isSystem: true },
      create: { ...attr, unit: attr.unit ?? null, sortOrder: index, isSystem: true },
    });
  }
  console.log(`✔ ${ATTRIBUTES.length} definiciones de atributos (sin valores)`);
}

/** Motivos de ajuste (P-20). Idempotente: solo agrega los que faltan, sin pisar cambios hechos luego. */
async function seedAdjustmentReasons() {
  for (const [index, reason] of DEFAULT_ADJUSTMENT_REASONS.entries()) {
    await prisma.adjustmentReason.upsert({
      where: { code: reason.code },
      update: {},
      create: { ...reason, sortOrder: index },
    });
  }
  console.log(`✔ ${DEFAULT_ADJUSTMENT_REASONS.length} motivos de ajuste`);
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
  await seedAdjustmentReasons();
  await seedCostTypes();
} finally {
  await prisma.$disconnect();
}
