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
 *
 * Idempotente: si los datos DEMO ya existen, no los duplica.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { PASSWORD_MIN_LENGTH, ROLES, type RoleCode } from '@joyeria/shared';
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

try {
  const ids = await seedUsers();
  const adminId = ids.get(ROLES.ADMIN);
  if (!adminId) throw new Error('No se creó el administrador DEMO');
  await seedCatalogAndStock(adminId);
} finally {
  await prisma.$disconnect();
}
