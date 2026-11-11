import { randomUUID } from 'node:crypto';
import {
  BUSINESS_SETTINGS_DEFAULTS,
  REFERENCE_TYPES,
  SYSTEM_PAYMENT_METHODS,
  type PaymentMethodCode,
} from '@joyeria/shared';
import type { PrismaClient } from '../../src/lib/prisma.ts';
import { applyStockChanges } from '../../src/modules/inventory/stock-ledger.ts';
import { setStock } from './stock.ts';

/**
 * Datos de prueba de ventas y caja. `resetDatabase` vacía también lo que siembra la migración
 * (medios de pago y datos del negocio), así que cada prueba los vuelve a crear con estas funciones.
 */

/** Siembra los tres medios de pago del sistema y devuelve su id por código. */
export async function seedPaymentMethods(prisma: PrismaClient) {
  const ids = new Map<PaymentMethodCode, { id: string; isCash: boolean; name: string }>();
  for (const method of SYSTEM_PAYMENT_METHODS) {
    const row = await prisma.paymentMethod.upsert({
      where: { code: method.code },
      update: {},
      create: { ...method, isSystem: true },
    });
    ids.set(method.code, { id: row.id, isCash: row.isCash, name: row.name });
  }
  return ids;
}

/** Fila única de datos del negocio con los valores provisionales. */
export function seedBusinessSettings(prisma: PrismaClient) {
  return prisma.businessSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, ...BUSINESS_SETTINGS_DEFAULTS },
  });
}

let counter = 0;

/** Variante ACTIVA con precio, costo y stock (registrado con el libro real). */
export async function createSellableVariant(
  prisma: PrismaClient,
  options: {
    price?: string;
    cost?: string;
    stock?: number;
    label?: string | null;
    productName?: string;
    userId?: string;
  } = {},
) {
  counter += 1;
  const tag = `${String(counter)}-${randomUUID().slice(0, 8)}`;
  const category = await prisma.category.create({
    data: { name: `Categoría ${tag}`, slug: `categoria-${tag}` },
  });
  const product = await prisma.product.create({
    data: { categoryId: category.id, name: options.productName ?? `Anillo ${tag}` },
  });
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `VTA-SKU-${tag}`,
      barcode: `779${tag.replace(/[^0-9a-f]/g, '')}`,
      label: options.label === undefined ? 'Plata 925 / Talla 16' : options.label,
      salePrice: options.price ?? '150.00',
      costPrice: options.cost ?? '60.0000',
      status: 'ACTIVE',
    },
  });
  if (options.stock !== undefined) {
    await setStock(prisma, variant.id, options.stock, { userId: options.userId });
  }
  return variant;
}

/** Abre una sesión de caja directamente en la base (para pruebas que no prueban la apertura). */
export function openCashSessionDirect(prisma: PrismaClient, userId: string, openingAmount = '100') {
  return prisma.cashSession.create({
    data: { openedById: userId, openingAmount, openRequestId: randomUUID() },
  });
}

export const balanceOf = async (prisma: PrismaClient, variantId: string) =>
  (await prisma.inventoryBalance.findUnique({ where: { variantId } }))?.quantity ?? 0;

export interface DirectPayment {
  methodId: string;
  isCash: boolean;
  name: string;
  amount: string;
  /** Solo efectivo: recibido (por defecto, igual al importe). */
  tendered?: string;
}

/**
 * Registra una venta válida DIRECTAMENTE (libro real + filas de venta en una transacción), sin la
 * API. Solo para pruebas de la base y de la caja que no dependen del servicio de ventas. Con
 * `quantity`/`unitPrice`/`cashMethodId` registra una línea pagada en efectivo; con `lines` y
 * `payments`, cualquier combinación.
 */
export async function insertSaleDirect(
  prisma: PrismaClient,
  input: {
    sessionId: string;
    userId: string;
    variantId?: string;
    quantity?: number;
    unitPrice?: string;
    unitCost?: string;
    cashMethodId?: string;
    lines?: { variantId: string; quantity: number; unitPrice: string; unitCost?: string }[];
    payments?: DirectPayment[];
  },
) {
  const [row] = await prisma.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS id`;
  if (!row) throw new Error('uuidv7() no devolvió un id');
  const saleId = row.id;
  const lines = input.lines ?? [
    {
      variantId: input.variantId ?? '',
      quantity: input.quantity ?? 1,
      unitPrice: input.unitPrice ?? '150.00',
      unitCost: input.unitCost,
    },
  ];
  const cents = (value: string) => Math.round(Number(value) * 100);
  const totalCents = lines.reduce((sum, l) => sum + l.quantity * cents(l.unitPrice), 0);
  const total = (totalCents / 100).toFixed(2);
  const payments: DirectPayment[] = input.payments ?? [
    { methodId: input.cashMethodId ?? '', isCash: true, name: 'Efectivo', amount: total },
  ];
  await prisma.$transaction(async (tx) => {
    const applied = await applyStockChanges(
      tx,
      lines.map((line) => ({
        variantId: line.variantId,
        type: 'SALE' as const,
        quantity: -line.quantity,
        unitCost: line.unitCost ?? '60.0000',
        referenceType: REFERENCE_TYPES.SALE,
        referenceId: saleId,
        userId: input.userId,
      })),
    );
    await tx.sale.create({
      data: {
        id: saleId,
        cashSessionId: input.sessionId,
        sellerId: input.userId,
        sellerName: 'Vendedora de prueba',
        total,
        clientRequestId: randomUUID(),
        requestHash: 'a'.repeat(64),
      },
    });
    for (const [index, line] of lines.entries()) {
      const movement = applied[index];
      if (!movement) throw new Error('Falta el movimiento de una línea');
      await tx.saleItem.create({
        data: {
          saleId,
          variantId: line.variantId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: ((line.quantity * cents(line.unitPrice)) / 100).toFixed(2),
          unitCostSnapshot: line.unitCost ?? '60.0000',
          sku: 'SKU',
          productName: 'Producto',
          movementId: movement.movementId,
        },
      });
    }
    for (const payment of payments) {
      const tendered = payment.tendered ?? payment.amount;
      await tx.salePayment.create({
        data: {
          saleId,
          methodId: payment.methodId,
          methodIsCash: payment.isCash,
          methodName: payment.name,
          amount: payment.amount,
          tenderedAmount: payment.isCash ? tendered : null,
          changeGiven: payment.isCash
            ? ((cents(tendered) - cents(payment.amount)) / 100).toFixed(2)
            : null,
        },
      });
    }
  });
  return saleId;
}
