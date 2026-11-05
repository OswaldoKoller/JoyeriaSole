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
 *   - 2 proveedores ficticios: uno nacional (Bs) y uno del exterior (China, USD).
 *   - Un ingreso de importación CONFIRMADO en USD (aduanización y comisiones) y un borrador, sobre
 *     piezas ya disponibles (no alteran los totales de disponibles / bajo mínimo / sin stock).
 *
 * Idempotente: si los datos DEMO ya existen, no los duplica.
 */
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

try {
  const ids = await seedUsers();
  const adminId = ids.get(ROLES.ADMIN);
  if (!adminId) throw new Error('No se creó el administrador DEMO');
  await seedCatalogAndStock(adminId);
  await seedSuppliers(adminId);
  const managerId = ids.get(ROLES.INVENTORY_MANAGER);
  if (!managerId) throw new Error('No se creó el responsable de inventario DEMO');
  await seedImportEntries(managerId);
} finally {
  await prisma.$disconnect();
}
