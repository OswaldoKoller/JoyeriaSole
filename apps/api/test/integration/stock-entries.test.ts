import { randomUUID } from 'node:crypto';
import { PERMISSIONS, documentDateBounds, type Permission } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { seedCostTypes } from '../helpers/cost-types.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';
import { setStock } from '../helpers/stock.ts';

const URL = '/api/v1/stock-entries';
const FULL: Permission[] = [
  PERMISSIONS.STOCK_ENTRIES_READ,
  PERMISSIONS.STOCK_ENTRIES_MANAGE,
  PERMISSIONS.STOCK_ENTRIES_CONFIRM,
  PERMISSIONS.COSTS_READ,
  PERMISSIONS.CATALOG_READ,
  PERMISSIONS.CATALOG_MANAGE,
];
const UNKNOWN_ID = '01900000-0000-7000-8000-000000000000';

interface ItemCost {
  unitPrice: string;
  unitCostBob: string;
  subtotalOriginal: string;
  subtotalBob: string;
  extraAllocated: string | null;
  totalCost: string | null;
  unitExtraCost: string | null;
  unitTotalCost: string | null;
}
interface Detail {
  id: string;
  number: number;
  status: string;
  currency: string;
  exchangeRate: string | null;
  purchaseTotal: string | null;
  extrasTotal: string | null;
  blockers: string[];
  items: { sku: string; variantId: string; cost: ItemCost | null; profileIncomplete: boolean }[];
  costs: { costTypeName: string; amount: string; note: string | null }[] | null;
  totals: { purchaseOriginal: string; purchaseBob: string; extras: string; grand: string } | null;
  relatedEntries: { id: string; number: number }[];
}

const shiftDate = (date: string, days: number) => {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
};

