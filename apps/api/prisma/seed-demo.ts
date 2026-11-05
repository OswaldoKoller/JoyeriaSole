/**
 * Datos de DEMOSTRACIÓN y E2E (ficticios, marcados con «DEMO»). Nunca en producción.
 *   npm run db:seed:demo        (requiere antes: npm run db:seed)
 *
 * Crea:
 *   - Un usuario por rol: Administrador, Responsable de inventario y Vendedor, todos con la
 *     contraseña DEMO_USER_PASSWORD (mínimo 10 caracteres, P-19).
 *   - 4 categorías y 20 productos (una variante cada uno, SKU correlativo, precio en Bs).
 *   - Stock variado mediante movimientos INITIAL_STOCK auditados: nunca editando saldos (ADR-007).
 *     Reparto: 5 sin stock, 5 bajo mínimo, 10 disponibles.
 *   - Tres ajustes de inventario de ejemplo (ADR-017): dos PENDIENTES (el stock no cambia) y uno
 *     APROBADO (movimiento ADJUSTMENT auditado). No alteran el nivel (sin stock / bajo / disponible)
 *     de ninguna pieza, para no mover los totales del dashboard.
 *
 * Idempotente: si los datos DEMO ya existen, no los duplica.
 */
import path from 'node:path';
import { PASSWORD_MIN_LENGTH, ROLES, type RoleCode } from '@joyeria/shared';
import { config as loadEnv } from 'dotenv';
import { hashPassword } from '../src/lib/password.ts';
import { createPrismaClient } from '../src/lib/prisma.ts';

loadEnv({ path: path.resolve(import.meta.dirname, '../../../.env'), quiet: true });

export const DEMO_USERS: { role: RoleCode; email: string; name: string }[] = [
  { role: ROLES.ADMIN, email: 'demo-admin@example.invalid', name: 'DEMO Administradora' },
  {
    role: ROLES.INVENTORY_MANAGER,
    email: 'demo-inventario@example.invalid',
    name: 'DEMO Responsable de inventario',
  },
  { role: ROLES.SELLER, email: 'demo-vendedor@example.invalid', name: 'DEMO Vendedor' },
];

const CATEGORIES = ['Anillos', 'Collares', 'Aretes', 'Pulseras'] as const;
const PIECES: Record<(typeof CATEGORIES)[number], string[]> = {
  Anillos: ['Solitario Circona', 'Alianza Lisa', 'Sello Ónix', 'Trébol', 'Media Caña'],
  Collares: ['Corazón', 'Cruz Clásica', 'Perla Simple', 'Inicial', 'Riviera'],
  Aretes: ['Argolla Mediana', 'Gota Cristal', 'Topo Perla', 'Estrella', 'Colgante Hoja'],
  Pulseras: ['Esclava', 'Cadena Rolo', 'Tenis', 'Dije Luna', 'Eslabón Cubano'],
};

function assertSafeTarget(databaseUrl: string) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-demo no se ejecuta con NODE_ENV=production');
  }
  const host = new URL(databaseUrl).hostname;
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(`seed-demo solo se ejecuta contra una base local (host recibido: ${host})`);
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL no está definida');
assertSafeTarget(databaseUrl);

const password = process.env.DEMO_USER_PASSWORD;
if (!password || password.length < PASSWORD_MIN_LENGTH) {
  throw new Error(`Definir DEMO_USER_PASSWORD con al menos ${PASSWORD_MIN_LENGTH} caracteres`);
}

const prisma = createPrismaClient(databaseUrl);

