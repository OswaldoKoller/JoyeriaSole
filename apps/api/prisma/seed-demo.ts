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
 *   - Dos conteos físicos de ejemplo (ADR-021): uno APROBADO sin diferencias (DEMO Pulseras, no genera
 *     movimientos) y uno EN CAPTURA a ciegas (DEMO Collares, con algunas lecturas). Ninguno altera el stock.
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

/**
 * Conteos físicos de ejemplo (ADR-021). Se escriben por inserción directa, como el stock inicial DEMO;
 * el flujo real pasa por la API. Ninguno genera movimientos de stock: el aprobado no tuvo diferencias
 * y el otro sigue en captura. Dejan DEMO Pulseras libre de conteos activos y DEMO Collares ocupada.
 */
async function seedCounts(managerId: string, adminId: string) {
  if (await prisma.inventoryCount.findFirst({ where: { notes: { startsWith: 'DEMO' } } })) {
    console.log('↷ Los conteos DEMO ya existen (no se duplican)');
    return;
  }
  const snapshot = async (categoryName: string) => {
    const category = await prisma.category.findFirst({ where: { name: categoryName } });
    if (!category) throw new Error(`Falta la categoría «${categoryName}»: seed-demo incompleto`);
    const variants = await prisma.productVariant.findMany({
      where: { product: { categoryId: category.id } },
      include: { inventory: true },
      orderBy: { sku: 'asc' },
    });
    const cursors = await prisma.inventoryMovement.groupBy({
      by: ['variantId'],
      where: { variantId: { in: variants.map((variant) => variant.id) } },
      _max: { id: true },
    });
    const cursorOf = new Map(cursors.map((row) => [row.variantId, row._max.id ?? 0n]));
    return {
      category,
      lines: variants.map((variant) => ({
        variant,
        quantity: variant.inventory?.quantity ?? 0,
        cursor: cursorOf.get(variant.id) ?? 0n,
      })),
    };
  };

  // 1) Aprobado sin diferencias: lo contado coincide con el sistema, no hay movimientos.
  const closed = await snapshot('DEMO Pulseras');
  const when = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const approved = await prisma.inventoryCount.create({
    data: {
      status: 'APPROVED',
      categoryId: closed.category.id,
      scope: closed.category.name,
      notes: 'DEMO: conteo de pulseras sin diferencias',
      operatorId: managerId,
      createdById: managerId,
      approvedById: adminId,
      startedAt: when,
      firstClosedAt: when,
      reviewAt: when,
      approvedAt: when,
    },
  });
  await prisma.inventoryCountItem.createMany({
    data: closed.lines.map((line) => ({
      inventoryCountId: approved.id,
      variantId: line.variant.id,
      systemQty: line.quantity,
      snapshotCursor: line.cursor,
      countedQty: line.quantity,
      countedCursor: line.cursor,
      countedById: managerId,
      countedAt: when,
      expectedQty: line.quantity,
      finalQty: line.quantity,
      reconciledMovements: 0,
      difference: 0,
      balanceBefore: line.quantity,
      balanceAfter: line.quantity,
      unitCost: line.variant.costPrice,
    })),
  });
  await prisma.auditLog.create({
    data: {
      action: 'inventory_count.approved',
      entityType: 'InventoryCount',
      entityId: approved.id,
      userId: adminId,
      after: { status: 'APPROVED', adjustments: [] },
      metadata: { source: 'seed-demo' },
    },
  });

  // 2) En captura: foto tomada y algunas lecturas del operador (la API no muestra el sistema).
  const open = await snapshot('DEMO Collares');
  const started = new Date(Date.now() - 60 * 60 * 1000);
  const capturing = await prisma.inventoryCount.create({
    data: {
      status: 'IN_PROGRESS',
      categoryId: open.category.id,
      scope: open.category.name,
      notes: 'DEMO: conteo de collares en captura',
      operatorId: managerId,
      createdById: managerId,
      startedAt: started,
    },
  });
  await prisma.inventoryCountItem.createMany({
    data: open.lines.map((line) => ({
      inventoryCountId: capturing.id,
      variantId: line.variant.id,
      systemQty: line.quantity,
      snapshotCursor: line.cursor,
    })),
  });
  for (const line of open.lines.slice(0, 2)) {
    const counted = Math.min(2, line.quantity);
    if (counted === 0) continue;
    await prisma.inventoryCountItem.update({
      where: {
        inventoryCountId_variantId: { inventoryCountId: capturing.id, variantId: line.variant.id },
      },
      data: {
        countedQty: counted,
        countedCursor: line.cursor,
        countedById: managerId,
        countedAt: started,
      },
    });
    for (let piece = 1; piece <= counted; piece += 1) {
      await prisma.inventoryCountScan.create({
        data: {
          inventoryCountId: capturing.id,
          round: 1,
          variantId: line.variant.id,
          code: line.variant.sku,
          source: 'SCAN',
          delta: 1,
          quantityAfter: piece,
          movementCursor: line.cursor,
          userId: managerId,
          createdAt: started,
        },
      });
    }
  }
  await prisma.auditLog.create({
    data: {
      action: 'inventory_count.started',
      entityType: 'InventoryCount',
      entityId: capturing.id,
      userId: managerId,
      after: { status: 'IN_PROGRESS', variants: open.lines.length },
      metadata: { source: 'seed-demo' },
    },
  });
  console.log('✔ 2 conteos DEMO (1 aprobado sin diferencias, 1 en captura)');
}

try {
  const ids = await seedUsers();
  const adminId = ids.get(ROLES.ADMIN);
  const managerId = ids.get(ROLES.INVENTORY_MANAGER);
  if (!adminId || !managerId) throw new Error('No se crearon los usuarios DEMO');
  await seedCatalogAndStock(adminId);
  await seedAdjustments(managerId, adminId);
  await seedCounts(managerId, adminId);
} finally {
  await prisma.$disconnect();
}