describe('ingresos de mercadería', () => {
  let app: App;
  let cookie: string;
  let userId: string;
  let supplierId: string;
  let types: Awaited<ReturnType<typeof seedCostTypes>>;

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
    types = await seedCostTypes(app.prisma);
    const manager = await createTestUser(app.prisma, { permissions: FULL });
    userId = manager.user.id;
    ({ cookie } = await login(app, manager.user.email, manager.password));
    supplierId = (await app.prisma.supplier.create({ data: { name: 'Proveedor de prueba' } })).id;
  });
  afterEach(() => app.close());

  let counter = 0;
  async function createVariant(options: { salePrice?: string; active?: boolean } = {}) {
    counter += 1;
    const category = await app.prisma.category.create({
      data: { name: `Cat ${counter}`, slug: `cat-${counter}-${Date.now()}` },
    });
    const product = await app.prisma.product.create({
      data: { categoryId: category.id, name: `Producto ${counter}` },
    });
    return app.prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `ING-${counter}-${Date.now()}`,
        salePrice: options.salePrice ?? '0',
        costPrice: '1',
        status: options.active === false ? 'INACTIVE' : 'ACTIVE',
      },
    });
  }

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT',
    url: string,
    payload?: object,
    c = cookie,
  ) =>
    app.inject({ method, url, headers: { cookie: c }, ...(payload !== undefined && { payload }) });

  async function createDraft(overrides: Record<string, unknown> = {}) {
    const res = await call('POST', URL, { supplierId, ...overrides });
    expect(res.statusCode, res.body).toBe(201);
    return res.json().data as Detail;
  }

  async function sessionWith(permissions: Permission[]) {
    const { user, password } = await createTestUser(app.prisma, { permissions });
    return (await login(app, user.email, password)).cookie;
  }

  const lines = (entries: [string, number, string][]) => ({
    items: entries.map(([variantId, receivedQty, unitPrice]) => ({
      variantId,
      receivedQty,
      unitPrice,
    })),
  });
  const costLines = (entries: [string, string][]) => ({
    costs: entries.map(([costTypeId, amount]) => ({ costTypeId, amount })),
  });

  async function stockOf(variantId: string) {
    return (await app.prisma.inventoryBalance.findUnique({ where: { variantId } }))?.quantity ?? 0;
  }
  const detailOf = async (id: string, c = cookie) =>
    (await call('GET', `${URL}/${id}`, undefined, c)).json().data as Detail;

  describe('permisos', () => {
    it('401 sin sesión y 403 sin permiso de lectura o de gestión', async () => {
      expect((await app.inject({ method: 'GET', url: URL })).statusCode).toBe(401);
      const seller = await sessionWith([PERMISSIONS.CATALOG_READ, PERMISSIONS.INVENTORY_READ]);
      expect((await call('GET', URL, undefined, seller)).statusCode).toBe(403);
      expect((await call('POST', URL, { supplierId }, seller)).statusCode).toBe(403);

      const readOnly = await sessionWith([PERMISSIONS.STOCK_ENTRIES_READ]);
      expect((await call('GET', URL, undefined, readOnly)).statusCode).toBe(200);
      expect((await call('POST', URL, { supplierId }, readOnly)).statusCode).toBe(403);
    });

    it('autoriza antes de validar: 401 sin sesión y 403 sin permiso aunque el cuerpo sea inválido', async () => {
      const noSession = await app.inject({ method: 'POST', url: URL, payload: {} });
      expect(noSession.statusCode).toBe(401);

      const seller = await sessionWith([PERMISSIONS.CATALOG_READ]);
      expect((await call('POST', URL, {}, seller)).statusCode).toBe(403);
      const draft = await createDraft();
      for (const [method, url] of [
        ['PUT', `${URL}/${draft.id}/items`],
        ['PUT', `${URL}/${draft.id}/costs`],
        ['POST', `${URL}/${draft.id}/items/quick`],
      ] as const) {
        expect((await call(method, url, { items: 'inválido' }, seller)).statusCode, url).toBe(403);
        expect(
          (await app.inject({ method, url, payload: { items: 'inválido' } })).statusCode,
          url,
        ).toBe(401);
      }
      // Quien sí tiene permiso recibe el detalle de validación.
      expect((await call('POST', URL, {})).statusCode).toBe(400);
    });

    it('confirmar exige su propio permiso y el de costos: gestionar no basta', async () => {
      const draft = await createDraft();
      const variant = await createVariant();
      await call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, 3, '10']]));
      const managerOnly = await sessionWith([
        PERMISSIONS.STOCK_ENTRIES_READ,
        PERMISSIONS.STOCK_ENTRIES_MANAGE,
        PERMISSIONS.COSTS_READ,
      ]);
      expect(
        (await call('POST', `${URL}/${draft.id}/confirm`, undefined, managerOnly)).statusCode,
      ).toBe(403);
      const noCosts = await sessionWith([
        PERMISSIONS.STOCK_ENTRIES_READ,
        PERMISSIONS.STOCK_ENTRIES_CONFIRM,
      ]);
      expect(
        (await call('POST', `${URL}/${draft.id}/confirm`, undefined, noCosts)).statusCode,
      ).toBe(403);
      expect(await stockOf(variant.id)).toBe(0);
    });

    it('cargar precios, costos o piezas exige costs:read; el alta rápida, catalog:manage', async () => {
      const draft = await createDraft();
      const variant = await createVariant();
      const noCosts = await sessionWith([
        PERMISSIONS.STOCK_ENTRIES_READ,
        PERMISSIONS.STOCK_ENTRIES_MANAGE,
        PERMISSIONS.CATALOG_MANAGE,
      ]);
      expect(
        (await call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, 1, '1']]), noCosts))
          .statusCode,
      ).toBe(403);
      expect(
        (await call('PUT', `${URL}/${draft.id}/costs`, costLines([]), noCosts)).statusCode,
      ).toBe(403);
      const category = await app.prisma.category.create({ data: { name: 'C', slug: 'c-perm' } });
      const quick = { categoryId: category.id, name: 'Pieza', receivedQty: 1, unitPrice: '1' };
      expect(
        (await call('POST', `${URL}/${draft.id}/items/quick`, quick, noCosts)).statusCode,
      ).toBe(403);
      const noCatalog = await sessionWith([
        PERMISSIONS.STOCK_ENTRIES_MANAGE,
        PERMISSIONS.COSTS_READ,
      ]);
      expect(
        (await call('POST', `${URL}/${draft.id}/items/quick`, quick, noCatalog)).statusCode,
      ).toBe(403);
      // Sin costs:read tampoco se registran compras en dólares.
      const headerOnly = await sessionWith([PERMISSIONS.STOCK_ENTRIES_MANAGE]);
      expect(
        (await call('POST', URL, { supplierId, currency: 'USD', exchangeRate: '6.96' }, headerOnly))
          .statusCode,
      ).toBe(403);
      expect((await call('POST', URL, { supplierId }, headerOnly)).statusCode).toBe(201);
    });

    it('sin costs:read ninguna respuesta de lectura trae costos', async () => {
      const variant = await createVariant();
      const draft = await createDraft({ currency: 'USD', exchangeRate: '6.96' });
      await call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, 2, '5']]));
      await call('PUT', `${URL}/${draft.id}/costs`, costLines([[types.CUSTOMS, '10']]));
      await call('POST', `${URL}/${draft.id}/confirm`);

      const reader = await sessionWith([PERMISSIONS.STOCK_ENTRIES_READ]);
      const detail = await detailOf(draft.id, reader);
      expect(detail).toMatchObject({
        purchaseTotal: null,
        extrasTotal: null,
        exchangeRate: null,
        costs: null,
        totals: null,
      });
      expect(detail.items.every((item) => item.cost === null)).toBe(true);

      const list = (await call('GET', URL, undefined, reader)).json().data as Detail[];
      expect(list[0]).toMatchObject({ purchaseTotal: null, extrasTotal: null });
      // Con costs:read sí.
      expect((await detailOf(draft.id)).totals).not.toBeNull();
      // El historial de costos exige costs:read.
      expect(
        (
          await call(
            'GET',
            `/api/v1/products/variants/${variant.id}/cost-history`,
            undefined,
            reader,
          )
        ).statusCode,
      ).toBe(403);
    });
  });

  describe('borrador', () => {
    it('crea un borrador numerado correlativamente sin tocar el stock', async () => {
      const first = await createDraft({ documentType: 'Factura', documentNumber: 'F-100' });
      const second = await createDraft();
      expect(second.number).toBe(first.number + 1);

      const detail = await detailOf(first.id);
      expect(detail).toMatchObject({
        status: 'DRAFT',
        currency: 'BOB',
        exchangeRate: null,
        documentType: 'Factura',
        documentNumber: 'F-100',
        purchaseTotal: '0.00',
        extrasTotal: '0.00',
        itemsCount: 0,
        costs: [],
      });
      expect(await app.prisma.inventoryMovement.count()).toBe(0);
      expect(await app.prisma.inventoryBalance.count()).toBe(0);
    });

    it('valida proveedor y datos de entrada', async () => {
      expect((await call('POST', URL, { supplierId: 'no-es-uuid' })).statusCode).toBe(400);
      expect((await call('POST', URL, { supplierId, currency: 'EUR' })).statusCode).toBe(400);
      expect((await call('POST', URL, { supplierId: UNKNOWN_ID })).statusCode).toBe(404);

      await app.prisma.supplier.update({ where: { id: supplierId }, data: { isActive: false } });
      expect((await call('POST', URL, { supplierId })).statusCode).toBe(422);
    });

    it('moneda USD exige tipo de cambio mayor que cero con hasta 4 decimales; BOB no lo admite', async () => {
      const usd = { supplierId, currency: 'USD' };
      expect((await call('POST', URL, usd)).statusCode).toBe(400);
      expect((await call('POST', URL, { ...usd, exchangeRate: '0' })).statusCode).toBe(400);
      expect((await call('POST', URL, { ...usd, exchangeRate: '-6.96' })).statusCode).toBe(400);
      expect((await call('POST', URL, { ...usd, exchangeRate: '6.96001' })).statusCode).toBe(400);
      expect((await call('POST', URL, { ...usd, exchangeRate: '6,96' })).statusCode).toBe(400);
      expect(
        (await call('POST', URL, { supplierId, currency: 'BOB', exchangeRate: '6.96' })).statusCode,
      ).toBe(400);

      const ok = await call('POST', URL, { ...usd, exchangeRate: '6.9650' });
      expect(ok.statusCode).toBe(201);
      expect(ok.json().data).toMatchObject({ currency: 'USD', exchangeRate: '6.9650' });
      // La base de datos también lo exige (CHECK).
      await expect(
        app.prisma
          .$executeRaw`UPDATE stock_entries SET exchange_rate = NULL WHERE id = ${ok.json().data.id}::uuid`,
      ).rejects.toThrow();
    });

    it('la fecha del documento no puede ser futura ni anterior a 30 días (America/La_Paz)', async () => {
      const { min, max } = documentDateBounds();
      expect(
        (await call('POST', URL, { supplierId, documentDate: shiftDate(max, 1) })).statusCode,
      ).toBe(400);
      expect(
        (await call('POST', URL, { supplierId, documentDate: shiftDate(min, -1) })).statusCode,
      ).toBe(400);
      expect((await call('POST', URL, { supplierId, documentDate: max })).statusCode).toBe(201);
      expect((await call('POST', URL, { supplierId, documentDate: min })).statusCode).toBe(201);
      expect((await call('POST', URL, { supplierId, documentDate: null })).statusCode).toBe(201);

      const draft = await createDraft();
      expect(
        (await call('PATCH', `${URL}/${draft.id}`, { documentDate: shiftDate(max, 1) })).statusCode,
      ).toBe(400);
      expect(
        (await call('PATCH', `${URL}/${draft.id}`, { documentDate: shiftDate(min, -1) }))
          .statusCode,
      ).toBe(400);
      expect((await call('PATCH', `${URL}/${draft.id}`, { documentDate: min })).statusCode).toBe(
        200,
      );
    });

    it('un borrador con fecha ya vencida puede seguir editándose si no se cambia la fecha', async () => {
      const draft = await createDraft();
      await app.prisma.stockEntry.update({
        where: { id: draft.id },
        data: { documentDate: new Date('2020-01-15T00:00:00Z') },
      });
      expect(
        (await call('PATCH', `${URL}/${draft.id}`, { notes: 'sigue editable' })).statusCode,
      ).toBe(200);
      expect(
        (await call('PATCH', `${URL}/${draft.id}`, { documentDate: '2020-01-15' })).statusCode,
      ).toBe(200);
      expect(
        (await call('PATCH', `${URL}/${draft.id}`, { documentDate: '2020-01-16' })).statusCode,
      ).toBe(400);
    });

    it('edita la cabecera mientras es borrador, con auditoría', async () => {
      const draft = await createDraft();
      const res = await call('PATCH', `${URL}/${draft.id}`, { notes: 'Llegó en dos cajas' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ notes: 'Llegó en dos cajas' });
      const audit = await app.prisma.auditLog.findFirst({
        where: { action: 'stock_entry.updated', entityId: draft.id },
      });
      expect(audit?.userId).toBe(userId);
      expect((await call('PATCH', `${URL}/${draft.id}`, {})).statusCode).toBe(400);
    });

    it('cambiar a dólares exige el tipo de cambio y recalcula el costo en Bs de los ítems', async () => {
      const variant = await createVariant();
      const draft = await createDraft();
      await call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, 2, '10']]));

      expect((await call('PATCH', `${URL}/${draft.id}`, { currency: 'USD' })).statusCode).toBe(400);
      const usd = await call('PATCH', `${URL}/${draft.id}`, { currency: 'USD', exchangeRate: '7' });
      expect(usd.statusCode).toBe(200);
      expect(usd.json().data.items[0].cost).toMatchObject({
        unitPrice: '10.0000',
        unitCostBob: '70.0000',
        subtotalBob: '140.0000',
      });

      // Cambiar solo el tipo de cambio recalcula; volver a bolivianos lo borra.
      const rate = await call('PATCH', `${URL}/${draft.id}`, { exchangeRate: '7.5' });
      expect(rate.json().data.items[0].cost.unitCostBob).toBe('75.0000');
      expect(
        (await call('PATCH', `${URL}/${draft.id}`, { currency: 'BOB', exchangeRate: '7' }))
          .statusCode,
      ).toBe(400);
      const back = await call('PATCH', `${URL}/${draft.id}`, { currency: 'BOB' });
      expect(back.json().data).toMatchObject({ currency: 'BOB', exchangeRate: null });
      expect(back.json().data.items[0].cost.unitCostBob).toBe('10.0000');
      const stored = await app.prisma.stockEntryItem.findFirstOrThrow({
        where: { stockEntryId: draft.id },
      });
      expect(stored.unitCost.toFixed(4)).toBe('10.0000');
    });

    it('rechaza un precio que convertido a bolivianos no cabe', async () => {
      const variant = await createVariant();
      const draft = await createDraft({ currency: 'USD', exchangeRate: '7' });
      const res = await call(
        'PUT',
        `${URL}/${draft.id}/items`,
        lines([[variant.id, 1, '99999999']]),
      );
      expect(res.statusCode).toBe(400);
      expect(await app.prisma.stockEntryItem.count()).toBe(0);
    });

    it('reemplaza los ítems y muestra la vista previa del reparto sin tocar el stock', async () => {
      const a = await createVariant();
      const b = await createVariant();
      const draft = await createDraft();
      await call(
        'PUT',
        `${URL}/${draft.id}/costs`,
        costLines([
          [types.TRANSPORT, '10'],
          [types.PACKAGING, '0.5'],
          [types.OTHER, '0.5'],
        ]),
      );

      const res = await call('PUT', `${URL}/${draft.id}/items`, {
        items: [
          {
            variantId: a.id,
            expectedQty: 12,
            receivedQty: 10,
            unitPrice: '10',
            differenceReason: 'Faltaron 2',
          },
          { variantId: b.id, receivedQty: 5, unitPrice: '20' },
        ],
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data as Detail;
      expect(data).toMatchObject({ purchaseTotal: '200.00', extrasTotal: '11.00', blockers: [] });
      expect(data.totals).toEqual({
        purchaseOriginal: '200.00',
        purchaseBob: '200.00',
        extras: '11.00',
        grand: '211.00',
      });
      const bySku = Object.fromEntries(data.items.map((item) => [item.sku, item.cost]));
      // Valores iguales (100 y 100): cada línea absorbe 5,50 → 0,55 y 1,10 por pieza.
      expect(bySku[a.sku]).toMatchObject({
        extraAllocated: '5.50',
        unitExtraCost: '0.5500',
        unitTotalCost: '10.5500',
        totalCost: '105.5000',
      });
      expect(bySku[b.sku]).toMatchObject({ unitExtraCost: '1.1000', unitTotalCost: '21.1000' });

      // Un segundo reemplazo sustituye por completo a los anteriores.
      const second = await call('PUT', `${URL}/${draft.id}/items`, lines([[a.id, 1, '1']]));
      expect(second.json().data.itemsCount).toBe(1);
      expect(await app.prisma.stockEntryItem.count({ where: { stockEntryId: draft.id } })).toBe(1);
      expect(await app.prisma.inventoryMovement.count()).toBe(0);
    });

    it('en dólares muestra precio original, equivalente en Bs, costos asignados y totales', async () => {
      const a = await createVariant();
      const b = await createVariant();
      const draft = await createDraft({ currency: 'USD', exchangeRate: '6.96' });
      await call(
        'PUT',
        `${URL}/${draft.id}/costs`,
        costLines([
          [types.CUSTOMS, '100'],
          [types.COMMISSIONS, '20.5'],
        ]),
      );
      const res = await call(
        'PUT',
        `${URL}/${draft.id}/items`,
        lines([
          [a.id, 10, '5'],
          [b.id, 4, '12.5'],
        ]),
      );
      const data = res.json().data as Detail;
      expect(data).toMatchObject({ currency: 'USD', exchangeRate: '6.9600' });
      expect(data.totals).toEqual({
        purchaseOriginal: '100.00',
        purchaseBob: '696.00',
        extras: '120.50',
        grand: '816.50',
      });
      const bySku = Object.fromEntries(data.items.map((item) => [item.sku, item.cost]));
      expect(bySku[a.sku]).toEqual({
        unitPrice: '5.0000',
        unitCostBob: '34.8000',
        subtotalOriginal: '50.0000',
        subtotalBob: '348.0000',
        extraAllocated: '60.25',
        totalCost: '408.2500',
        unitExtraCost: '6.0250',
        unitTotalCost: '40.8250',
      });
      expect(bySku[b.sku]).toMatchObject({
        unitCostBob: '87.0000',
        extraAllocated: '60.25',
        unitExtraCost: '15.0625',
        unitTotalCost: '102.0625',
      });
      expect(data.costs?.map((cost) => cost.costTypeName)).toEqual(['Aduanización', 'Comisiones']);
      // El costo en Bs de cada ítem queda guardado y sincronizado con precio × tipo de cambio.
      const stored = await app.prisma.stockEntryItem.findMany({
        where: { stockEntryId: draft.id },
      });
      expect(stored.map((item) => item.unitCost.toFixed(4)).sort()).toEqual(['34.8000', '87.0000']);
    });

    it('rechaza ítems repetidos, variantes inexistentes o inactivas y cantidades o precios inválidos', async () => {
      const draft = await createDraft();
      const variant = await createVariant();
      const inactive = await createVariant({ active: false });
      const put = (payload: object) => call('PUT', `${URL}/${draft.id}/items`, payload);

      expect(
        (
          await put(
            lines([
              [variant.id, 1, '5'],
              [variant.id, 2, '5'],
            ]),
          )
        ).statusCode,
      ).toBe(400);
      expect((await put(lines([[variant.id, -1, '5']]))).statusCode).toBe(400);
      expect((await put(lines([[variant.id, 1.5, '5']]))).statusCode).toBe(400);
      expect((await put(lines([[variant.id, 1, '5.12345']]))).statusCode).toBe(400);
      expect((await put(lines([[variant.id, 1, '-1']]))).statusCode).toBe(400);
      expect((await put(lines([[UNKNOWN_ID, 1, '5']]))).statusCode).toBe(404);
      expect((await put(lines([[inactive.id, 1, '5']]))).statusCode).toBe(422);
      expect(await app.prisma.stockEntryItem.count()).toBe(0);
    });

    it('el comprobante del proveedor puede repetirse (entregas parciales) y el detalle muestra los demás ingresos', async () => {
      const otherSupplier = await app.prisma.supplier.create({ data: { name: 'Otro proveedor' } });
      const first = await createDraft({ documentNumber: 'FAC-77' });
      const second = await createDraft({ documentNumber: 'fac-77' });
      const foreign = await call('POST', URL, {
        supplierId: otherSupplier.id,
        documentNumber: 'FAC-77',
      });
      expect(foreign.statusCode).toBe(201);
      const alone = await createDraft({ documentNumber: 'UNICO-1' });

      expect((await detailOf(first.id)).relatedEntries.map((entry) => entry.number)).toEqual([
        second.number,
      ]);
      expect((await detailOf(second.id)).relatedEntries.map((entry) => entry.number)).toEqual([
        first.number,
      ]);
      expect((await detailOf(alone.id)).relatedEntries).toEqual([]);
      expect((await detailOf(foreign.json().data.id)).relatedEntries).toEqual([]);
    });
  });

  describe('costos adicionales', () => {
    it('reemplaza la lista abierta de costos con tipo, monto y nota, con auditoría', async () => {
      const draft = await createDraft();
      const res = await call('PUT', `${URL}/${draft.id}/costs`, {
        costs: [
          { costTypeId: types.CUSTOMS, amount: '150.25', note: 'DUI 123' },
          { costTypeId: types.TRANSPORT, amount: '30' },
          { costTypeId: types.TRANSPORT, amount: '5.5' },
        ],
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data as Detail;
      expect(data.extrasTotal).toBe('185.75');
      expect(data.costs).toEqual([
        expect.objectContaining({
          costTypeName: 'Aduanización',
          amount: '150.25',
          note: 'DUI 123',
        }),
        expect.objectContaining({ costTypeName: 'Transporte', amount: '30.00', note: null }),
        expect.objectContaining({ costTypeName: 'Transporte', amount: '5.50' }),
      ]);
      expect(
        await app.prisma.auditLog.count({
          where: { action: 'stock_entry.costs_replaced', entityId: draft.id, userId },
        }),
      ).toBe(1);

      // Un segundo reemplazo sustituye todo; vacío deja sin costos.
      const cleared = await call('PUT', `${URL}/${draft.id}/costs`, costLines([]));
      expect(cleared.json().data.extrasTotal).toBe('0.00');
      expect(await app.prisma.stockEntryCost.count()).toBe(0);
    });

    it('valida tipos, montos y cantidad de líneas', async () => {
      const draft = await createDraft();
      const put = (payload: object) => call('PUT', `${URL}/${draft.id}/costs`, payload);
      expect((await put(costLines([[types.CUSTOMS, '0']]))).statusCode).toBe(400);
      expect((await put(costLines([[types.CUSTOMS, '-3']]))).statusCode).toBe(400);
      expect((await put(costLines([[types.CUSTOMS, '1.234']]))).statusCode).toBe(400);
      expect((await put(costLines([['no-es-uuid', '3']]))).statusCode).toBe(400);
      expect((await put({ costs: 'x' })).statusCode).toBe(400);
      expect((await put(costLines([[UNKNOWN_ID, '3']]))).statusCode).toBe(404);
      const many = Array.from({ length: 51 }, () => [types.OTHER, '1'] as [string, string]);
      expect((await put(costLines(many))).statusCode).toBe(400);
      expect(await app.prisma.stockEntryCost.count()).toBe(0);
    });

    it('un tipo desactivado no se usa en líneas nuevas pero se conserva en las existentes', async () => {
      const draft = await createDraft();
      await call('PUT', `${URL}/${draft.id}/costs`, costLines([[types.COMMISSIONS, '8']]));
      await app.prisma.stockEntryCostType.update({
        where: { id: types.COMMISSIONS },
        data: { isActive: false },
      });
      const other = await createDraft();
      expect(
        (await call('PUT', `${URL}/${other.id}/costs`, costLines([[types.COMMISSIONS, '8']])))
          .statusCode,
      ).toBe(422);
      expect(
        (
          await call(
            'PUT',
            `${URL}/${draft.id}/costs`,
            costLines([
              [types.COMMISSIONS, '9'],
              [types.OTHER, '1'],
            ]),
          )
        ).statusCode,
      ).toBe(200);
    });

    it('un ingreso confirmado no admite cambiar sus costos', async () => {
      const variant = await createVariant();
      const draft = await createDraft();
      await call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, 1, '4']]));
      await call('POST', `${URL}/${draft.id}/confirm`);
      expect(
        (await call('PUT', `${URL}/${draft.id}/costs`, costLines([[types.OTHER, '1']]))).statusCode,
      ).toBe(422);
    });
  });

  describe('diferencias entre cantidad esperada y recibida (C2)', () => {
    it('exige justificación para confirmar cuando difieren; con ella confirma', async () => {
      const variant = await createVariant();
      const draft = await createDraft();
      const put = (differenceReason?: string) =>
        call('PUT', `${URL}/${draft.id}/items`, {
          items: [
            {
              variantId: variant.id,
              expectedQty: 10,
              receivedQty: 8,
              unitPrice: '3',
              ...(differenceReason !== undefined && { differenceReason }),
            },
          ],
        });

      const without = await put();
      expect(without.json().data.blockers.join(' ')).toMatch(/Justifique la diferencia/);
      const denied = await call('POST', `${URL}/${draft.id}/confirm`);
      expect(denied.statusCode).toBe(422);
      expect(denied.json().error.details.blockers.join(' ')).toMatch(/Justifique la diferencia/);
      // Un texto en blanco no cuenta como justificación.
      expect((await put('   ')).json().data.blockers.length).toBe(1);
      expect(await stockOf(variant.id)).toBe(0);

      expect((await put('Faltaron 2 piezas en la caja')).json().data.blockers).toEqual([]);
      expect((await call('POST', `${URL}/${draft.id}/confirm`)).statusCode).toBe(200);
      expect(await stockOf(variant.id)).toBe(8);
      const item = await app.prisma.stockEntryItem.findFirstOrThrow({
        where: { stockEntryId: draft.id },
      });
      expect(item.differenceReason).toBe('Faltaron 2 piezas en la caja');
    });

    it('sin cantidad esperada o con cantidades iguales no se pide justificación', async () => {
      const a = await createVariant();
      const b = await createVariant();
      const draft = await createDraft();
      const res = await call('PUT', `${URL}/${draft.id}/items`, {
        items: [
          { variantId: a.id, receivedQty: 3, unitPrice: '2' },
          { variantId: b.id, expectedQty: 4, receivedQty: 4, unitPrice: '2' },
        ],
      });
      expect(res.json().data.blockers).toEqual([]);
    });
  });

  describe('confirmación', () => {
    it('aumenta el stock, fija el último costo y deja movimientos y auditoría (bolivianos)', async () => {
      const a = await createVariant({ salePrice: '99' });
      const b = await createVariant({ salePrice: '49' });
      await setStock(app.prisma, a.id, 5, { userId });
      const draft = await createDraft({ documentNumber: 'F-777' });
      await call(
        'PUT',
        `${URL}/${draft.id}/costs`,
        costLines([
          [types.TRANSPORT, '10'],
          [types.PACKAGING, '0.5'],
          [types.OTHER, '0.5'],
        ]),
      );
      await call(
        'PUT',
        `${URL}/${draft.id}/items`,
        lines([
          [a.id, 10, '10'],
          [b.id, 5, '20'],
        ]),
      );

      const res = await call('POST', `${URL}/${draft.id}/confirm`);
      expect(res.statusCode).toBe(200);
      const data = res.json().data as Detail & { confirmedAt: string; confirmedByName: string };
      expect(data).toMatchObject({ status: 'CONFIRMED', confirmedByName: expect.any(String) });
      expect(data.confirmedAt).toBeTruthy();

      // Saldos: 5 + 10 y 0 + 5.
      expect(await stockOf(a.id)).toBe(15);
      expect(await stockOf(b.id)).toBe(5);

      // Un movimiento por línea, con costo total, referencia al ingreso y usuario.
      const movements = await app.prisma.inventoryMovement.findMany({
        where: { referenceId: draft.id },
        orderBy: { id: 'asc' },
      });
      expect(movements).toHaveLength(2);
      const forA = movements.find((movement) => movement.variantId === a.id);
      expect(forA).toMatchObject({
        type: 'STOCK_ENTRY',
        quantity: 10,
        balanceBefore: 5,
        balanceAfter: 15,
        referenceType: 'STOCK_ENTRY',
        referenceId: draft.id,
        userId,
      });
      expect(forA?.unitCost?.toFixed(4)).toBe('10.5500');
      expect(forA?.reason).toMatch(/^Ingreso ING-\d{6}$/);

      // Último costo actualizado; el precio de venta NO se toca.
      const refreshedA = await app.prisma.productVariant.findUniqueOrThrow({ where: { id: a.id } });
      const refreshedB = await app.prisma.productVariant.findUniqueOrThrow({ where: { id: b.id } });
      expect(refreshedA.costPrice.toFixed(4)).toBe('10.5500');
      expect(refreshedB.costPrice.toFixed(4)).toBe('21.1000');
      expect(refreshedA.salePrice.toFixed(2)).toBe('99.00');
      expect(refreshedB.salePrice.toFixed(2)).toBe('49.00');

      // Costos guardados en cada ítem.
      const items = await app.prisma.stockEntryItem.findMany({ where: { stockEntryId: draft.id } });
      expect(items.map((item) => item.unitExtraCost?.toFixed(4)).sort()).toEqual([
        '0.5500',
        '1.1000',
      ]);

      const audit = await app.prisma.auditLog.findFirst({
        where: { action: 'stock_entry.confirmed', entityId: draft.id },
      });
      expect(audit?.userId).toBe(userId);
      expect(JSON.stringify(audit?.after)).toContain('"previousCost":"1.0000"');
      expect(JSON.stringify(audit?.after)).toContain('Transporte');
    });

    it('en dólares fija el tipo de cambio, guarda el precio original y el equivalente en Bs', async () => {
      const a = await createVariant({ salePrice: '99' });
      const b = await createVariant();
      const draft = await createDraft({ currency: 'USD', exchangeRate: '6.96' });
      await call(
        'PUT',
        `${URL}/${draft.id}/costs`,
        costLines([
          [types.CUSTOMS, '100'],
          [types.COMMISSIONS, '20.5'],
        ]),
      );
      await call(
        'PUT',
        `${URL}/${draft.id}/items`,
        lines([
          [a.id, 10, '5'],
          [b.id, 4, '12.5'],
        ]),
      );

      const res = await call('POST', `${URL}/${draft.id}/confirm`);
      expect(res.statusCode, res.body).toBe(200);
      const confirmed = res.json().data as Detail;
      expect(confirmed).toMatchObject({
        status: 'CONFIRMED',
        currency: 'USD',
        exchangeRate: '6.9600',
      });
      expect(confirmed.totals).toEqual({
        purchaseOriginal: '100.00',
        purchaseBob: '696.00',
        extras: '120.50',
        grand: '816.50',
      });
      // Lo confirmado se lee tal como quedó guardado.
      const refetched = await detailOf(draft.id);
      expect(refetched.items.find((item) => item.sku === a.sku)?.cost).toEqual({
        unitPrice: '5.0000',
        unitCostBob: '34.8000',
        subtotalOriginal: '50.0000',
        subtotalBob: '348.0000',
        extraAllocated: '60.25',
        totalCost: '408.2500',
        unitExtraCost: '6.0250',
        unitTotalCost: '40.8250',
      });

      const stored = await app.prisma.stockEntryItem.findFirstOrThrow({
        where: { stockEntryId: draft.id, variantId: a.id },
      });
      expect({
        unitPrice: stored.unitPrice.toFixed(4),
        unitCost: stored.unitCost.toFixed(4),
        unitExtraCost: stored.unitExtraCost?.toFixed(4),
        extraCostAllocated: stored.extraCostAllocated?.toFixed(2),
        totalCost: stored.totalCost?.toFixed(4),
      }).toEqual({
        unitPrice: '5.0000',
        unitCost: '34.8000',
        unitExtraCost: '6.0250',
        extraCostAllocated: '60.25',
        totalCost: '408.2500',
      });
      // La suma de lo asignado a los ítems es exactamente el total de costos adicionales.
      const items = await app.prisma.stockEntryItem.findMany({ where: { stockEntryId: draft.id } });
      const assigned = items.reduce((sum, item) => sum + Number(item.extraCostAllocated), 0);
      expect(assigned.toFixed(2)).toBe('120.50');

      // Movimiento y último costo en Bs: 34,80 + 6,025 = 40,825 por pieza.
      const movement = await app.prisma.inventoryMovement.findFirstOrThrow({
        where: { variantId: a.id },
      });
      expect(movement.unitCost?.toFixed(4)).toBe('40.8250');
      expect(
        (
          await app.prisma.productVariant.findUniqueOrThrow({ where: { id: a.id } })
        ).costPrice.toFixed(4),
      ).toBe('40.8250');
      expect(await stockOf(a.id)).toBe(10);
      expect(await stockOf(b.id)).toBe(4);

      const audit = await app.prisma.auditLog.findFirstOrThrow({
        where: { action: 'stock_entry.confirmed', entityId: draft.id },
      });
      const after = audit.after as { currency: string; exchangeRate: string; costs: unknown[] };
      expect(after).toMatchObject({ currency: 'USD', exchangeRate: '6.9600' });
      expect(after.costs).toHaveLength(2);
    });

    it('tras confirmar, el tipo de cambio y los datos quedan fijos', async () => {
      const variant = await createVariant();
      const draft = await createDraft({ currency: 'USD', exchangeRate: '6.96' });
      await call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, 1, '5']]));
      expect((await call('POST', `${URL}/${draft.id}/confirm`)).statusCode).toBe(200);
      expect((await call('PATCH', `${URL}/${draft.id}`, { exchangeRate: '8' })).statusCode).toBe(
        422,
      );
      expect(
        (
          await app.prisma.stockEntry.findUniqueOrThrow({ where: { id: draft.id } })
        ).exchangeRate?.toFixed(4),
      ).toBe('6.9600');
    });

    it('reparte los centavos sobrantes por mayor resto: la suma cuadra exactamente', async () => {
      const variants = [await createVariant(), await createVariant(), await createVariant()];
      const draft = await createDraft();
      await call('PUT', `${URL}/${draft.id}/costs`, costLines([[types.TRANSPORT, '1']]));
      await call(
        'PUT',
        `${URL}/${draft.id}/items`,
        lines(variants.map((variant): [string, number, string] => [variant.id, 1, '5'])),
      );
      const res = await call('POST', `${URL}/${draft.id}/confirm`);
      expect(res.statusCode).toBe(200);
      const extras = (res.json().data as Detail).items
        .map((item) => Number(item.cost?.unitExtraCost))
        .sort();
      // 1,00 entre tres líneas iguales: 0,33 + 0,33 + 0,34.
      expect(extras).toEqual([0.33, 0.33, 0.34]);
      expect(extras.reduce((sum, value) => sum + value, 0).toFixed(2)).toBe('1.00');
    });

    it('solo se confirma una vez: repetir no duplica stock ni movimientos', async () => {
      const variant = await createVariant();
      const draft = await createDraft();
      await call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, 4, '3']]));

      expect((await call('POST', `${URL}/${draft.id}/confirm`)).statusCode).toBe(200);
      const again = await call('POST', `${URL}/${draft.id}/confirm`);
      expect(again.statusCode).toBe(422);
      expect(await stockOf(variant.id)).toBe(4);
      expect(await app.prisma.inventoryMovement.count()).toBe(1);
      expect(await app.prisma.auditLog.count({ where: { action: 'stock_entry.confirmed' } })).toBe(
        1,
      );
    });

    it('dos confirmaciones simultáneas: solo una se aplica (concurrencia)', async () => {
      const a = await createVariant();
      const b = await createVariant();
      const draft = await createDraft({ currency: 'USD', exchangeRate: '7' });
      await call('PUT', `${URL}/${draft.id}/costs`, costLines([[types.CUSTOMS, '2']]));
      await call(
        'PUT',
        `${URL}/${draft.id}/items`,
        lines([
          [a.id, 3, '7'],
          [b.id, 2, '9'],
        ]),
      );

      const results = await Promise.all([
        call('POST', `${URL}/${draft.id}/confirm`),
        call('POST', `${URL}/${draft.id}/confirm`),
      ]);
      expect(results.map((result) => result.statusCode).sort()).toEqual([200, 422]);
      expect(await stockOf(a.id)).toBe(3);
      expect(await stockOf(b.id)).toBe(2);
      expect(await app.prisma.inventoryMovement.count()).toBe(2);
      expect(await app.prisma.auditLog.count({ where: { action: 'stock_entry.confirmed' } })).toBe(
        1,
      );
    });

    it('confirmación y edición simultáneas: o se confirma lo guardado o la edición falla, nunca mezcla', async () => {
      const variant = await createVariant();
      const draft = await createDraft();
      await call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, 2, '5']]));
      const [confirm, edit] = await Promise.all([
        call('POST', `${URL}/${draft.id}/confirm`),
        call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, 9, '5']])),
      ]);
      expect(confirm.statusCode).toBe(200);
      const quantity = await stockOf(variant.id);
      // Si la edición ganó el bloqueo, se confirmó lo editado; si no, la edición fue rechazada.
      expect(
        edit.statusCode === 200 ? quantity === 9 : quantity === 2 && edit.statusCode === 422,
      ).toBe(true);
      expect(await app.prisma.inventoryMovement.count()).toBe(1);
    });

    it('confirmaciones simultáneas de ingresos distintos sobre la misma variante suman sin perder piezas', async () => {
      const variant = await createVariant();
      const ids: string[] = [];
      for (const quantity of [2, 3, 4]) {
        const draft = await createDraft();
        await call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, quantity, '1']]));
        ids.push(draft.id);
      }
      const results = await Promise.all(ids.map((id) => call('POST', `${URL}/${id}/confirm`)));
      expect(results.every((result) => result.statusCode === 200)).toBe(true);
      expect(await stockOf(variant.id)).toBe(9);
      const movements = await app.prisma.inventoryMovement.findMany({
        where: { variantId: variant.id },
        orderBy: { id: 'asc' },
      });
      // El libro es una cadena continua: cada «antes» es el «después» del anterior.
      expect(movements.map((movement) => movement.balanceBefore)).toEqual(
        movements.map((_, index) => movements[index - 1]?.balanceAfter ?? 0),
      );
      expect(movements.at(-1)?.balanceAfter).toBe(9);
    });

    it('no confirma con costos adicionales si el valor de compra es cero (ADR-015)', async () => {
      const variant = await createVariant();
      const draft = await createDraft();
      await call('PUT', `${URL}/${draft.id}/costs`, costLines([[types.TRANSPORT, '5']]));
      const put = await call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, 3, '0']]));
      expect(put.json().data.blockers.join(' ')).toMatch(/valor de compra es cero/);

      const res = await call('POST', `${URL}/${draft.id}/confirm`);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('BUSINESS_RULE_VIOLATION');
      expect(await stockOf(variant.id)).toBe(0);
      expect((await detailOf(draft.id)).status).toBe('DRAFT');
    });

    it('sin costos adicionales sí confirma un ingreso con costo cero', async () => {
      const variant = await createVariant();
      const draft = await createDraft();
      await call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, 3, '0']]));
      expect((await call('POST', `${URL}/${draft.id}/confirm`)).statusCode).toBe(200);
      expect(await stockOf(variant.id)).toBe(3);
    });

    it('no confirma un ingreso vacío ni uno sin piezas recibidas', async () => {
      const variant = await createVariant();
      const empty = await createDraft();
      expect((await call('POST', `${URL}/${empty.id}/confirm`)).statusCode).toBe(422);

      const zero = await createDraft();
      await call('PUT', `${URL}/${zero.id}/items`, lines([[variant.id, 0, '5']]));
      expect((await call('POST', `${URL}/${zero.id}/confirm`)).statusCode).toBe(422);
      expect(await app.prisma.inventoryMovement.count()).toBe(0);
    });

    it('si falla una línea no queda nada a medias (reversión completa)', async () => {
      const variants = [await createVariant(), await createVariant()].sort((x, y) =>
        x.id < y.id ? -1 : 1,
      );
      const [first, second] = variants as [(typeof variants)[number], (typeof variants)[number]];
      // La segunda línea que se procesa desbordaría el saldo máximo.
      await setStock(app.prisma, second.id, 2_147_483_647, { userId });
      const draft = await createDraft({ currency: 'USD', exchangeRate: '7' });
      await call('PUT', `${URL}/${draft.id}/costs`, costLines([[types.CUSTOMS, '1']]));
      await call(
        'PUT',
        `${URL}/${draft.id}/items`,
        lines([
          [first.id, 5, '2'],
          [second.id, 1, '2'],
        ]),
      );

      const res = await call('POST', `${URL}/${draft.id}/confirm`);
      expect(res.statusCode).toBe(422);
      expect(await app.prisma.inventoryMovement.count({ where: { referenceId: draft.id } })).toBe(
        0,
      );
      expect(await stockOf(first.id)).toBe(0);
      expect(
        (
          await app.prisma.productVariant.findUniqueOrThrow({ where: { id: first.id } })
        ).costPrice.toFixed(4),
      ).toBe('1.0000');
      expect(await app.prisma.auditLog.count({ where: { action: 'stock_entry.confirmed' } })).toBe(
        0,
      );
      // Tampoco quedan costos asignados a medias en los ítems.
      const items = await app.prisma.stockEntryItem.findMany({ where: { stockEntryId: draft.id } });
      expect(items.every((item) => item.unitExtraCost === null && item.totalCost === null)).toBe(
        true,
      );
      expect((await detailOf(draft.id)).status).toBe('DRAFT');
    });

    it('la variante deja de admitir «stock inicial» una vez que tiene un ingreso', async () => {
      const variant = await createVariant();
      const draft = await createDraft();
      await call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, 2, '4']]));
      await call('POST', `${URL}/${draft.id}/confirm`);

      const inventoryReader = await sessionWith([PERMISSIONS.INVENTORY_READ]);
      const list = await call(
        'GET',
        '/api/v1/inventory?initialOnly=true',
        undefined,
        inventoryReader,
      );
      expect(
        (list.json().data as { variantId: string }[]).map((item) => item.variantId),
      ).not.toContain(variant.id);
    });
  });

  describe('idempotencia de la creación (Idempotency-Key)', () => {
    const create = (key: string, payload: object = { supplierId }) =>
      app.inject({
        method: 'POST',
        url: URL,
        headers: { cookie, 'idempotency-key': key },
        payload,
      });
    const documents = () => app.prisma.stockEntry.count();
    const audits = () => app.prisma.auditLog.count({ where: { action: 'stock_entry.created' } });

    it('repetir con la misma clave devuelve el mismo borrador: un ingreso y una auditoría', async () => {
      const key = randomUUID();
      const first = await create(key);
      expect(first.statusCode, first.body).toBe(201);
      expect(first.headers['idempotent-replay']).toBeUndefined();
      const again = await create(key);
      expect(again.statusCode, again.body).toBe(200);
      expect(again.headers['idempotent-replay']).toBe('true');
      expect(again.json()).toEqual(first.json());

      expect(await documents()).toBe(1);
      expect(await audits()).toBe(1);
    });

    it('la misma clave con otro cuerpo es 409 IDEMPOTENCY_KEY_REUSED y no crea nada', async () => {
      const key = randomUUID();
      expect((await create(key)).statusCode).toBe(201);

      const other = await create(key, { supplierId, notes: 'Otra nota' });
      expect(other.statusCode).toBe(409);
      expect(other.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(await documents()).toBe(1);
      expect(await audits()).toBe(1);
    });

    it('tres peticiones iguales en paralelo crean un solo ingreso', async () => {
      const key = randomUUID();
      const responses = await Promise.all([create(key), create(key), create(key)]);
      expect(responses.map((res) => res.statusCode).sort()).toEqual([200, 200, 201]);
      expect(responses.filter((res) => res.headers['idempotent-replay'] === 'true')).toHaveLength(
        2,
      );
      expect(
        new Set(responses.map((res) => res.json<{ data: { id: string } }>().data.id)).size,
      ).toBe(1);
      expect(await documents()).toBe(1);
      expect(await audits()).toBe(1);
    });

    it('una clave distinta o sin clave sigue creando ingresos nuevos (compatibilidad)', async () => {
      expect((await create(randomUUID())).statusCode).toBe(201);
      expect((await create(randomUUID())).statusCode).toBe(201);
      expect((await call('POST', URL, { supplierId })).statusCode).toBe(201);
      expect(await documents()).toBe(3);
    });

    it('una clave que no es UUID es 400 y no crea nada', async () => {
      const res = await create('no-es-uuid');
      expect(res.statusCode).toBe(400);
      expect(await documents()).toBe(0);
    });
  });

  describe('idempotencia de la confirmación (Idempotency-Key)', () => {
    const confirmWithKey = (id: string, key: string) =>
      app.inject({
        method: 'POST',
        url: `${URL}/${id}/confirm`,
        headers: { cookie, 'idempotency-key': key },
      });

    async function readyDraft(variantId: string, quantity: number) {
      const draft = await createDraft();
      const res = await call(
        'PUT',
        `${URL}/${draft.id}/items`,
        lines([[variantId, quantity, '10']]),
      );
      expect(res.statusCode, res.body).toBe(200);
      return draft;
    }

    it('repetir con la misma clave devuelve el ingreso confirmado sin duplicar stock ni auditoría', async () => {
      const variant = await createVariant();
      const draft = await readyDraft(variant.id, 4);
      const key = randomUUID();

      const first = await confirmWithKey(draft.id, key);
      expect(first.statusCode, first.body).toBe(200);
      const again = await confirmWithKey(draft.id, key);
      expect(again.statusCode).toBe(200);
      expect(again.headers['idempotent-replay']).toBe('true');
      expect(again.json()).toEqual(first.json());

      expect(await stockOf(variant.id)).toBe(4);
      expect(await app.prisma.inventoryMovement.count({ where: { referenceId: draft.id } })).toBe(
        1,
      );
      expect(await app.prisma.auditLog.count({ where: { action: 'stock_entry.confirmed' } })).toBe(
        1,
      );

      // Sin clave, la protección por estado responde como siempre.
      expect((await call('POST', `${URL}/${draft.id}/confirm`)).statusCode).toBe(422);
    });

    it('la misma clave para confirmar otro ingreso es un conflicto (409) y no lo confirma', async () => {
      const variant = await createVariant();
      const a = await readyDraft(variant.id, 1);
      const b = await readyDraft(variant.id, 2);
      const key = randomUUID();
      expect((await confirmWithKey(a.id, key)).statusCode).toBe(200);

      const res = await confirmWithKey(b.id, key);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect((await detailOf(b.id)).status).toBe('DRAFT');
      expect(await stockOf(variant.id)).toBe(1);
    });

    it('dos confirmaciones simultáneas con la misma clave: un solo movimiento', async () => {
      const variant = await createVariant();
      const draft = await readyDraft(variant.id, 3);
      const key = randomUUID();
      const responses = await Promise.all([
        confirmWithKey(draft.id, key),
        confirmWithKey(draft.id, key),
      ]);
      for (const res of responses) expect(res.statusCode, res.body).toBe(200);
      expect(responses.filter((res) => res.headers['idempotent-replay'] === 'true')).toHaveLength(
        1,
      );
      expect(await stockOf(variant.id)).toBe(3);
      expect(await app.prisma.inventoryMovement.count({ where: { referenceId: draft.id } })).toBe(
        1,
      );
    });
  });

  describe('alta rápida de pieza nueva (C1 / P-24)', () => {
    async function setup() {
      const category = await app.prisma.category.create({
        data: { name: 'Anillos', slug: `anillos-${Date.now()}` },
      });
      const draft = await createDraft({ currency: 'USD', exchangeRate: '7' });
      const quick = (payload: object, id = draft.id, c = cookie) =>
        call('POST', `${URL}/${id}/items/quick`, payload, c);
      return { category, draft, quick };
    }

    it('crea producto ACTIVO + variante con SKU correlativo, precio 0, ficha incompleta e ítem del borrador', async () => {
      const { category, draft, quick } = await setup();
      const res = await quick({
        categoryId: category.id,
        name: 'Anillo corazón',
        supplierCode: 'CN-1001',
        receivedQty: 6,
        unitPrice: '2.5',
      });
      expect(res.statusCode, res.body).toBe(201);
      const body = res.json<{ data: Detail; meta: { variantId: string; warnings: string[] } }>();
      expect(body.meta.warnings).toEqual([]);
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0]).toMatchObject({
        profileIncomplete: true,
        cost: { unitPrice: '2.5000', unitCostBob: '17.5000', subtotalBob: '105.0000' },
      });

      const variant = await app.prisma.productVariant.findUniqueOrThrow({
        where: { id: body.meta.variantId },
        include: { product: true },
      });
      expect(variant.sku).toMatch(/^SKU-\d{6}$/);
      expect(variant.barcode).toBe('CN-1001');
      expect(variant.salePrice.toFixed(2)).toBe('0.00');
      expect(variant).toMatchObject({ status: 'ACTIVE', label: 'Única' });
      expect(variant.product).toMatchObject({
        name: 'Anillo corazón',
        status: 'ACTIVE',
        profileIncomplete: true,
        categoryId: category.id,
      });
      const link = await app.prisma.supplierProduct.findUniqueOrThrow({
        where: { supplierId_variantId: { supplierId, variantId: variant.id } },
      });
      expect(link.supplierCode).toBe('CN-1001');

      // No toca el stock hasta confirmar; después entra con su costo en Bs.
      expect(await stockOf(variant.id)).toBe(0);
      expect(await app.prisma.inventoryMovement.count()).toBe(0);
      expect((await call('POST', `${URL}/${draft.id}/confirm`)).statusCode).toBe(200);
      expect(await stockOf(variant.id)).toBe(6);
      expect(
        (
          await app.prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
        ).costPrice.toFixed(4),
      ).toBe('17.5000');

      // La web la ve como ficha incompleta y se puede marcar como completa.
      const product = (await call('GET', `/api/v1/products/${variant.productId}`)).json().data;
      expect(product.profileIncomplete).toBe(true);
      const done = await call('PATCH', `/api/v1/products/${variant.productId}`, {
        profileIncomplete: false,
      });
      expect(done.json().data.profileIncomplete).toBe(false);
    });

    it('deja auditoría del producto y del ingreso', async () => {
      const { category, draft, quick } = await setup();
      const res = await quick({
        categoryId: category.id,
        name: 'Collar',
        receivedQty: 1,
        unitPrice: '1',
      });
      expect(res.statusCode).toBe(201);
      const created = await app.prisma.auditLog.findFirstOrThrow({
        where: { action: 'product.created' },
      });
      expect(created.userId).toBe(userId);
      expect(created.metadata).toMatchObject({
        source: 'stock_entry_quick_create',
        stockEntryId: draft.id,
      });
      const entryAudit = await app.prisma.auditLog.findFirstOrThrow({
        where: { action: 'stock_entry.item_quick_created', entityId: draft.id },
      });
      expect(entryAudit.userId).toBe(userId);
    });

    it('sin código del proveedor la pieza no lleva código de barras', async () => {
      const { category, quick } = await setup();
      const res = await quick({
        categoryId: category.id,
        name: 'Dije',
        receivedQty: 2,
        unitPrice: '1',
      });
      const variant = await app.prisma.productVariant.findUniqueOrThrow({
        where: { id: res.json().meta.variantId },
      });
      expect(variant.barcode).toBeNull();
      const link = await app.prisma.supplierProduct.findFirstOrThrow({
        where: { variantId: variant.id },
      });
      expect(link.supplierCode).toBeNull();
    });

    it('código del proveedor repetido (código de barras o SKU existente): avisa y no lo guarda como código de barras', async () => {
      const { category, quick } = await setup();
      const existing = await createVariant();
      await app.prisma.productVariant.update({
        where: { id: existing.id },
        data: { barcode: 'REPETIDO-1' },
      });

      const byBarcode = await quick({
        categoryId: category.id,
        name: 'Pieza A',
        supplierCode: 'REPETIDO-1',
        receivedQty: 1,
        unitPrice: '1',
      });
      expect(byBarcode.statusCode).toBe(201);
      expect(byBarcode.json().meta.warnings[0]).toMatch(/no se guardó como código de barras/);
      const a = await app.prisma.productVariant.findUniqueOrThrow({
        where: { id: byBarcode.json().meta.variantId },
      });
      expect(a.barcode).toBeNull();
      // El código sí queda en la relación proveedor-pieza.
      expect(
        (await app.prisma.supplierProduct.findFirstOrThrow({ where: { variantId: a.id } }))
          .supplierCode,
      ).toBe('REPETIDO-1');

      const bySku = await quick({
        categoryId: category.id,
        name: 'Pieza B',
        supplierCode: existing.sku,
        receivedQty: 1,
        unitPrice: '1',
      });
      expect(bySku.statusCode).toBe(201);
      expect(bySku.json().meta.warnings[0]).toMatch(/no se guardó como código de barras/);
      const b = await app.prisma.productVariant.findUniqueOrThrow({
        where: { id: bySku.json().meta.variantId },
      });
      expect(b.barcode).toBeNull();
      // Ambas piezas se identifican por su SKU propio.
      expect(a.sku).not.toBe(b.sku);
    });

    it('el mismo código del proveedor en una segunda pieza avisa y no choca con la unicidad', async () => {
      const { category, quick } = await setup();
      const first = await quick({
        categoryId: category.id,
        name: 'Pieza 1',
        supplierCode: 'CN-77',
        receivedQty: 1,
        unitPrice: '1',
      });
      expect(first.json().meta.warnings).toEqual([]);
      const second = await quick({
        categoryId: category.id,
        name: 'Pieza 2',
        supplierCode: 'CN-77',
        receivedQty: 1,
        unitPrice: '1',
      });
      expect(second.statusCode).toBe(201);
      expect(second.json().meta.warnings).toHaveLength(2);
      expect(await app.prisma.supplierProduct.count()).toBe(2);
    });

    it('es atómica: si algo falla no queda producto, variante, ítem ni auditoría', async () => {
      const { category, draft, quick } = await setup();
      // Categoría inexistente.
      const missing = await quick({
        categoryId: UNKNOWN_ID,
        name: 'X',
        receivedQty: 1,
        unitPrice: '1',
      });
      expect(missing.statusCode).toBe(404);
      // Categoría inactiva.
      await app.prisma.category.update({ where: { id: category.id }, data: { isActive: false } });
      expect(
        (await quick({ categoryId: category.id, name: 'X', receivedQty: 1, unitPrice: '1' }))
          .statusCode,
      ).toBe(404);
      // Precio que convertido no cabe en la columna.
      await app.prisma.category.update({ where: { id: category.id }, data: { isActive: true } });
      expect(
        (await quick({ categoryId: category.id, name: 'X', receivedQty: 1, unitPrice: '99999999' }))
          .statusCode,
      ).toBe(400);

      expect(await app.prisma.product.count()).toBe(0);
      expect(await app.prisma.productVariant.count()).toBe(0);
      expect(await app.prisma.stockEntryItem.count({ where: { stockEntryId: draft.id } })).toBe(0);
      expect(await app.prisma.supplierProduct.count()).toBe(0);
      expect(await app.prisma.auditLog.count({ where: { action: 'product.created' } })).toBe(0);
      expect(
        await app.prisma.auditLog.count({ where: { action: 'stock_entry.item_quick_created' } }),
      ).toBe(0);
    });

    it('valida los datos mínimos y el estado del ingreso', async () => {
      const { category, draft, quick } = await setup();
      for (const bad of [
        { name: 'X', receivedQty: 1, unitPrice: '1' },
        { categoryId: category.id, receivedQty: 1, unitPrice: '1' },
        { categoryId: category.id, name: '   ', receivedQty: 1, unitPrice: '1' },
        { categoryId: category.id, name: 'X', receivedQty: 0, unitPrice: '1' },
        { categoryId: category.id, name: 'X', receivedQty: 1.5, unitPrice: '1' },
        { categoryId: category.id, name: 'X', receivedQty: 1 },
        { categoryId: category.id, name: 'X', receivedQty: 1, unitPrice: '-1' },
      ]) {
        expect((await quick(bad)).statusCode, JSON.stringify(bad)).toBe(400);
      }
      expect(
        (
          await quick(
            { categoryId: category.id, name: 'X', receivedQty: 1, unitPrice: '1' },
            UNKNOWN_ID,
          )
        ).statusCode,
      ).toBe(404);

      await call('POST', `${URL}/${draft.id}/cancel`);
      expect(
        (await quick({ categoryId: category.id, name: 'X', receivedQty: 1, unitPrice: '1' }))
          .statusCode,
      ).toBe(422);
      expect(await app.prisma.product.count()).toBe(0);
    });
  });

  describe('historial de costos (C10)', () => {
    const history = (variantId: string, c = cookie, query = '') =>
      call('GET', `/api/v1/products/variants/${variantId}/cost-history${query}`, undefined, c);

    it('lista las compras confirmadas con precio original, tipo de cambio, adicionales y costo total', async () => {
      const variant = await createVariant();
      const other = await createVariant();

      const bob = await createDraft({ documentNumber: 'B-1' });
      await call('PUT', `${URL}/${bob.id}/items`, lines([[variant.id, 3, '10']]));
      await call('PUT', `${URL}/${bob.id}/costs`, costLines([[types.TRANSPORT, '3']]));
      await call('POST', `${URL}/${bob.id}/confirm`);

      const usd = await createDraft({ currency: 'USD', exchangeRate: '6.96' });
      await call(
        'PUT',
        `${URL}/${usd.id}/items`,
        lines([
          [variant.id, 10, '5'],
          [other.id, 4, '12.5'],
        ]),
      );
      await call(
        'PUT',
        `${URL}/${usd.id}/costs`,
        costLines([
          [types.CUSTOMS, '100'],
          [types.COMMISSIONS, '20.5'],
        ]),
      );
      await call('POST', `${URL}/${usd.id}/confirm`);

      // Un borrador y una variante ajena no aparecen.
      const draft = await createDraft();
      await call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, 1, '1']]));

      const res = await history(variant.id);
      expect(res.statusCode).toBe(200);
      const rows = res.json().data as Record<string, unknown>[];
      expect(res.json().meta).toEqual({ page: 1, pageSize: 25, total: 2 });
      // Más reciente primero.
      expect(rows[0]).toMatchObject({
        entryNumber: usd.number,
        supplierName: 'Proveedor de prueba',
        currency: 'USD',
        exchangeRate: '6.9600',
        quantity: 10,
        unitPrice: '5.0000',
        unitCostBob: '34.8000',
        unitExtraCost: '6.0250',
        unitTotalCost: '40.8250',
      });
      expect(rows[1]).toMatchObject({
        entryNumber: bob.number,
        currency: 'BOB',
        exchangeRate: null,
        quantity: 3,
        unitPrice: '10.0000',
        unitCostBob: '10.0000',
        unitExtraCost: '1.0000',
        unitTotalCost: '11.0000',
      });
      expect(rows[0]?.confirmedAt).toBeTruthy();

      // Paginación.
      const page = await history(variant.id, cookie, '?pageSize=1&page=2');
      expect((page.json().data as unknown[]).length).toBe(1);
      expect(page.json().meta).toEqual({ page: 2, pageSize: 1, total: 2 });
    });

    it('401 sin sesión, 403 sin costs:read, 400 con id inválido y 404 si la variante no existe', async () => {
      const variant = await createVariant();
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/v1/products/variants/${variant.id}/cost-history`,
          })
        ).statusCode,
      ).toBe(401);
      const seller = await sessionWith([PERMISSIONS.CATALOG_READ, PERMISSIONS.INVENTORY_READ]);
      expect((await history(variant.id, seller)).statusCode).toBe(403);
      expect((await history('no-es-uuid')).statusCode).toBe(400);
      expect((await history(variant.id, cookie, '?page=0')).statusCode).toBe(400);
      expect((await history(UNKNOWN_ID)).statusCode).toBe(404);
      expect((await history(variant.id)).json().data).toEqual([]);
    });
  });

  describe('cancelación y estados finales', () => {
    it('cancela un borrador y ya no se puede editar ni confirmar', async () => {
      const variant = await createVariant();
      const draft = await createDraft();
      await call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, 2, '4']]));
      const cancelled = await call('POST', `${URL}/${draft.id}/cancel`);
      expect(cancelled.statusCode).toBe(200);
      expect(cancelled.json().data.status).toBe('CANCELLED');

      expect((await call('POST', `${URL}/${draft.id}/confirm`)).statusCode).toBe(422);
      expect((await call('PATCH', `${URL}/${draft.id}`, { notes: 'x' })).statusCode).toBe(422);
      expect(
        (await call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, 1, '1']]))).statusCode,
      ).toBe(422);
      expect(await stockOf(variant.id)).toBe(0);
      expect(await app.prisma.auditLog.count({ where: { action: 'stock_entry.cancelled' } })).toBe(
        1,
      );
    });

    it('un ingreso confirmado es inmutable: no se edita ni se cancela', async () => {
      const variant = await createVariant();
      const draft = await createDraft();
      await call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, 2, '4']]));
      await call('POST', `${URL}/${draft.id}/confirm`);

      expect((await call('PATCH', `${URL}/${draft.id}`, { notes: 'x' })).statusCode).toBe(422);
      expect(
        (await call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, 9, '1']]))).statusCode,
      ).toBe(422);
      expect((await call('POST', `${URL}/${draft.id}/cancel`)).statusCode).toBe(422);
      expect(await stockOf(variant.id)).toBe(2);
    });
  });

  describe('consulta', () => {
    it('lista con filtros por estado y búsqueda por documento o número', async () => {
      const variant = await createVariant();
      const confirmed = await createDraft({ documentNumber: 'FAC-001' });
      await call('PUT', `${URL}/${confirmed.id}/items`, lines([[variant.id, 1, '1']]));
      await call('POST', `${URL}/${confirmed.id}/confirm`);
      const draft = await createDraft({ documentNumber: 'OTRO-9' });

      const ids = async (query: string) =>
        ((await call('GET', `${URL}${query}`)).json().data as { id: string }[]).map(
          (entry) => entry.id,
        );
      expect(await ids('')).toEqual([draft.id, confirmed.id]); // más reciente primero
      expect(await ids('?status=CONFIRMED')).toEqual([confirmed.id]);
      expect(await ids('?q=fac-0')).toEqual([confirmed.id]);
      expect(await ids(`?q=${draft.number}`)).toEqual([draft.id]);
      expect(await ids(`?supplierId=${supplierId}`)).toHaveLength(2);
      expect((await call('GET', `${URL}/${UNKNOWN_ID}`)).statusCode).toBe(404);
    });
  });
});

describe('tipos de costo de ingreso (Q-08)', () => {
  let app: App;
  let adminCookie: string;
  let managerCookie: string;
  const URL = '/api/v1/stock-entry-cost-types';

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
    await seedCostTypes(app.prisma);
    const admin = await createTestUser(app.prisma, {
      permissions: [PERMISSIONS.STOCK_ENTRIES_READ, PERMISSIONS.SETTINGS_MANAGE],
    });
    adminCookie = (await login(app, admin.user.email, admin.password)).cookie;
    const manager = await createTestUser(app.prisma, {
      permissions: [PERMISSIONS.STOCK_ENTRIES_READ, PERMISSIONS.STOCK_ENTRIES_MANAGE],
    });
    managerCookie = (await login(app, manager.user.email, manager.password)).cookie;
  });
  afterEach(() => app.close());

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, c: string, payload?: object) =>
    app.inject({ method, url, headers: { cookie: c }, ...(payload !== undefined && { payload }) });

  it('lista los tipos del sistema a quien registra ingresos', async () => {
    expect((await app.inject({ method: 'GET', url: URL })).statusCode).toBe(401);
    const none = await createTestUser(app.prisma, { permissions: [PERMISSIONS.CATALOG_READ] });
    const noneCookie = (await login(app, none.user.email, none.password)).cookie;
    expect((await call('GET', URL, noneCookie)).statusCode).toBe(403);

    const res = await call('GET', URL, managerCookie);
    expect(res.statusCode).toBe(200);
    expect((res.json().data as { name: string }[]).map((type) => type.name)).toEqual([
      'Transporte',
      'Embolsado',
      'Aduanización',
      'Comisiones',
      'Otro',
    ]);
  });

  it('solo settings:manage agrega y cambia tipos: 401 / 403 / 400', async () => {
    expect(
      (await app.inject({ method: 'POST', url: URL, payload: { name: 'Flete' } })).statusCode,
    ).toBe(401);
    expect((await call('POST', URL, managerCookie, { name: 'Flete' })).statusCode).toBe(403);
    expect((await call('POST', URL, managerCookie, {})).statusCode).toBe(403);
    expect((await call('POST', URL, adminCookie, {})).statusCode).toBe(400);
    expect((await call('POST', URL, adminCookie, { name: 'x' })).statusCode).toBe(400);

    const created = await call('POST', URL, adminCookie, { name: 'Flete aéreo' });
    expect(created.statusCode).toBe(201);
    expect(created.json().data).toMatchObject({
      name: 'Flete aéreo',
      code: 'CUSTOM_FLETE_AEREO',
      isActive: true,
      isSystem: false,
    });
    const id = created.json().data.id as string;
    expect(
      (await call('PATCH', `${URL}/${id}`, managerCookie, { isActive: false })).statusCode,
    ).toBe(403);
    expect((await call('PATCH', `${URL}/${id}`, adminCookie, {})).statusCode).toBe(400);
    expect(
      (await call('PATCH', `${URL}/no-es-uuid`, adminCookie, { isActive: false })).statusCode,
    ).toBe(400);
    const off = await call('PATCH', `${URL}/${id}`, adminCookie, { isActive: false });
    expect(off.json().data.isActive).toBe(false);
    const renamed = await call('PATCH', `${URL}/${id}`, adminCookie, { name: 'Flete marítimo' });
    expect(renamed.json().data.name).toBe('Flete marítimo');
    expect(
      await app.prisma.auditLog.count({
        where: { entityType: 'StockEntryCostType', entityId: id },
      }),
    ).toBe(3);
  });

  it('rechaza nombres repetidos y no permite cambiar los tipos del sistema', async () => {
    expect((await call('POST', URL, adminCookie, { name: 'transporte' })).statusCode).toBe(409);
    await call('POST', URL, adminCookie, { name: 'Seguro' });
    expect((await call('POST', URL, adminCookie, { name: 'SEGURO' })).statusCode).toBe(409);

    const transport = await app.prisma.stockEntryCostType.findUniqueOrThrow({
      where: { code: 'TRANSPORT' },
    });
    expect(
      (await call('PATCH', `${URL}/${transport.id}`, adminCookie, { isActive: false })).statusCode,
    ).toBe(422);
    expect(
      (await call('PATCH', `${URL}/${transport.id}`, adminCookie, { name: 'Otro nombre' }))
        .statusCode,
    ).toBe(422);
    expect(
      (
        await call('PATCH', `${URL}/01900000-0000-7000-8000-000000000000`, adminCookie, {
          isActive: false,
        })
      ).statusCode,
    ).toBe(404);
  });
});
