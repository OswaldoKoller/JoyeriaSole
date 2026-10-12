import { PERMISSIONS, type Permission } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';

const URL = '/api/v1/stock-entries';
const FULL: Permission[] = [
  PERMISSIONS.STOCK_ENTRIES_READ,
  PERMISSIONS.STOCK_ENTRIES_MANAGE,
  PERMISSIONS.STOCK_ENTRIES_CONFIRM,
];

describe('ingresos de mercadería', () => {
  let app: App;
  let cookie: string;
  let userId: string;
  let supplierId: string;

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
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
    expect(res.statusCode).toBe(201);
    return res.json().data as { id: string; number: number };
  }

  async function sessionWith(permissions: Permission[]) {
    const { user, password } = await createTestUser(app.prisma, { permissions });
    return (await login(app, user.email, password)).cookie;
  }

  const lines = (entries: [string, number, string][]) => ({
    items: entries.map(([variantId, receivedQty, unitCost]) => ({
      variantId,
      receivedQty,
      unitCost,
    })),
  });

  async function stockOf(variantId: string) {
    return (await app.prisma.inventoryBalance.findUnique({ where: { variantId } }))?.quantity ?? 0;
  }

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
      expect(
        (await call('PUT', `${URL}/${draft.id}/items`, { items: 'inválido' }, seller)).statusCode,
      ).toBe(403);
      // Quien sí tiene permiso recibe el detalle de validación.
      expect((await call('POST', URL, {})).statusCode).toBe(400);
    });

    it('confirmar exige su propio permiso: gestionar no basta', async () => {
      const draft = await createDraft();
      const variant = await createVariant();
      await call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, 3, '10']]));
      const managerOnly = await sessionWith([
        PERMISSIONS.STOCK_ENTRIES_READ,
        PERMISSIONS.STOCK_ENTRIES_MANAGE,
      ]);
      const denied = await call('POST', `${URL}/${draft.id}/confirm`, undefined, managerOnly);
      expect(denied.statusCode).toBe(403);
      expect(await stockOf(variant.id)).toBe(0);
    });
  });

  describe('borrador', () => {
    it('crea un borrador numerado correlativamente sin tocar el stock', async () => {
      const first = await createDraft({ documentType: 'Factura', documentNumber: 'F-100' });
      const second = await createDraft();
      expect(second.number).toBe(first.number + 1);

      const detail = (await call('GET', `${URL}/${first.id}`)).json().data;
      expect(detail).toMatchObject({
        status: 'DRAFT',
        documentType: 'Factura',
        documentNumber: 'F-100',
        freightCost: '0.00',
        purchaseTotal: '0.00',
        itemsCount: 0,
      });
      expect(await app.prisma.inventoryMovement.count()).toBe(0);
      expect(await app.prisma.inventoryBalance.count()).toBe(0);
    });

    it('valida proveedor y datos de entrada', async () => {
      expect((await call('POST', URL, { supplierId: 'no-es-uuid' })).statusCode).toBe(400);
      expect((await call('POST', URL, { supplierId, freightCost: '-5' })).statusCode).toBe(400);
      expect((await call('POST', URL, { supplierId, otherCosts: '1.234' })).statusCode).toBe(400);
      expect(
        (await call('POST', URL, { supplierId: '01900000-0000-7000-8000-000000000000' }))
          .statusCode,
      ).toBe(404);

      await app.prisma.supplier.update({ where: { id: supplierId }, data: { isActive: false } });
      expect((await call('POST', URL, { supplierId })).statusCode).toBe(422);
    });

    it('edita la cabecera y los costos mientras es borrador, con auditoría', async () => {
      const draft = await createDraft();
      const res = await call('PATCH', `${URL}/${draft.id}`, {
        freightCost: '12.5',
        packagingCost: '1',
        notes: 'Llegó en dos cajas',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({
        freightCost: '12.50',
        packagingCost: '1.00',
        extrasTotal: '13.50',
        notes: 'Llegó en dos cajas',
      });
      const audit = await app.prisma.auditLog.findFirst({
        where: { action: 'stock_entry.updated', entityId: draft.id },
      });
      expect(audit?.userId).toBe(userId);
      expect((await call('PATCH', `${URL}/${draft.id}`, {})).statusCode).toBe(400);
    });

    it('reemplaza los ítems y muestra la vista previa del reparto sin tocar el stock', async () => {
      const a = await createVariant();
      const b = await createVariant();
      const draft = await createDraft({
        freightCost: '10',
        packagingCost: '0.5',
        otherCosts: '0.5',
      });

      const res = await call('PUT', `${URL}/${draft.id}/items`, {
        items: [
          { variantId: a.id, expectedQty: 12, receivedQty: 10, unitCost: '10' },
          { variantId: b.id, receivedQty: 5, unitCost: '20' },
        ],
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data).toMatchObject({ purchaseTotal: '200.00', extrasTotal: '11.00', blockers: [] });
      const bySku = Object.fromEntries(
        (data.items as { sku: string; unitExtraCost: string; unitTotalCost: string }[]).map(
          (item) => [item.sku, item],
        ),
      );
      // Valores iguales (100 y 100): cada línea absorbe 5,50 → 0,55 y 1,10 por pieza.
      expect(bySku[a.sku]).toMatchObject({ unitExtraCost: '0.5500', unitTotalCost: '10.5500' });
      expect(bySku[b.sku]).toMatchObject({ unitExtraCost: '1.1000', unitTotalCost: '21.1000' });
      expect(data.items[0]).toMatchObject({ expectedQty: 12, receivedQty: 10 });

      // Un segundo reemplazo sustituye por completo a los anteriores.
      const second = await call('PUT', `${URL}/${draft.id}/items`, lines([[a.id, 1, '1']]));
      expect(second.json().data.itemsCount).toBe(1);
      expect(await app.prisma.stockEntryItem.count({ where: { stockEntryId: draft.id } })).toBe(1);
      expect(await app.prisma.inventoryMovement.count()).toBe(0);
    });

    it('rechaza ítems repetidos, variantes inexistentes o inactivas y cantidades inválidas', async () => {
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
      expect(
        (await put(lines([['01900000-0000-7000-8000-000000000000', 1, '5']]))).statusCode,
      ).toBe(404);
      expect((await put(lines([[inactive.id, 1, '5']]))).statusCode).toBe(422);
      expect(await app.prisma.stockEntryItem.count()).toBe(0);
    });
  });

  describe('confirmación', () => {
    it('aumenta el stock, fija el último costo y deja movimientos y auditoría', async () => {
      const a = await createVariant({ salePrice: '99' });
      const b = await createVariant({ salePrice: '49' });
      await app.prisma.inventoryBalance.create({ data: { variantId: a.id, quantity: 5 } });
      const draft = await createDraft({
        freightCost: '10',
        packagingCost: '0.5',
        otherCosts: '0.5',
        documentNumber: 'F-777',
      });
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
      const data = res.json().data;
      expect(data).toMatchObject({ status: 'CONFIRMED', confirmedByName: expect.any(String) });
      expect(data.confirmedAt).toBeTruthy();

      // Saldos: 5 + 10 y 0 + 5.
      expect(await stockOf(a.id)).toBe(15);
      expect(await stockOf(b.id)).toBe(5);

      // Un movimiento por línea, con costo total, referencia al ingreso y usuario.
      const movements = await app.prisma.inventoryMovement.findMany({ orderBy: { id: 'asc' } });
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

      // Último costo actualizado; el precio de venta NO se toca (P-25 pendiente).
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
    });

    it('reparte los centavos sobrantes por mayor resto: la suma cuadra exactamente', async () => {
      const variants = [await createVariant(), await createVariant(), await createVariant()];
      const draft = await createDraft({ freightCost: '1' });
      await call(
        'PUT',
        `${URL}/${draft.id}/items`,
        lines(variants.map((variant): [string, number, string] => [variant.id, 1, '5'])),
      );
      const res = await call('POST', `${URL}/${draft.id}/confirm`);
      expect(res.statusCode).toBe(200);
      const extras = (res.json().data.items as { unitExtraCost: string }[])
        .map((item) => Number(item.unitExtraCost))
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
      const draft = await createDraft({ freightCost: '2' });
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
      const draft = await createDraft({ freightCost: '5' });
      const put = await call('PUT', `${URL}/${draft.id}/items`, lines([[variant.id, 3, '0']]));
      expect(put.json().data.blockers.join(' ')).toMatch(/valor de compra es cero/);

      const res = await call('POST', `${URL}/${draft.id}/confirm`);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('BUSINESS_RULE_VIOLATION');
      expect(await stockOf(variant.id)).toBe(0);
      expect((await call('GET', `${URL}/${draft.id}`)).json().data.status).toBe('DRAFT');
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
      await app.prisma.inventoryBalance.create({
        data: { variantId: second.id, quantity: 2_147_483_647 },
      });
      const draft = await createDraft({ freightCost: '1' });
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
      expect(await app.prisma.inventoryMovement.count()).toBe(0);
      expect(await stockOf(first.id)).toBe(0);
      expect(
        (
          await app.prisma.productVariant.findUniqueOrThrow({ where: { id: first.id } })
        ).costPrice.toFixed(4),
      ).toBe('1.0000');
      expect(await app.prisma.auditLog.count({ where: { action: 'stock_entry.confirmed' } })).toBe(
        0,
      );
      expect((await call('GET', `${URL}/${draft.id}`)).json().data.status).toBe('DRAFT');
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
      expect((await call('GET', `${URL}/01900000-0000-7000-8000-000000000000`)).statusCode).toBe(
        404,
      );
    });
  });
});