async function seedUsers() {
  const passwordHash = await hashPassword(password as string);
  const ids = new Map<RoleCode, string>();
  for (const demo of DEMO_USERS) {
    const role = await prisma.role.findUnique({ where: { code: demo.role } });
    if (!role) throw new Error(`Falta el rol ${demo.role}: ejecutar antes npm run db:seed`);
    const existing = await prisma.user.findUnique({ where: { email: demo.email } });
    const user =
      existing ??
      (await prisma.user.create({
        data: {
          email: demo.email,
          name: demo.name,
          passwordHash,
          roles: { create: { roleId: role.id } },
        },
      }));
    if (!existing) {
      await prisma.auditLog.create({
        data: {
          action: 'user.created',
          entityType: 'User',
          entityId: user.id,
          metadata: { source: 'seed-demo' },
        },
      });
    }
    ids.set(demo.role, user.id);
  }
  console.log(`✔ ${DEMO_USERS.length} usuarios DEMO (uno por rol)`);
  return ids;
}

async function seedCatalogAndStock(adminId: string) {
  const already = await prisma.category.findFirst({ where: { name: 'DEMO Anillos' } });
  if (already) {
    console.log('↷ El catálogo DEMO ya existe (no se duplica)');
    return;
  }

  let index = 0;
  for (const categoryName of CATEGORIES) {
    const category = await prisma.category.create({
      data: {
        name: `DEMO ${categoryName}`,
        slug: `demo-${categoryName.toLowerCase()}-${Date.now()}`,
      },
    });

    for (const piece of PIECES[categoryName]) {
      index += 1;
      // Reparto determinista: 1 de cada 4 sin stock, 1 de cada 4 bajo mínimo, el resto disponible.
      const minStock = 2 + (index % 3);
      const quantity = index % 4 === 0 ? 0 : index % 4 === 1 ? minStock : minStock + 3 + index;
      const salePrice = (80 + index * 17.5).toFixed(2);

      await prisma.$transaction(async (tx) => {
        const [counter] = await tx.$queryRaw<{ value: bigint }[]>`
          SELECT nextval('product_variant_sku_seq') AS value`;
        if (!counter) throw new Error('No se pudo asignar un SKU');
        const product = await tx.product.create({
          data: {
            categoryId: category.id,
            name: `DEMO ${categoryName.slice(0, -1)} ${piece}`,
            description: 'Producto ficticio para demostración y pruebas automáticas.',
            variants: {
              create: {
                sku: `SKU-${counter.value.toString().padStart(6, '0')}`,
                label: 'Única',
                salePrice,
                minStock,
              },
            },
          },
          include: { variants: true },
        });
        const variant = product.variants[0];
        if (!variant || quantity === 0) return;

        await tx.inventoryBalance.create({ data: { variantId: variant.id, quantity } });
        const movement = await tx.inventoryMovement.create({
          data: {
            variantId: variant.id,
            type: 'INITIAL_STOCK',
            quantity,
            balanceBefore: 0,
            balanceAfter: quantity,
            reason: 'Stock inicial de demostración',
            userId: adminId,
          },
        });
        await tx.auditLog.create({
          data: {
            action: 'inventory.initial_stock',
            entityType: 'ProductVariant',
            entityId: variant.id,
            userId: adminId,
            after: { quantity, movementId: movement.id.toString() },
            metadata: { source: 'seed-demo' },
          },
        });
      });
    }
  }
  console.log(`✔ ${CATEGORIES.length} categorías y ${index} productos DEMO con stock variado`);
}

/**
 * Ajustes de ejemplo. Requiere `npm run db:seed` (catálogo de motivos). Las líneas se escriben ya
 * resueltas por inserción directa, igual que el stock inicial DEMO; el flujo real pasa por la API.
 */
