/**
 * Datos de DEMOSTRACIÓN y E2E (ficticios, marcados con «DEMO»). Nunca en producción.
 *   npm run db:seed:demo        (requiere antes: npm run db:seed)
 *
 * Crea:
 *   - Un usuario por rol: Administrador, Responsable de inventario y Vendedor, todos con la
 *     contraseña DEMO_USER_PASSWORD (mínimo 10 caracteres, P-19).
 *   - 4 categorías y 20 productos (una variante cada uno, SKU correlativo, precio neto en Bs).
 *     Un producto queda sin precio y tres sin descripción, para ilustrar los indicadores de ficha.
 *     Los dos primeros llevan una foto sintética pequeña (S3).
 *   - Stock variado mediante movimientos INITIAL_STOCK auditados: nunca editando saldos (ADR-007).
 *     Reparto: 5 sin stock, 5 bajo mínimo, 10 disponibles.
 *   - Tres ajustes de inventario de ejemplo (ADR-017): dos PENDIENTES (el stock no cambia) y uno
 *     APROBADO (movimiento ADJUSTMENT auditado). No alteran el nivel (sin stock / bajo / disponible)
 *     de ninguna pieza, para no mover los totales del dashboard.
 *   - 2 proveedores ficticios: uno nacional (Bs) y uno del exterior (China, USD).
 *   - Un ingreso de importación CONFIRMADO en USD (aduanización y comisiones) y un borrador, sobre
 *     piezas ya disponibles (no alteran los totales de disponibles / bajo mínimo / sin stock).
 *   - Dos conteos físicos de ejemplo (ADR-021): uno APROBADO sin diferencias (DEMO Pulseras, no genera
 *     movimientos) y uno EN CAPTURA a ciegas (DEMO Collares, con algunas lecturas). Ninguno altera el stock.
 *
 * Idempotente: si los datos DEMO ya existen, no los duplica.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  PASSWORD_MIN_LENGTH,
  ROLES,
  computeEntryCosts,
  convertToBob,
  formatMoney,
  formatUnitCost,
  parseExchangeRate,
  parseMoney,
  parseUnitCost,
  todayInLaPaz,
  type RoleCode,
} from '@joyeria/shared';
import { config as loadEnv } from 'dotenv';
import sharp from 'sharp';
import type { Prisma } from '../src/generated/prisma/client.ts';
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

const DEMO_SUPPLIERS = [
  {
    name: 'Proveedor Demo La Paz',
    type: 'NATIONAL',
    country: 'Bolivia',
    contactName: 'DEMO Contacto Nacional',
    phone: '+591 70000000',
    whatsapp: '+591 70000000',
    defaultCurrency: 'BOB',
    paymentTerms: 'Contado contra entrega',
  },
  {
    name: 'Proveedor Demo Guangzhou',
    type: 'FOREIGN',
    country: 'China',
    contactName: 'DEMO Contacto Exterior',
    whatsapp: '+86 130 0000 0000',
    email: 'ventas@proveedor-demo.example.invalid',
    defaultCurrency: 'USD',
    paymentTerms: '50% anticipo y 50% contra embarque',
  },
] as const;

async function seedSuppliers(adminId: string) {
  let created = 0;
  for (const demo of DEMO_SUPPLIERS) {
    // El nombre no es único en el modelo: la existencia se decide por nombre para ser idempotente.
    if (await prisma.supplier.findFirst({ where: { name: demo.name } })) continue;
    const supplier = await prisma.supplier.create({ data: demo });
    await prisma.auditLog.create({
      data: {
        action: 'supplier.created',
        entityType: 'Supplier',
        entityId: supplier.id,
        userId: adminId,
        after: { name: supplier.name, type: supplier.type },
        metadata: { source: 'seed-demo' },
      },
    });
    created += 1;
  }
  console.log(
    created > 0
      ? `✔ ${created} proveedores DEMO (nacional y del exterior)`
      : '↷ Los proveedores DEMO ya existen (no se duplican)',
  );
}

/** Foto sintética 240×240 (color liso con un círculo) guardada como WebP: pesa < 2 KB. */
async function seedDemoPhoto(
  tx: Prisma.TransactionClient,
  productId: string,
  userId: string,
  seed: number,
) {
  const color = seed === 1 ? '#b8860b' : '#708090';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="${color}"/><circle cx="120" cy="120" r="60" fill="none" stroke="#fff" stroke-width="14"/></svg>`;
  const bytes = await sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
  const photo = await tx.productPhoto.create({
    data: {
      productId,
      contentType: 'image/webp',
      width: 240,
      height: 240,
      sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      position: 0,
      isCover: true,
      createdById: userId,
    },
  });
  await tx.productPhotoBlob.create({ data: { photoId: photo.id, bytes: new Uint8Array(bytes) } });
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
      // Para ilustrar los indicadores de ficha (C1, D9): el producto 4 queda sin precio y los
      // productos 6, 12 y 18 sin descripción ni características («Ficha incompleta»).
      const salePrice = index === 4 ? '0' : (80 + index * 17.5).toFixed(2);
      const description =
        index % 6 === 0 ? null : 'Producto ficticio para demostración y pruebas automáticas.';

      await prisma.$transaction(async (tx) => {
        const [counter] = await tx.$queryRaw<{ value: bigint }[]>`
          SELECT nextval('product_variant_sku_seq') AS value`;
        if (!counter) throw new Error('No se pudo asignar un SKU');
        const product = await tx.product.create({
          data: {
            categoryId: category.id,
            name: `DEMO ${categoryName.slice(0, -1)} ${piece}`,
            description,
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
        // Los dos primeros productos llevan una foto sintética pequeña (S3): sin binarios en el repo.
        if (index <= 2) await seedDemoPhoto(tx, product.id, adminId, index);
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

const IMPORT_DOCUMENT = 'DEMO-IMP-001';
const IMPORT_DRAFT_DOCUMENT = 'DEMO-IMP-002';

/**
 * Compra de importación DEMO (S5): un ingreso CONFIRMADO en dólares con aduanización y comisiones, y
 * un borrador. Usa piezas que ya están «disponibles» y solo les SUMA stock: los totales del
 * dashboard (disponibles / bajo mínimo / sin stock) no cambian. El stock entra por movimientos
 * auditados, nunca editando saldos (ADR-007).
 */
async function seedImportEntries(managerId: string) {
  if (await prisma.stockEntry.findFirst({ where: { documentNumber: IMPORT_DOCUMENT } })) {
    console.log('↷ Los ingresos de importación DEMO ya existen (no se duplican)');
    return;
  }
  const foreign = await prisma.supplier.findFirst({ where: { name: 'Proveedor Demo Guangzhou' } });
  const pieces = await prisma.productVariant.findMany({
    where: {
      product: {
        name: {
          in: ['DEMO Anillo Alianza Lisa', 'DEMO Anillo Sello Ónix', 'DEMO Collare Cruz Clásica'],
        },
      },
    },
    include: { product: true, inventory: true },
    orderBy: { sku: 'asc' },
  });
  const types = await prisma.stockEntryCostType.findMany();
  const typeId = (code: string) => types.find((type) => type.code === code)?.id;
  const customs = typeId('CUSTOMS');
  const commissions = typeId('COMMISSIONS');
  const transport = typeId('TRANSPORT');
  if (!foreign || pieces.length < 3 || !customs || !commissions || !transport) {
    console.log('↷ Faltan proveedores, piezas o tipos de costo DEMO: se omiten los ingresos DEMO');
    return;
  }

  const rate = '6.96';
  const prices = ['4.50', '7.25', '1.80'];
  const quantities = [20, 12, 30];
  const extras = [
    { costTypeId: customs, amount: '150.00', note: 'DUI y despachante (DEMO)' },
    { costTypeId: commissions, amount: '85.50', note: 'Comisión del agente (DEMO)' },
  ];
  const costs = computeEntryCosts({
    currency: 'USD',
    exchangeRate: parseExchangeRate(rate),
    items: pieces.map((piece, index) => ({
      key: piece.id,
      receivedQty: quantities[index] ?? 0,
      unitPrice: parseUnitCost(prices[index] ?? '0'),
    })),
    extrasCents: extras.reduce((sum, cost) => sum + parseMoney(cost.amount), 0n),
  });
  if (!costs.ok) throw new Error('No se pudo calcular el costo del ingreso DEMO');

  await prisma.$transaction(async (tx) => {
    const confirmed = await tx.stockEntry.create({
      data: {
        supplierId: foreign.id,
        status: 'CONFIRMED',
        documentType: 'Factura de importación',
        documentNumber: IMPORT_DOCUMENT,
        documentDate: new Date(`${todayInLaPaz()}T00:00:00Z`),
        currency: 'USD',
        exchangeRate: rate,
        notes: 'Ingreso de demostración en dólares (aduanización y comisiones).',
        createdById: managerId,
        confirmedById: managerId,
        confirmedAt: new Date(),
        costs: { create: extras },
      },
    });
    for (const [index, piece] of pieces.entries()) {
      const line = costs.lines.find((item) => item.key === piece.id);
      const quantity = quantities[index] ?? 0;
      if (!line) throw new Error('Línea de costo no encontrada');
      await tx.stockEntryItem.create({
        data: {
          stockEntryId: confirmed.id,
          variantId: piece.id,
          expectedQty: quantity,
          receivedQty: quantity,
          unitPrice: prices[index] ?? '0',
          unitCost: formatUnitCost(line.unitCostBob),
          unitExtraCost: formatUnitCost(line.unitExtra),
          extraCostAllocated: formatMoney(line.extraCents),
          totalCost: formatUnitCost(line.totalCost),
        },
      });
      const before = piece.inventory?.quantity ?? 0;
      await tx.inventoryMovement.create({
        data: {
          variantId: piece.id,
          type: 'STOCK_ENTRY',
          quantity,
          balanceBefore: before,
          balanceAfter: before + quantity,
          unitCost: formatUnitCost(line.unitTotal),
          referenceType: 'STOCK_ENTRY',
          referenceId: confirmed.id,
          reason: `Ingreso ING-${confirmed.number.toString().padStart(6, '0')}`,
          userId: managerId,
        },
      });
      await tx.inventoryBalance.upsert({
        where: { variantId: piece.id },
        update: { quantity: before + quantity },
        create: { variantId: piece.id, quantity: before + quantity },
      });
      await tx.productVariant.update({
        where: { id: piece.id },
        data: { costPrice: formatUnitCost(line.unitTotal) },
      });
    }
    await tx.auditLog.create({
      data: {
        action: 'stock_entry.confirmed',
        entityType: 'StockEntry',
        entityId: confirmed.id,
        userId: managerId,
        after: {
          status: 'CONFIRMED',
          currency: 'USD',
          exchangeRate: rate,
          extrasTotal: formatMoney(costs.totals.extrasCents),
        },
        metadata: { source: 'seed-demo' },
      },
    });

    // Borrador: dos piezas, una con diferencia ya justificada, listo para revisar y confirmar.
    const draft = await tx.stockEntry.create({
      data: {
        supplierId: foreign.id,
        documentType: 'Factura de importación',
        documentNumber: IMPORT_DRAFT_DOCUMENT,
        currency: 'USD',
        exchangeRate: rate,
        notes: 'Borrador de demostración: pendiente de confirmar.',
        createdById: managerId,
        costs: { create: [{ costTypeId: transport, amount: '40.00' }] },
      },
    });
    for (const [index, piece] of pieces.slice(0, 2).entries()) {
      const price = index === 0 ? '3.10' : '5.40';
      await tx.stockEntryItem.create({
        data: {
          stockEntryId: draft.id,
          variantId: piece.id,
          expectedQty: 10,
          receivedQty: index === 0 ? 10 : 8,
          differenceReason: index === 0 ? null : 'Faltaron 2 piezas en la caja (DEMO)',
          unitPrice: price,
          unitCost: formatUnitCost(convertToBob(parseUnitCost(price), parseExchangeRate(rate))),
        },
      });
    }
    await tx.auditLog.create({
      data: {
        action: 'stock_entry.created',
        entityType: 'StockEntry',
        entityId: draft.id,
        userId: managerId,
        after: { status: 'DRAFT', currency: 'USD', exchangeRate: rate },
        metadata: { source: 'seed-demo' },
      },
    });
  });
  console.log('✔ Ingreso de importación DEMO confirmado en USD y un borrador');
}

/**
 * Cambios de precio DEMO (S7, ADR-018): un cambio aprobado de una solicitud, un cambio directo del
 * Administrador, una solicitud rechazada y dos pendientes, sobre piezas que ningún E2E usa para
 * precios. No tocan stock: los totales del dashboard no cambian. Quedan en auditoría.
 */
async function seedPriceChanges(adminId: string, managerId: string) {
  if (await prisma.priceChange.findFirst({ where: { reason: { startsWith: 'DEMO' } } })) {
    console.log('↷ Los cambios de precio DEMO ya existen (no se duplican)');
    return;
  }
  const names = [
    'DEMO Arete Estrella',
    'DEMO Arete Gota Cristal',
    'DEMO Pulsera Tenis',
    'DEMO Collare Corazón',
    'DEMO Collare Perla Simple',
  ];
  const variants = await prisma.productVariant.findMany({
    where: { product: { name: { in: names } } },
    include: { product: true },
  });
  const byName = (name: string) => variants.find((variant) => variant.product.name === name);
  const [approved, direct, rejected, pendingA, pendingB] = names.map(byName);
  if (!approved || !direct || !rejected || !pendingA || !pendingB) {
    console.log('↷ Faltan piezas DEMO: se omiten los cambios de precio DEMO');
    return;
  }

  const bump = (price: { toFixed: (digits: number) => string }, amount: number) =>
    (Number(price.toFixed(2)) + amount).toFixed(2);

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const audit = (action: string, entityId: string, userId: string, after: object) =>
      tx.auditLog.create({
        data: {
          action,
          entityType: 'PriceChange',
          entityId,
          userId,
          after,
          metadata: { source: 'seed-demo' },
        },
      });

    // 1) Solicitado por el Responsable y aprobado por el Administrador.
    const approvedPrice = bump(approved.salePrice, 12);
    const first = await tx.priceChange.create({
      data: {
        variantId: approved.id,
        previousPrice: approved.salePrice,
        newPrice: approvedPrice,
        status: 'APPROVED',
        origin: 'REQUEST',
        requestedById: managerId,
        decidedById: adminId,
        decidedAt: now,
        reason: 'DEMO Ajuste de temporada',
        costSnapshot: approved.costPrice,
      },
    });
    await tx.productVariant.update({
      where: { id: approved.id },
      data: { salePrice: approvedPrice },
    });
    await audit('price.approved', first.id, adminId, {
      status: 'APPROVED',
      newPrice: approvedPrice,
    });

    // 2) Cambio directo del Administrador.
    const directPrice = bump(direct.salePrice, -8);
    const second = await tx.priceChange.create({
      data: {
        variantId: direct.id,
        previousPrice: direct.salePrice,
        newPrice: directPrice,
        status: 'APPROVED',
        origin: 'ADMIN_DIRECT',
        requestedById: adminId,
        decidedById: adminId,
        decidedAt: now,
        reason: 'DEMO Promoción del mes',
        costSnapshot: direct.costPrice,
      },
    });
    await tx.productVariant.update({ where: { id: direct.id }, data: { salePrice: directPrice } });
    await audit('variant.price_changed', second.id, adminId, {
      origin: 'ADMIN_DIRECT',
      newPrice: directPrice,
    });

    // 3) Solicitud rechazada con comentario.
    const third = await tx.priceChange.create({
      data: {
        variantId: rejected.id,
        previousPrice: rejected.salePrice,
        newPrice: bump(rejected.salePrice, 60),
        status: 'REJECTED',
        origin: 'REQUEST',
        requestedById: managerId,
        decidedById: adminId,
        decidedAt: now,
        reason: 'DEMO Subir precio',
        decisionComment: 'DEMO Aumento demasiado alto para la temporada',
        costSnapshot: rejected.costPrice,
      },
    });
    await audit('price.rejected', third.id, adminId, { status: 'REJECTED' });

    // 4) y 5) Pendientes de aprobación.
    for (const [variant, amount] of [
      [pendingA, 25],
      [pendingB, 15],
    ] as const) {
      const pending = await tx.priceChange.create({
        data: {
          variantId: variant.id,
          previousPrice: variant.salePrice,
          newPrice: bump(variant.salePrice, amount),
          origin: 'REQUEST',
          requestedById: managerId,
          reason: 'DEMO Pendiente de aprobación',
          costSnapshot: variant.costPrice,
        },
      });
      await audit('price.requested', pending.id, managerId, { status: 'PENDING' });
    }
  });
  console.log('✔ Cambios de precio DEMO: 2 aprobados, 1 rechazado y 2 pendientes');
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
  await seedSuppliers(adminId);
  await seedImportEntries(managerId);
  await seedPriceChanges(adminId, managerId);
  await seedCounts(managerId, adminId);
} finally {
  await prisma.$disconnect();
}
