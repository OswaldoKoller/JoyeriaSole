/**
 * Cambio de pieza de una venta (ADR-026). Política de la tienda: NO hay devoluciones; solo se
 * cambia una pieza por otra de IGUAL O MAYOR precio, con el comprobante de la venta. Estas pruebas
 * cubren permisos, validación, reglas de precio, stock por el libro, cobro de la diferencia y su
 * efecto en el arqueo, idempotencia, concurrencia, visibilidad, ausencia de costos y las garantías
 * de la base de datos (inmutabilidad y sumas que deben cuadrar).
 */
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_ROLE_PERMISSIONS,
  ERROR_CODES,
  REFERENCE_TYPES,
  type Permission,
} from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';
import { assertLedgerInvariant } from '../helpers/ledger.ts';
import { balanceOf, createSellableVariant, seedPaymentMethods } from '../helpers/sales.ts';

const EXCHANGES = '/api/v1/sale-exchanges';
const MANAGER = [...DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions];
const SELLER = [...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions];

// Cada escenario crea usuarios con Argon2 y varias sesiones: en una PC lenta supera los 20 s por defecto.
vi.setConfig({ testTimeout: 120_000 });

let app: App;
beforeEach(async () => {
  app = await buildTestApp();
  await resetDatabase(app.prisma);
  await seedPaymentMethods(app.prisma);
});
afterEach(() => app.close());

async function sessionWith(permissions: Permission[]) {
  const { user, password } = await createTestUser(app.prisma, { permissions });
  const { cookie } = await login(app, user.email, password);
  return { user, cookie };
}

const post = (url: string, cookie: string, payload: unknown, key: string | null = randomUUID()) =>
  app.inject({
    method: 'POST',
    url,
    headers: { cookie, ...(key && { 'idempotency-key': key }) },
    payload: payload as object,
  });

const get = (url: string, cookie: string) =>
  app.inject({ method: 'GET', url, headers: { cookie } });

async function openCash(cookie: string, openingAmount = '100') {
  const res = await post('/api/v1/cash/sessions', cookie, { openingAmount });
  expect(res.statusCode).toBe(201);
  return res.json().data as { id: string; number: number };
}

interface SoldSale {
  id: string;
  number: number;
  itemId: string;
}

/** Vende `quantity` unidades de la variante en efectivo y devuelve la venta y su línea. */
async function sellCash(cookie: string, variantId: string, quantity: number, price = '150.00') {
  const total = (Number(price) * quantity).toFixed(2);
  const res = await post('/api/v1/sales', cookie, {
    items: [{ variantId, quantity, expectedUnitPrice: price }],
    payments: [{ methodCode: 'CASH', amount: total, tendered: total }],
    expectedTotal: total,
  });
  expect(res.statusCode).toBe(201);
  const sale = res.json().data as { id: string; number: number };
  const item = await app.prisma.saleItem.findFirstOrThrow({ where: { saleId: sale.id } });
  return { id: sale.id, number: sale.number, itemId: item.id } satisfies SoldSale;
}

function exchangeBody(
  sale: SoldSale,
  deliveredVariantId: string,
  deliveredPrice: string,
  extra: Record<string, unknown> = {},
) {
  return {
    saleId: sale.id,
    sourceItemId: sale.itemId,
    deliveredVariantId,
    quantity: 1,
    expectedDeliveredUnitPrice: deliveredPrice,
    payments: [],
    ...extra,
  };
}

const cashPayment = (amount: string, tendered = amount) => ({
  methodCode: 'CASH',
  amount,
  tendered,
});

