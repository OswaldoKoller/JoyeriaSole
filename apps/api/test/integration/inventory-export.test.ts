import { PERMISSIONS, todayInLaPaz, type Permission } from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { BusinessRuleError } from '../../src/lib/errors.ts';
import { InventoryExportService } from '../../src/modules/inventory/inventory-export.service.ts';
import { applyStockChanges } from '../../src/modules/inventory/stock-ledger.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';
import { createSellableVariant } from '../helpers/sales.ts';
import { setStock } from '../helpers/stock.ts';

const BALANCES = '/api/v1/inventory/export.csv';
const MOVEMENTS = '/api/v1/inventory/movements/export.csv';
const FORMULA = `=cmd|' /C calc'!A0`;

/** Separa el CSV (CRLF, «;») en filas de celdas. Las pruebas no usan saltos dentro de celdas. */
function parse(body: string): string[][] {
  return body
    .replace(/^\uFEFF/, '')
    .split('\r\n')
    .filter((line) => line.length > 0)
    .map((line) => line.split(';'));
}

describe('exportación CSV de inventario y movimientos (P-44, D1)', () => {
  let app: App;

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
    // Autor por defecto de los movimientos que crean los ayudantes de prueba (setStock).
    await createTestUser(app.prisma, { permissions: [] });
  });
  afterEach(() => app.close());

  async function session(permissions: Permission[]) {
    const created = await createTestUser(app.prisma, { permissions });
    const { cookie } = await login(app, created.user.email, created.password);
    // El inicio de sesión también se audita: cada prueba mira solo lo que ella provoca.
    await app.prisma.$executeRawUnsafe(`TRUNCATE TABLE "audit_logs"`);
    return { cookie, user: created.user };
  }

  const get = (cookie: string | undefined, url: string) =>
    app.inject({ method: 'GET', url, ...(cookie && { headers: { cookie } }) });

  const READER: Permission[] = [PERMISSIONS.INVENTORY_READ];
  const READER_WITH_COSTS: Permission[] = [PERMISSIONS.INVENTORY_READ, PERMISSIONS.COSTS_READ];

  describe('permisos', () => {
    it('401 sin sesión y 403 sin inventory:read, sin dejar auditoría', async () => {
      for (const url of [BALANCES, MOVEMENTS]) {
        expect((await get(undefined, url)).statusCode, url).toBe(401);
      }
      const { cookie } = await session([PERMISSIONS.COSTS_READ]);
      for (const url of [BALANCES, MOVEMENTS]) {
        expect((await get(cookie, url)).statusCode, url).toBe(403);
      }
      expect(await app.prisma.auditLog.count()).toBe(0);
    });

    it('rechaza filtros inválidos con 400', async () => {
      const { cookie } = await session(READER);
      for (const url of [
        `${BALANCES}?level=NADA`,
        `${MOVEMENTS}?type=NADA`,
        `${MOVEMENTS}?from=2026-02-31`,
        `${MOVEMENTS}?from=ayer`,
        `${MOVEMENTS}?variantId=no-es-uuid`,
        `${MOVEMENTS}?from=2026-11-10&to=2026-11-01`,
      ]) {
        expect((await get(cookie, url)).statusCode, url).toBe(400);
      }
      expect(await app.prisma.auditLog.count()).toBe(0);
    });
  });

  describe('saldos', () => {
    it('devuelve el archivo con cabeceras, BOM, separador «;» y sin caché', async () => {
      const variant = await createSellableVariant(app.prisma, { stock: 5 });
      const { cookie } = await session(READER);
      const res = await get(cookie, BALANCES);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="inventario-${todayInLaPaz()}.csv"`,
      );
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-export-rows']).toBe('1');
      expect(res.body.startsWith('\uFEFF')).toBe(true);
      expect(res.body.endsWith('\r\n')).toBe(true);
      const [header, row] = parse(res.body);
      expect(header).toEqual([
        'SKU',
        'Código de barras',
        'Producto',
        'Variante / atributos',
        'Categoría',
        'Saldo',
        'Stock mínimo',
        'Nivel de stock',
        'Estado de la variante',
      ]);
      expect(row?.[0]).toBe(variant.sku);
      expect(row?.[3]).toBe('Plata 925 / Talla 16');
      expect(row?.slice(5)).toEqual(['5', '0', 'Disponible', 'Activa']);
    });

    it('con costs:read agrega costo vigente y valor = costo × saldo, y lo audita', async () => {
      await createSellableVariant(app.prisma, { stock: 5, cost: '60.0000' });
      await createSellableVariant(app.prisma, { stock: 3, cost: '12.3456' });
      await createSellableVariant(app.prisma, { stock: 0, cost: '99.0000' });
      const { cookie } = await session(READER_WITH_COSTS);
      const res = await get(cookie, BALANCES);
      expect(res.statusCode).toBe(200);
      const [header, ...rows] = parse(res.body);
      expect(header?.slice(-2)).toEqual([
        'Costo unitario vigente (Bs)',
        'Valor a costo vigente (Bs)',
      ]);
      const values = rows.map((row) => [row[5], ...row.slice(-2)]);
      expect(values).toContainEqual(['5', '60.0000', '300.00']);
      expect(values).toContainEqual(['3', '12.3456', '37.04']);
      expect(values).toContainEqual(['0', '99.0000', '0.00']);
    });

    it('sin costs:read NO hay columnas ni valores de costo, ni por parámetros', async () => {
      await createSellableVariant(app.prisma, { stock: 5, cost: '60.0000' });
      const { cookie } = await session(READER);
      for (const query of [
        '',
        '?includeCosts=true',
        '?costs=true&withCosts=1&costPrice=1&value=true',
      ]) {
        const res = await get(cookie, `${BALANCES}${query}`);
        expect(res.statusCode, query).toBe(200);
        const [header, row] = parse(res.body);
        expect(header, query).toHaveLength(9);
        expect(row, query).toHaveLength(9);
        expect(res.body, query).not.toMatch(/costo|valor|60\.0000|300/i);
      }
    });

    it('neutraliza fórmulas y escapa comillas, separadores y saltos de línea', async () => {
      const variant = await createSellableVariant(app.prisma, {
        stock: 2,
        productName: FORMULA,
        label: 'Talla "M"; 16\nsegunda línea',
      });
      await app.prisma.productVariant.update({
        where: { id: variant.id },
        data: { barcode: '+5491100' },
      });
      const { cookie } = await session(READER);
      const res = await get(cookie, BALANCES);
      expect(res.statusCode).toBe(200);
      // Producto: apóstrofe inicial; el texto original sigue legible.
      expect(res.body).toContain(`;'${FORMULA};`);
      expect(res.body).not.toContain(`;${FORMULA};`);
      // Código de barras con «+»: también se neutraliza.
      expect(res.body).toContain(";'+5491100;");
      // Variante con comillas, «;» y salto de línea: entre comillas, comillas duplicadas.
      expect(res.body).toContain('"Talla ""M""; 16\nsegunda línea"');
      // Ninguna celda de texto empieza con un carácter de fórmula.
      const cells = res.body.replace(/"(?:[^"]|"")*"/g, 'Q').split(/[;\r\n]/);
      expect(cells.filter((cell) => /^[=+\-@\t]/.test(cell))).toEqual([]);
    });

    it('filtra por búsqueda y nivel, igual que la pantalla de saldos', async () => {
      const ok = await createSellableVariant(app.prisma, { stock: 9, productName: 'Collar Luna' });
      const out = await createSellableVariant(app.prisma, { stock: 0, productName: 'Collar Sol' });
      const low = await createSellableVariant(app.prisma, { stock: 2, productName: 'Aro Mini' });
      await app.prisma.productVariant.update({ where: { id: low.id }, data: { minStock: 3 } });
      const { cookie } = await session(READER);
      const skus = async (query: string) =>
        parse((await get(cookie, `${BALANCES}${query}`)).body)
          .slice(1)
          .map((row) => row[0])
          .sort();
      expect(await skus('')).toEqual([ok.sku, out.sku, low.sku].sort());
      expect(await skus('?q=collar')).toEqual([ok.sku, out.sku].sort());
      expect(await skus('?level=OUT')).toEqual([out.sku]);
      expect(await skus('?level=LOW')).toEqual([low.sku]);
      expect(await skus('?level=OK')).toEqual([ok.sku]);
      expect(await skus('?q=collar&level=OK')).toEqual([ok.sku]);
    });

    it('incluye variantes inactivas con saldo (el valor no deja piezas fuera) y no las vacías', async () => {
      const withStock = await createSellableVariant(app.prisma, { stock: 4 });
      const empty = await createSellableVariant(app.prisma, { stock: 0 });
      for (const variant of [withStock, empty]) {
        await app.prisma.productVariant.update({
          where: { id: variant.id },
          data: { status: 'INACTIVE' },
        });
      }
      const { cookie } = await session(READER);
      const rows = parse((await get(cookie, BALANCES)).body).slice(1);
      expect(rows.map((row) => row[0])).toEqual([withStock.sku]);
      expect(rows[0]?.[8]).toBe('Inactiva');
    });

    it('exporta en lotes: más de 1000 variantes, sin duplicados ni saltos, en orden', async () => {
      const category = await app.prisma.category.create({
        data: { name: 'Masiva', slug: 'masiva' },
      });
      const product = await app.prisma.product.create({
        data: { categoryId: category.id, name: 'Pieza masiva' },
      });
      await app.prisma.productVariant.createMany({
        data: Array.from({ length: 1205 }, (_, index) => ({
          productId: product.id,
          sku: `MASIVA-${String(index).padStart(5, '0')}`,
        })),
      });
      const { cookie } = await session(READER);
      const res = await get(cookie, BALANCES);
      expect(res.statusCode).toBe(200);
      const rows = parse(res.body).slice(1);
      expect(rows).toHaveLength(1205);
      expect(rows.map((row) => row[0])).toEqual(
        Array.from({ length: 1205 }, (_, index) => `MASIVA-${String(index).padStart(5, '0')}`),
      );
      expect(res.headers['x-export-rows']).toBe('1205');
    });

    it('incluye la categoría con su ruta', async () => {
      const parent = await app.prisma.category.create({ data: { name: 'Joyas', slug: 'joyas' } });
      const child = await app.prisma.category.create({
        data: { name: 'Anillos', slug: 'anillos', parentId: parent.id },
      });
      const product = await app.prisma.product.create({
        data: { categoryId: child.id, name: 'Solitario' },
      });
      await app.prisma.productVariant.create({ data: { productId: product.id, sku: 'S-1' } });
      const { cookie } = await session(READER);
      expect(parse((await get(cookie, BALANCES)).body)[1]?.[4]).toBe('Joyas > Anillos');
    });

    it('audita quién, filtros y nº de filas', async () => {
      await createSellableVariant(app.prisma, { stock: 1, productName: 'Collar uno' });
      await createSellableVariant(app.prisma, { stock: 1, productName: 'Collar dos' });
      const { cookie, user } = await session(READER_WITH_COSTS);
      expect((await get(cookie, `${BALANCES}?q=collar&level=OK`)).statusCode).toBe(200);
      const audit = await app.prisma.auditLog.findMany({
        where: { action: 'inventory.export_balances' },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        userId: user.id,
        entityType: 'Inventory',
        metadata: {
          format: 'csv',
          filters: { q: 'collar', level: 'OK' },
          rows: 2,
          includesCosts: true,
        },
      });
    });
  });

  describe('movimientos', () => {
    async function setup() {
      const author = await createTestUser(app.prisma, { permissions: [] });
      const first = await createSellableVariant(app.prisma, {
        stock: 10,
        productName: 'Anillo Uno',
        userId: author.user.id,
      });
      const second = await createSellableVariant(app.prisma, {
        stock: 4,
        productName: 'Anillo Dos',
        userId: author.user.id,
      });
      await app.prisma.$transaction((tx) =>
        applyStockChanges(tx, [
          {
            variantId: first.id,
            type: 'ADJUSTMENT',
            quantity: -3,
            userId: author.user.id,
            reason: FORMULA,
            notes: 'Se rompió el broche',
          },
        ]),
      );
      return { author: author.user, first, second };
    }

    it('devuelve cabeceras, BOM, hora de La Paz, cantidades con signo y orden descendente', async () => {
      const { first } = await setup();
      const { cookie } = await session([...READER, PERMISSIONS.INVENTORY_ADJUST]);
      const res = await get(cookie, MOVEMENTS);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="movimientos-${todayInLaPaz()}.csv"`,
      );
      expect(res.headers['x-export-rows']).toBe('3');
      expect(res.body.startsWith('\uFEFF')).toBe(true);
      const [header, ...rows] = parse(res.body);
      expect(header).toEqual([
        'ID del movimiento',
        'Fecha y hora (La Paz)',
        'Tipo',
        'Código de tipo',
        'SKU',
        'Producto',
        'Variante / atributos',
        'Cantidad (con signo)',
        'Saldo anterior',
        'Saldo posterior',
        'Motivo',
        'Observaciones',
        'Usuario',
      ]);
      expect(rows.map((row) => row[0])).toEqual(['3', '2', '1']);
      // El ajuste: cantidad -3 sin apóstrofe (es número), motivo neutralizado, observación visible.
      expect(rows[0]?.slice(2, 5)).toEqual(['Ajuste', 'ADJUSTMENT', first.sku]);
      expect(rows[0]?.slice(7, 12)).toEqual([
        '-3',
        '10',
        '7',
        `'${FORMULA}`,
        'Se rompió el broche',
      ]);
      expect(rows[0]?.[1]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(res.body).not.toContain(`;${FORMULA};`);
    });

    it('sin permiso de ver observaciones, la columna no existe', async () => {
      await setup();
      const { cookie } = await session(READER);
      const res = await get(cookie, MOVEMENTS);
      const [header, row] = parse(res.body);
      expect(header).not.toContain('Observaciones');
      expect(header).toHaveLength(12);
      expect(row).toHaveLength(12);
      expect(res.body).not.toContain('broche');
    });

    it('no incluye costos aunque se tenga costs:read', async () => {
      await setup();
      const { cookie } = await session(READER_WITH_COSTS);
      const res = await get(cookie, MOVEMENTS);
      expect(res.body).not.toMatch(/costo|60\.0000/i);
    });

    it('filtra por tipo, variante, producto y fechas, igual que el listado', async () => {
      const { first, second } = await setup();
      const { cookie } = await session(READER);
      const ids = async (query: string) =>
        parse((await get(cookie, `${MOVEMENTS}${query}`)).body)
          .slice(1)
          .map((row) => row[0]);
      expect(await ids('?type=ADJUSTMENT')).toEqual(['3']);
      expect(await ids('?type=INITIAL_STOCK')).toEqual(['2', '1']);
      expect(await ids(`?variantId=${second.id}`)).toEqual(['2']);
      expect(await ids(`?productId=${first.productId}`)).toEqual(['3', '1']);
      expect(await ids(`?productId=${first.productId}&type=INITIAL_STOCK`)).toEqual(['1']);
      const today = todayInLaPaz();
      expect(await ids(`?from=${today}&to=${today}`)).toEqual(['3', '2', '1']);
      expect(await ids('?from=2999-01-01')).toEqual([]);
      expect(await ids('?to=2000-01-01')).toEqual([]);
      // Mismo conjunto que el listado paginado con los mismos filtros.
      const listed = await get(
        cookie,
        `/api/v1/inventory/movements?type=INITIAL_STOCK&from=${today}`,
      );
      expect(listed.statusCode).toBe(200);
      expect(listed.json().meta.total).toBe(2);
      expect(
        (await get(cookie, `/api/v1/inventory/movements?from=2999-01-01`)).json().meta.total,
      ).toBe(0);
    });

    it('sin filas devuelve solo la cabecera y audita 0 filas', async () => {
      const { cookie } = await session(READER);
      const res = await get(cookie, MOVEMENTS);
      expect(res.statusCode).toBe(200);
      expect(parse(res.body)).toHaveLength(1);
      expect(res.headers['x-export-rows']).toBe('0');
      const audit = await app.prisma.auditLog.findFirstOrThrow({
        where: { action: 'inventory.export_movements' },
      });
      expect(audit.metadata).toMatchObject({ rows: 0 });
    });

    it('audita quién, filtros y nº de filas', async () => {
      await setup();
      const { cookie, user } = await session(READER);
      expect((await get(cookie, `${MOVEMENTS}?type=INITIAL_STOCK`)).statusCode).toBe(200);
      const audit = await app.prisma.auditLog.findMany({
        where: { action: 'inventory.export_movements' },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        userId: user.id,
        entityType: 'InventoryMovement',
        metadata: { format: 'csv', filters: { type: 'INITIAL_STOCK' }, rows: 2 },
      });
    });

    it('D-02/M-1: las ventas de otro vendedor no muestran usuario sin sales:read-all', async () => {
      const seller = await session(READER);
      const other = await createTestUser(app.prisma, { permissions: [] });
      const mine = await createSellableVariant(app.prisma, { stock: 5, productName: 'Pieza mía' });
      const theirs = await createSellableVariant(app.prisma, {
        stock: 5,
        productName: 'Pieza ajena',
      });
      await app.prisma.$transaction((tx) =>
        applyStockChanges(tx, [
          { variantId: mine.id, type: 'SALE', quantity: -1, userId: seller.user.id },
          { variantId: theirs.id, type: 'SALE', quantity: -2, userId: other.user.id },
        ]),
      );
      const sales = async (cookie: string) =>
        parse((await get(cookie, `${MOVEMENTS}?type=SALE`)).body)
          .slice(1)
          .map((row) => [row[5], row[row.length - 1]]);

      // El vendedor ve su propia venta con su nombre, y la ajena con el usuario vacío.
      expect(await sales(seller.cookie)).toEqual(
        expect.arrayContaining([
          ['Pieza mía', seller.user.name],
          ['Pieza ajena', ''],
        ]),
      );
      const asSeller = await get(seller.cookie, `${MOVEMENTS}?type=SALE`);
      expect(asSeller.body).not.toContain(other.user.name);

      // Con sales:read-all ve el nombre de todos.
      const reviewer = await session([...READER, PERMISSIONS.SALES_READ_ALL]);
      expect(await sales(reviewer.cookie)).toEqual(
        expect.arrayContaining([
          ['Pieza mía', seller.user.name],
          ['Pieza ajena', other.user.name],
        ]),
      );
    });
  });

  describe('tope de filas', () => {
    function fakeRequest(userId: string) {
      return {
        auth: { user: { id: userId, permissions: [PERMISSIONS.INVENTORY_READ] } },
        ip: '127.0.0.1',
        headers: {},
        id: 'req-test',
      } as unknown as FastifyRequest;
    }

    it('rechaza con un error claro y sin dejar auditoría si se excede', async () => {
      const { user } = await session(READER);
      const variant = await createSellableVariant(app.prisma, { stock: 1, userId: user.id });
      await setStock(app.prisma, variant.id, 2, { userId: user.id });
      await setStock(app.prisma, variant.id, 3, { userId: user.id });
      const limited = new InventoryExportService(app.prisma, 2);
      const request = fakeRequest(user.id);

      const movements = limited.movements({}, request);
      await expect(movements).rejects.toBeInstanceOf(BusinessRuleError);
      await expect(movements).rejects.toThrow(/máximo de 2 filas \(3 encontradas\)/);
      await createSellableVariant(app.prisma);
      await createSellableVariant(app.prisma);
      await expect(limited.balances({ q: '', level: 'all' }, request)).rejects.toThrow(
        /máximo de 2 filas/,
      );
      expect(await app.prisma.auditLog.count()).toBe(0);

      // En el límite exacto sí exporta.
      const exact = await new InventoryExportService(app.prisma, 3).movements({}, request);
      expect(exact.rows).toBe(3);
      exact.stream.destroy();
      expect(await app.prisma.auditLog.count()).toBe(1);
    });
  });
});