async function seedAdjustments(managerId: string, adminId: string) {
  if (await prisma.inventoryAdjustment.findFirst({ where: { notes: { startsWith: 'DEMO' } } })) {
    console.log('↷ Los ajustes DEMO ya existen (no se duplican)');
    return;
  }
  const reasons = await prisma.adjustmentReason.findMany();
  const reasonId = (code: string) => {
    const reason = reasons.find((item) => item.code === code);
    if (!reason) throw new Error(`Falta el motivo ${code}: ejecutar antes npm run db:seed`);
    return reason.id;
  };
  const variantOf = async (productName: string) => {
    const variant = await prisma.productVariant.findFirst({
      where: { product: { name: { endsWith: ` ${productName}` } } },
      include: { inventory: true },
    });
    if (!variant) throw new Error(`Falta la variante de «${productName}»: seed-demo incompleto`);
    return { ...variant, quantity: variant.inventory?.quantity ?? 0 };
  };

  // 1) Pendiente: rotura de una pieza (salida).
  const broken = await variantOf('Cruz Clásica');
  await prisma.inventoryAdjustment.create({
    data: {
      reasonId: reasonId('BREAKAGE'),
      notes: 'DEMO: cierre roto al exhibir la pieza',
      requestedById: managerId,
      items: {
        create: [{ variantId: broken.id, quantityDelta: -1, quantityAtRequest: broken.quantity }],
      },
    },
  });
  // 2) Pendiente: error de registro (entrada) con dos líneas.
  const first = await variantOf('Argolla Mediana');
  const second = await variantOf('Trébol');
  await prisma.inventoryAdjustment.create({
    data: {
      reasonId: reasonId('REGISTRATION_ERROR'),
      notes: 'DEMO: el conteo del estante mostró piezas sin registrar',
      requestedById: managerId,
      items: {
        create: [
          { variantId: first.id, quantityDelta: 2, quantityAtRequest: first.quantity },
          { variantId: second.id, quantityDelta: 1, quantityAtRequest: second.quantity },
        ],
      },
    },
  });
  // 3) Aprobado: muestra entregada a una clienta (salida de 1 pieza con stock sobrado).
  const sample = await variantOf('Corazón');
  const after = sample.quantity - 1;
  await prisma.$transaction(async (tx) => {
    const adjustment = await tx.inventoryAdjustment.create({
      data: {
        status: 'APPROVED',
        reasonId: reasonId('SAMPLE'),
        notes: 'DEMO: muestra entregada para fotografía',
        requestedById: managerId,
        resolvedById: adminId,
        resolvedAt: new Date(),
      },
    });
    const movement = await tx.inventoryMovement.create({
      data: {
        variantId: sample.id,
        type: 'ADJUSTMENT',
        quantity: -1,
        balanceBefore: sample.quantity,
        balanceAfter: after,
        unitCost: sample.costPrice,
        referenceType: 'INVENTORY_ADJUSTMENT',
        referenceId: adjustment.id,
        reason: `Ajuste AJ-${adjustment.number.toString().padStart(6, '0')} · Muestra`,
        notes: 'DEMO: muestra entregada para fotografía',
        userId: adminId,
      },
    });
    await tx.inventoryBalance.update({
      where: { variantId: sample.id },
      data: { quantity: after },
    });
    await tx.inventoryAdjustmentItem.create({
      data: {
        adjustmentId: adjustment.id,
        variantId: sample.id,
        quantityDelta: -1,
        quantityAtRequest: sample.quantity,
        balanceBefore: sample.quantity,
        balanceAfter: after,
        unitCost: sample.costPrice,
        movementId: movement.id,
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'inventory_adjustment.approved',
        entityType: 'InventoryAdjustment',
        entityId: adjustment.id,
        userId: adminId,
        after: { status: 'APPROVED', movementId: movement.id.toString() },
        metadata: { source: 'seed-demo' },
      },
    });
  });
  console.log('✔ 3 ajustes DEMO (2 pendientes, 1 aprobado)');
}

try {
  const ids = await seedUsers();
  const adminId = ids.get(ROLES.ADMIN);
  const managerId = ids.get(ROLES.INVENTORY_MANAGER);
  if (!adminId || !managerId) throw new Error('No se crearon los usuarios DEMO');
  await seedCatalogAndStock(adminId);
  await seedAdjustments(managerId, adminId);
} finally {
  await prisma.$disconnect();
}