/** Recorre un objeto JSON y devuelve las claves que mencionan costos. */
function costKeys(value: unknown, path = ''): string[] {
  if (Array.isArray(value))
    return value.flatMap((item, i) => costKeys(item, `${path}[${String(i)}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => [
      ...(/cost/i.test(key) ? [`${path}.${key}`] : []),
      ...costKeys(item, `${path}.${key}`),
    ]);
  }
  return [];
}

/** Escenario base: caja abierta, un vendedor y una venta de 2 unidades de una pieza a Bs 150. */
async function scenario(options: { stockOld?: number; stockNew?: number; newPrice?: string } = {}) {
  const manager = await sessionWith(MANAGER);
  const seller = await sessionWith(SELLER);
  const cash = await openCash(manager.cookie, '100');
  const oldPiece = await createSellableVariant(app.prisma, {
    stock: options.stockOld ?? 5,
    label: 'Talla 10',
    productName: 'Anillo solitario',
    userId: manager.user.id,
  });
  const newPiece = await createSellableVariant(app.prisma, {
    stock: options.stockNew ?? 5,
    price: options.newPrice ?? '150.00',
    label: 'Talla 12',
    productName: 'Anillo solitario',
    userId: manager.user.id,
  });
  const sale = await sellCash(seller.cookie, oldPiece.id, 2);
  return { manager, seller, cash, oldPiece, newPiece, sale };
}

describe('permisos y validación', () => {
  it('401 sin sesión y 403 sin sales:exchange; 400 sin clave, sin origen, con dos orígenes o con campos extra', async () => {
    const { seller, oldPiece, newPiece, sale } = await scenario();
    const noPermission = await sessionWith(SELLER.filter((p) => p !== 'sales:exchange'));
    const body = exchangeBody(sale, newPiece.id, '150.00');

    expect((await app.inject({ method: 'POST', url: EXCHANGES, payload: body })).statusCode).toBe(
      401,
    );
    for (const url of [
      `${EXCHANGES}/lookup?number=1`,
      EXCHANGES,
      `${EXCHANGES}/${randomUUID()}`,
      `${EXCHANGES}/${randomUUID()}/receipt`,
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(401);
    }
    expect((await post(EXCHANGES, noPermission.cookie, body)).statusCode).toBe(403);
    expect((await get(`${EXCHANGES}/lookup?number=1`, noPermission.cookie)).statusCode).toBe(403);

    const noKey = await post(EXCHANGES, seller.cookie, body, null);
    expect(noKey.statusCode).toBe(400);
    expect(noKey.json().error.code).toBe(ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED);
    const noSource = { ...body } as Record<string, unknown>;
    delete noSource.sourceItemId;
    const bothSources = { ...body, sourceExchangeId: randomUUID() };
    for (const payload of [
      noSource,
      bothSources,
      { ...body, quantity: 0 },
      { ...body, unitCost: '1' },
      { ...body, payments: [{ methodCode: 'QR', amount: '10', tendered: '10' }] },
    ]) {
      expect((await post(EXCHANGES, seller.cookie, payload)).statusCode).toBe(400);
    }
    // Nada se registró.
    expect(await app.prisma.saleExchange.count()).toBe(0);
    expect(await balanceOf(app.prisma, oldPiece.id)).toBe(3);
  });

  it('404 si la venta no existe y 404 si la pieza no pertenece a esa venta', async () => {
    const { seller, newPiece, sale } = await scenario();
    expect((await get(`${EXCHANGES}/lookup?number=9999`, seller.cookie)).statusCode).toBe(404);
    const otherVariant = await createSellableVariant(app.prisma, { stock: 3 });
    const otherSale = await sellCash(seller.cookie, otherVariant.id, 1);
    const foreign = exchangeBody(sale, newPiece.id, '150.00', { sourceItemId: otherSale.itemId });
    const res = await post(EXCHANGES, seller.cookie, foreign);
    expect(res.statusCode).toBe(404);
  });
});

describe('cambio sin diferencia de precio (anillo talla 10 por talla 12)', () => {
  it('registra el cambio: la devuelta entra, la entregada sale, la venta no cambia y queda auditado', async () => {
    const { seller, oldPiece, newPiece, sale, cash } = await scenario();
    const saleBefore = await app.prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });

    const res = await post(EXCHANGES, seller.cookie, exchangeBody(sale, newPiece.id, '150.00'));
    expect(res.statusCode).toBe(201);
    const exchange = res.json().data;
    expect(exchange).toMatchObject({
      saleId: sale.id,
      saleNumber: sale.number,
      cashSessionId: cash.id,
      quantity: 1,
      creditUnitPrice: '150.00',
      deliveredUnitPrice: '150.00',
      difference: '0.00',
      payments: [],
      changeGiven: '0.00',
      returned: { variantId: oldPiece.id },
      delivered: { variantId: newPiece.id },
    });

    // Stock: la talla 10 vuelve (3 → 4) y la talla 12 sale (5 → 4).
    expect(await balanceOf(app.prisma, oldPiece.id)).toBe(4);
    expect(await balanceOf(app.prisma, newPiece.id)).toBe(4);
    const movements = await app.prisma.inventoryMovement.findMany({
      where: { referenceType: REFERENCE_TYPES.EXCHANGE, referenceId: exchange.id },
      orderBy: { id: 'asc' },
    });
    expect(movements.map((m) => [m.type, m.quantity, m.variantId])).toEqual([
      ['EXCHANGE_IN', 1, oldPiece.id],
      ['EXCHANGE_OUT', -1, newPiece.id],
    ]);

    // La venta original NO se tocó (DEC-V07).
    expect(await app.prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).toEqual(saleBefore);
    expect(await app.prisma.saleItem.count({ where: { saleId: sale.id } })).toBe(1);

    // Auditoría en la misma operación.
    const audit = await app.prisma.auditLog.findFirstOrThrow({
      where: { action: 'sale_exchange.created', entityId: exchange.id },
    });
    expect(audit.userId).toBe(seller.user.id);

    await assertLedgerInvariant(app.prisma);
  });

  it('la pieza ya cambiada deja de estar disponible: no se puede cambiar dos veces la misma unidad', async () => {
    const { seller, newPiece, sale } = await scenario();
    // La venta tiene 2 unidades: dos cambios de 1 y un tercero rechazado.
    expect(
      (await post(EXCHANGES, seller.cookie, exchangeBody(sale, newPiece.id, '150.00'))).statusCode,
    ).toBe(201);
    expect(
      (await post(EXCHANGES, seller.cookie, exchangeBody(sale, newPiece.id, '150.00'))).statusCode,
    ).toBe(201);
    const third = await post(EXCHANGES, seller.cookie, exchangeBody(sale, newPiece.id, '150.00'));
    expect(third.statusCode).toBe(422);
    expect(third.json().error.code).toBe(ERROR_CODES.EXCHANGE_QUANTITY_EXCEEDED);
    expect(await app.prisma.saleExchange.count()).toBe(2);

    const lookup = await get(`${EXCHANGES}/lookup?number=${String(sale.number)}`, seller.cookie);
    const holdings = lookup.json().data.holdings as { origin: string; remaining: number }[];
    // La línea vendida ya no tiene saldo; solo quedan las 2 piezas entregadas en los cambios.
    expect(holdings.map((h) => [h.origin, h.remaining])).toEqual([
      ['EXCHANGE', 1],
      ['EXCHANGE', 1],
    ]);
    await assertLedgerInvariant(app.prisma);
  });

  it('no se piden más unidades de las que quedan', async () => {
    const { seller, newPiece, sale } = await scenario();
    const res = await post(
      EXCHANGES,
      seller.cookie,
      exchangeBody(sale, newPiece.id, '150.00', { quantity: 3 }),
    );
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({
      code: ERROR_CODES.EXCHANGE_QUANTITY_EXCEEDED,
      details: { remaining: 2, requested: 3 },
    });
  });
});

describe('regla de negocio: nunca por una pieza más económica; la diferencia se cobra', () => {
  it('rechaza una pieza más barata y no cambia nada', async () => {
    const { seller, oldPiece, sale } = await scenario();
    const cheaper = await createSellableVariant(app.prisma, { stock: 5, price: '149.99' });
    const res = await post(EXCHANGES, seller.cookie, exchangeBody(sale, cheaper.id, '149.99'));
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({
      code: ERROR_CODES.EXCHANGE_CHEAPER_NOT_ALLOWED,
      details: { creditUnitPrice: '150.00', deliveredUnitPrice: '149.99' },
    });
    expect(await app.prisma.saleExchange.count()).toBe(0);
    expect(await balanceOf(app.prisma, oldPiece.id)).toBe(3);
    expect(await balanceOf(app.prisma, cheaper.id)).toBe(5);
  });

  it('cobra la diferencia en efectivo, con vuelto, y entra al arqueo de la caja', async () => {
    const { manager, seller, oldPiece, newPiece, sale, cash } = await scenario({
      newPrice: '230.50',
    });
    // 2 unidades: se cambian las 2 por piezas de Bs 230,50 → diferencia 2 × 80,50 = 161,00.
    const res = await post(
      EXCHANGES,
      seller.cookie,
      exchangeBody(sale, newPiece.id, '230.50', {
        quantity: 2,
        payments: [cashPayment('161.00', '200.00')],
      }),
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      quantity: 2,
      creditUnitPrice: '150.00',
      deliveredUnitPrice: '230.50',
      difference: '161.00',
      changeGiven: '39.00',
      payments: [
        { methodCode: 'CASH', amount: '161.00', tendered: '200.00', changeGiven: '39.00' },
      ],
    });
    expect(await balanceOf(app.prisma, oldPiece.id)).toBe(5);
    expect(await balanceOf(app.prisma, newPiece.id)).toBe(3);

    // Caja: fondo 100 + venta 300 + diferencia 161 = 561 (el vuelto no entra).
    const detail = await get(`/api/v1/cash/sessions/${cash.id}`, manager.cookie);
    expect(detail.json().data).toMatchObject({
      liveExpectedCash: '561.00',
      exchangesCount: 1,
      exchangesTotal: '161.00',
    });
    const cashMethod = detail
      .json()
      .data.totalsByMethod.find((m: { methodCode: string }) => m.methodCode === 'CASH');
    expect(cashMethod).toMatchObject({ amount: '461.00', paymentsCount: 2 });

    // El cierre con el efectivo exacto cuadra: el trigger recalcula con ventas + cambios.
    const close = await post(`/api/v1/cash/sessions/${cash.id}/close`, manager.cookie, {
      countedCash: '561',
    });
    expect(close.statusCode).toBe(200);
    expect(close.json().data).toMatchObject({
      cashSalesTotal: '461.00',
      expectedCash: '561.00',
      difference: '0.00',
    });
    await assertLedgerInvariant(app.prisma);
  });

  it('la diferencia por QR no entra al efectivo esperado', async () => {
    const { manager, seller, newPiece, sale, cash } = await scenario({ newPrice: '200.00' });
    const res = await post(
      EXCHANGES,
      seller.cookie,
      exchangeBody(sale, newPiece.id, '200.00', {
        payments: [{ methodCode: 'QR', amount: '50.00', reference: 'QR-1' }],
      }),
    );
    expect(res.statusCode).toBe(201);
    const detail = await get(`/api/v1/cash/sessions/${cash.id}`, manager.cookie);
    // Fondo 100 + venta en efectivo 300; el QR del cambio no es efectivo.
    expect(detail.json().data.liveExpectedCash).toBe('400.00');
    expect(detail.json().data.exchangesTotal).toBe('50.00');
  });

  it('el pago debe sumar exactamente la diferencia; sin diferencia no se registran pagos', async () => {
    const { seller, oldPiece, newPiece, sale } = await scenario({ newPrice: '200.00' });
    for (const payments of [[], [cashPayment('49.99')], [cashPayment('50.01')]]) {
      const res = await post(
        EXCHANGES,
        seller.cookie,
        exchangeBody(sale, newPiece.id, '200.00', { payments }),
      );
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe(ERROR_CODES.PAYMENT_MISMATCH);
    }
    const same = await createSellableVariant(app.prisma, { stock: 5, price: '150.00' });
    const noDifference = await post(
      EXCHANGES,
      seller.cookie,
      exchangeBody(sale, same.id, '150.00', { payments: [cashPayment('10.00')] }),
    );
    expect(noDifference.statusCode).toBe(422);
    expect(noDifference.json().error.code).toBe(ERROR_CODES.PAYMENT_MISMATCH);
    // Todo se revirtió: sin cambios ni movimientos.
    expect(await app.prisma.saleExchange.count()).toBe(0);
    expect(await balanceOf(app.prisma, oldPiece.id)).toBe(3);
    expect(await balanceOf(app.prisma, newPiece.id)).toBe(5);
  });

  it('409 si el precio de la pieza nueva cambió entre la vista previa y el cobro', async () => {
    const { seller, newPiece, sale } = await scenario({ newPrice: '200.00' });
    const res = await post(
      EXCHANGES,
      seller.cookie,
      exchangeBody(sale, newPiece.id, '180.00', { payments: [cashPayment('30.00')] }),
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({
      code: ERROR_CODES.PRICE_CHANGED,
      details: { expectedUnitPrice: '180.00', currentUnitPrice: '200.00' },
    });
    expect(await app.prisma.saleExchange.count()).toBe(0);
  });
});

describe('estado de las piezas y de la caja', () => {
  it('422 si la pieza nueva no tiene stock suficiente, y nada cambia', async () => {
    const { seller, oldPiece, newPiece, sale } = await scenario({ stockNew: 0 });
    const res = await post(EXCHANGES, seller.cookie, exchangeBody(sale, newPiece.id, '150.00'));
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe(ERROR_CODES.INSUFFICIENT_STOCK);
    expect(await balanceOf(app.prisma, oldPiece.id)).toBe(3);
    expect(await balanceOf(app.prisma, newPiece.id)).toBe(0);
  });

  it('422 si la pieza nueva es la misma, está inactiva o no tiene precio', async () => {
    const { seller, oldPiece, newPiece, sale } = await scenario();
    const same = await post(EXCHANGES, seller.cookie, exchangeBody(sale, oldPiece.id, '150.00'));
    expect(same.json().error.code).toBe(ERROR_CODES.EXCHANGE_SAME_PIECE);

    await app.prisma.productVariant.update({
      where: { id: newPiece.id },
      data: { status: 'INACTIVE' },
    });
    const inactive = await post(
      EXCHANGES,
      seller.cookie,
      exchangeBody(sale, newPiece.id, '150.00'),
    );
    expect(inactive.statusCode).toBe(422);
    expect(inactive.json().error.code).toBe(ERROR_CODES.VARIANT_NOT_SELLABLE);

    const free = await createSellableVariant(app.prisma, { stock: 2, price: '0.00' });
    const noPrice = await post(EXCHANGES, seller.cookie, exchangeBody(sale, free.id, '1.00'));
    expect(noPrice.statusCode).toBe(422);
    expect(noPrice.json().error.code).toBe(ERROR_CODES.VARIANT_NOT_SELLABLE);
    expect(await app.prisma.saleExchange.count()).toBe(0);
  });

  it('422 si no hay caja abierta (el cambio cobra en la caja del momento)', async () => {
    const { manager, seller, cash, newPiece, sale } = await scenario();
    const close = await post(`/api/v1/cash/sessions/${cash.id}/close`, manager.cookie, {
      countedCash: '400',
    });
    expect(close.statusCode).toBe(200);
    const res = await post(EXCHANGES, seller.cookie, exchangeBody(sale, newPiece.id, '150.00'));
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe(ERROR_CODES.CASH_SESSION_REQUIRED);
  });

  it('un cambio en otra caja posterior se cobra en esa caja, no en la de la venta', async () => {
    const { manager, seller, cash, newPiece, sale } = await scenario({ newPrice: '200.00' });
    await post(`/api/v1/cash/sessions/${cash.id}/close`, manager.cookie, { countedCash: '400' });
    const next = await openCash(manager.cookie, '50');
    const res = await post(
      EXCHANGES,
      seller.cookie,
      exchangeBody(sale, newPiece.id, '200.00', { payments: [cashPayment('50.00')] }),
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().data.cashSessionId).toBe(next.id);
    const detail = await get(`/api/v1/cash/sessions/${next.id}`, manager.cookie);
    expect(detail.json().data.liveExpectedCash).toBe('100.00'); // fondo 50 + diferencia 50
    // La caja cerrada de la venta quedó intacta.
    const closed = await get(`/api/v1/cash/sessions/${cash.id}`, manager.cookie);
    expect(closed.json().data).toMatchObject({ status: 'CLOSED', exchangesCount: 0 });
  });
});

describe('cadena de cambios', () => {
  it('la pieza entregada en un cambio se puede volver a cambiar; el crédito es lo que se pagó por ella', async () => {
    const { seller, newPiece, sale } = await scenario({ newPrice: '200.00' });
    const first = await post(
      EXCHANGES,
      seller.cookie,
      exchangeBody(sale, newPiece.id, '200.00', { payments: [cashPayment('50.00')] }),
    );
    expect(first.statusCode).toBe(201);
    const firstId = first.json().data.id as string;

    // El cliente devolvió la pieza de Bs 200: solo puede llevarse una de Bs 200 o más.
    const cheaper = await createSellableVariant(app.prisma, { stock: 4, price: '180.00' });
    const reject = await post(EXCHANGES, seller.cookie, {
      saleId: sale.id,
      sourceExchangeId: firstId,
      deliveredVariantId: cheaper.id,
      quantity: 1,
      expectedDeliveredUnitPrice: '180.00',
      payments: [],
    });
    expect(reject.statusCode).toBe(422);
    expect(reject.json().error).toMatchObject({
      code: ERROR_CODES.EXCHANGE_CHEAPER_NOT_ALLOWED,
      details: { creditUnitPrice: '200.00' },
    });

    const dearer = await createSellableVariant(app.prisma, { stock: 4, price: '260.00' });
    const second = await post(EXCHANGES, seller.cookie, {
      saleId: sale.id,
      sourceExchangeId: firstId,
      deliveredVariantId: dearer.id,
      quantity: 1,
      expectedDeliveredUnitPrice: '260.00',
      payments: [cashPayment('60.00')],
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().data).toMatchObject({ creditUnitPrice: '200.00', difference: '60.00' });
    await assertLedgerInvariant(app.prisma);
  });
});

describe('idempotencia y concurrencia', () => {
  it('repetir la misma clave devuelve el mismo cambio y no mueve el stock otra vez', async () => {
    const { seller, oldPiece, newPiece, sale } = await scenario();
    const key = randomUUID();
    const body = exchangeBody(sale, newPiece.id, '150.00');
    const first = await post(EXCHANGES, seller.cookie, body, key);
    const second = await post(EXCHANGES, seller.cookie, body, key);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.headers['idempotent-replay']).toBe('true');
    expect(second.json().data.id).toBe(first.json().data.id);
    expect(await app.prisma.saleExchange.count()).toBe(1);
    expect(await balanceOf(app.prisma, oldPiece.id)).toBe(4);
    expect(await balanceOf(app.prisma, newPiece.id)).toBe(4);
  });

  it('la misma clave con otro cuerpo es 409 y no registra nada nuevo', async () => {
    const { seller, newPiece, sale } = await scenario();
    const key = randomUUID();
    await post(EXCHANGES, seller.cookie, exchangeBody(sale, newPiece.id, '150.00'), key);
    const other = await post(
      EXCHANGES,
      seller.cookie,
      exchangeBody(sale, newPiece.id, '150.00', { note: 'otra observación' }),
      key,
    );
    expect(other.statusCode).toBe(409);
    expect(other.json().error.code).toBe(ERROR_CODES.IDEMPOTENCY_KEY_REUSED);
    expect(await app.prisma.saleExchange.count()).toBe(1);
  });

  it('dos cambios simultáneos de la última unidad: uno se registra y el otro se rechaza', async () => {
    const manager = await sessionWith(MANAGER);
    const seller = await sessionWith(SELLER);
    await openCash(manager.cookie);
    const oldPiece = await createSellableVariant(app.prisma, { stock: 3, userId: manager.user.id });
    const pieceA = await createSellableVariant(app.prisma, { stock: 5, userId: manager.user.id });
    const pieceB = await createSellableVariant(app.prisma, { stock: 5, userId: manager.user.id });
    const sale = await sellCash(seller.cookie, oldPiece.id, 1);

    const results = await Promise.all([
      post(EXCHANGES, seller.cookie, exchangeBody(sale, pieceA.id, '150.00')),
      post(EXCHANGES, seller.cookie, exchangeBody(sale, pieceB.id, '150.00')),
    ]);
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 422]);
    expect(await app.prisma.saleExchange.count()).toBe(1);
    // La pieza devuelta entró UNA sola vez: 3 − 1 (venta) + 1 (cambio) = 3.
    expect(await balanceOf(app.prisma, oldPiece.id)).toBe(3);
    await assertLedgerInvariant(app.prisma);
  });
});

describe('visibilidad y consulta', () => {
  it('cualquiera con sales:exchange busca la venta por número; ve solo piezas y precios, sin costos', async () => {
    const { seller, sale } = await scenario();
    const otherSeller = await sessionWith(SELLER);
    const res = await get(`${EXCHANGES}/lookup?number=${String(sale.number)}`, otherSeller.cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      saleId: sale.id,
      number: sale.number,
      holdings: [{ origin: 'SALE', remaining: 2, creditUnitPrice: '150.00' }],
    });
    expect(costKeys(res.json())).toEqual([]);
    expect(seller.user.id).not.toBe(otherSeller.user.id);
  });

  it('un vendedor ve sus cambios y los de sus ventas; otro vendedor no; el Responsable ve todos', async () => {
    const { manager, seller, newPiece, sale } = await scenario();
    const created = await post(EXCHANGES, seller.cookie, exchangeBody(sale, newPiece.id, '150.00'));
    const id = created.json().data.id as string;
    const stranger = await sessionWith(SELLER);

    expect((await get(`${EXCHANGES}/${id}`, seller.cookie)).statusCode).toBe(200);
    expect((await get(`${EXCHANGES}/${id}`, manager.cookie)).statusCode).toBe(200);
    expect((await get(`${EXCHANGES}/${id}`, stranger.cookie)).statusCode).toBe(404);
    expect((await get(`${EXCHANGES}/${id}/receipt`, stranger.cookie)).statusCode).toBe(404);

    const mine = await get(EXCHANGES, seller.cookie);
    expect(mine.json().meta.total).toBe(1);
    const theirs = await get(EXCHANGES, stranger.cookie);
    expect(theirs.json().meta.total).toBe(0);
    const all = await get(`${EXCHANGES}?saleId=${sale.id}`, manager.cookie);
    expect(all.json().data).toHaveLength(1);
    expect(costKeys(mine.json())).toEqual([]);
  });

  it('el vendedor de la venta ve el cambio hecho por otro vendedor sobre su venta', async () => {
    const { seller, newPiece, sale } = await scenario();
    const other = await sessionWith(SELLER);
    const created = await post(EXCHANGES, other.cookie, exchangeBody(sale, newPiece.id, '150.00'));
    expect(created.statusCode).toBe(201);
    const id = created.json().data.id as string;
    expect((await get(`${EXCHANGES}/${id}`, seller.cookie)).statusCode).toBe(200);
  });

  it('el comprobante trae el negocio, la leyenda y la diferencia, sin costos ni referencias', async () => {
    const { seller, newPiece, sale } = await scenario({ newPrice: '200.00' });
    await app.prisma.businessSettings.upsert({
      where: { id: 1 },
      update: { receiptFooterNote: 'Solo cambio de pieza.' },
      create: { id: 1, tradeName: 'Joyería Sole', receiptFooterNote: 'Solo cambio de pieza.' },
    });
    const created = await post(
      EXCHANGES,
      seller.cookie,
      exchangeBody(sale, newPiece.id, '200.00', {
        payments: [{ methodCode: 'QR', amount: '50.00', reference: 'SECRETO-123' }],
      }),
    );
    const id = created.json().data.id as string;
    const receipt = await get(`${EXCHANGES}/${id}/receipt`, seller.cookie);
    expect(receipt.statusCode).toBe(200);
    expect(receipt.json().data).toMatchObject({
      saleNumber: sale.number,
      difference: '50.00',
      business: {
        tradeName: 'Joyería Sole',
        footerNote: 'Solo cambio de pieza.',
        logoSha256: null,
      },
      payments: [{ methodName: 'QR', amount: '50.00' }],
    });
    expect(costKeys(receipt.json())).toEqual([]);
    expect(receipt.body).not.toContain('SECRETO-123');
  });
});

describe('garantías de la base de datos', () => {
  async function created() {
    const ctx = await scenario({ newPrice: '200.00' });
    const res = await post(
      EXCHANGES,
      ctx.seller.cookie,
      exchangeBody(ctx.sale, ctx.newPiece.id, '200.00', { payments: [cashPayment('50.00')] }),
    );
    expect(res.statusCode).toBe(201);
    return { ...ctx, exchangeId: res.json().data.id as string };
  }

  it('un cambio registrado no se edita ni se borra (inmutable)', async () => {
    const { exchangeId } = await created();
    await expect(
      app.prisma.$executeRaw`UPDATE sale_exchanges SET note = 'x' WHERE id = ${exchangeId}::uuid`,
    ).rejects.toThrow();
    await expect(
      app.prisma.$executeRaw`DELETE FROM sale_exchanges WHERE id = ${exchangeId}::uuid`,
    ).rejects.toThrow();
    await expect(
      app.prisma
        .$executeRaw`UPDATE sale_exchange_payments SET amount = 1 WHERE exchange_id = ${exchangeId}::uuid`,
    ).rejects.toThrow();
    await expect(
      app.prisma
        .$executeRaw`DELETE FROM sale_exchange_payments WHERE exchange_id = ${exchangeId}::uuid`,
    ).rejects.toThrow();
  });

  it('el CHECK impide guardar un cambio por una pieza más barata aunque se salte la API', async () => {
    const { exchangeId } = await created();
    // Copia de la fila con precio entregado menor que el crédito: el CHECK la rechaza.
    await expect(
      app.prisma.$executeRaw`
        INSERT INTO sale_exchanges (id, sale_id, cash_session_id, seller_id, seller_name,
          source_item_id, returned_variant_id, returned_sku, returned_product_name,
          delivered_variant_id, delivered_sku, delivered_product_name, quantity,
          credit_unit_price, delivered_unit_price, difference,
          returned_movement_id, delivered_movement_id, client_request_id, request_hash)
        SELECT uuidv7(), sale_id, cash_session_id, seller_id, seller_name,
          source_item_id, returned_variant_id, returned_sku, returned_product_name,
          delivered_variant_id, delivered_sku, delivered_product_name, 1,
          credit_unit_price, 10, -140,
          returned_movement_id, delivered_movement_id, gen_random_uuid(), request_hash
        FROM sale_exchanges WHERE id = ${exchangeId}::uuid`,
    ).rejects.toThrow(/sale_exchanges_not_cheaper_check|sale_exchanges_difference_check/);
  });

  it('los pagos deben sumar la diferencia al confirmar (sin pagos, una diferencia positiva no confirma)', async () => {
    const { exchangeId } = await created();
    // Un cambio nuevo escrito a mano SIN su pago: el trigger diferido lo rechaza al COMMIT.
    await expect(
      app.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO sale_exchanges (id, sale_id, cash_session_id, seller_id, seller_name,
            source_exchange_id, returned_variant_id, returned_sku, returned_product_name,
            delivered_variant_id, delivered_sku, delivered_product_name, quantity,
            credit_unit_price, delivered_unit_price, difference,
            returned_movement_id, delivered_movement_id, client_request_id, request_hash)
          SELECT uuidv7(), sale_id, cash_session_id, seller_id, seller_name,
            id, delivered_variant_id, delivered_sku, delivered_product_name,
            returned_variant_id, returned_sku, returned_product_name, 1,
            delivered_unit_price, delivered_unit_price + 10, 10,
            delivered_movement_id, returned_movement_id, gen_random_uuid(), request_hash
          FROM sale_exchanges WHERE id = ${exchangeId}::uuid`;
      }),
    ).rejects.toThrow();
    expect(await app.prisma.saleExchange.count()).toBe(1);
  });

  it('el cierre de caja exige que el efectivo congelado incluya los cambios', async () => {
    const { manager, cash } = await created();
    // Efectivo esperado correcto: venta 300 + diferencia 50 = 350 (+ fondo 100). Mentir sobre los
    // cobros en efectivo (solo ventas) hace fallar el trigger de la sesión.
    await expect(
      app.prisma.$executeRaw`
        UPDATE cash_sessions SET status = 'CLOSED', closed_by_id = ${manager.user.id}::uuid,
          closed_at = now(), cash_sales_total = 300, cash_movements_net = 0,
          expected_cash = 400, counted_cash = 400, difference = 0,
          close_request_id = gen_random_uuid(), close_request_hash = ${'a'.repeat(64)}
        WHERE id = ${cash.id}::uuid`,
    ).rejects.toThrow(/cobros en efectivo/);
    const ok = await post(`/api/v1/cash/sessions/${cash.id}/close`, manager.cookie, {
      countedCash: '450',
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.cashSalesTotal).toBe('350.00');
  });
});
