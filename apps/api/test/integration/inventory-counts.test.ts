import { PERMISSIONS, type Permission } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../../src/app.ts';
import { applyStockChanges } from '../../src/modules/inventory/stock-ledger.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';

const URL = '/api/v1/inventory/counts';

// Cada prueba inicia sesión con Argon2 y encadena decenas de peticiones: en equipos o CI cargados
// superan los 20 s por defecto sin que haya ningún defecto.
vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const OPERATOR: Permission[] = [
  PERMISSIONS.INVENTORY_COUNTS_READ,
  PERMISSIONS.INVENTORY_COUNTS_MANAGE,
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.CATALOG_READ,
];
const MANAGER: Permission[] = [
  ...OPERATOR,
  PERMISSIONS.INVENTORY_COUNTS_APPROVE,
  PERMISSIONS.COSTS_READ,
];
const SELLER: Permission[] = [PERMISSIONS.INVENTORY_READ, PERMISSIONS.CATALOG_READ];

/** Campos que revelan el stock del sistema o diferencias: jamás deben aparecer a ciegas. */
const FORBIDDEN_KEYS = [
  'systemQty',
  'expectedQty',
  'difference',
  'currentQty',
  'resultingQty',
  'balanceBefore',
  'balanceAfter',
  'reconciledMovements',
  'netUnits',
  'differencesCount',
  'valueImpact',
  'unitCost',
  'finalQty',
  'countedQty',
  'recountQty',
  'quantityBefore',
  'stock',
];

function keysOf(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((entry) => keysOf(entry, found));
  else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      found.add(key);
      keysOf(entry, found);
    }
  }
  return found;
}

interface ItemJson {
  [key: string]: unknown;
  sku: string;
  quantity: number;
  difference: number;
}
interface FindingJson {
  [key: string]: unknown;
  id: string;
  type: string;
  quantity: number;
}
interface CountJson {
  [key: string]: unknown;
  status: string;
  view: string;
  scope: string | null;
  totalVariants: number;
  scannedVariants: number;
  recountTotal: number;
  operatorId: string | null;
  differencesCount: number;
  netUnits: number;
  valueImpact: string | null;
  blockers: string[];
  approvedByName: string | null;
  items: ItemJson[];
  findings: FindingJson[];
}

describe('conteo físico a ciegas con segundo recuento', () => {
  let app: App;
  let manager: { cookie: string; id: string };
  let operator: { cookie: string; id: string; email: string; password: string };
  let seller: { cookie: string };
  let counter = 0;

  async function sessionFor(permissions: Permission[]) {
    const created = await createTestUser(app.prisma, { permissions });
    const { cookie } = await login(app, created.user.email, created.password);
    return { cookie, id: created.user.id, email: created.user.email, password: created.password };
  }

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
    manager = await sessionFor(MANAGER);
    operator = await sessionFor(OPERATOR);
    seller = await sessionFor(SELLER);
  });
  afterEach(() => app.close());

  const call = (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    path: string,
    cookie: string,
    payload?: object,
  ) =>
    app.inject({
      method,
      url: `${URL}${path}`,
      headers: { cookie },
      ...(payload !== undefined && { payload }),
    });

  async function category(name: string, parentId: string | null = null) {
    counter += 1;
    return app.prisma.category.create({
      data: { name, slug: `${name.toLowerCase()}-${counter}-${Date.now()}`, parentId },
    });
  }

  async function stockUp(
    variantId: string,
    quantity: number,
    type: 'INITIAL_STOCK' | 'ADJUSTMENT' = 'INITIAL_STOCK',
  ) {
    await app.prisma.$transaction((tx) =>
      applyStockChanges(tx, [{ variantId, type, quantity, userId: manager.id, reason: 'Prueba' }]),
    );
  }

  async function variantIn(
    categoryId: string,
    options: {
      sku?: string;
      barcode?: string;
      stock?: number;
      active?: boolean;
      costPrice?: string;
      name?: string;
    } = {},
  ) {
    counter += 1;
    const product = await app.prisma.product.create({
      data: { categoryId, name: options.name ?? `Producto ${counter}` },
    });
    const variant = await app.prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: options.sku ?? `CNT-${counter}`,
        barcode: options.barcode ?? null,
        costPrice: options.costPrice ?? '2',
        status: options.active === false ? 'INACTIVE' : 'ACTIVE',
      },
    });
    if (options.stock) await stockUp(variant.id, options.stock);
    return variant;
  }

  const balanceOf = async (variantId: string) =>
    (await app.prisma.inventoryBalance.findUnique({ where: { variantId } }))?.quantity ?? 0;

  async function createCount(categoryId: string, cookie = manager.cookie) {
    const res = await call('POST', '', cookie, { categoryId });
    expect(res.statusCode, res.body).toBe(201);
    return res.json().data as { id: string; number: number; status: string };
  }

  async function startedCount(categoryId: string, cookie = manager.cookie) {
    const created = await createCount(categoryId, cookie);
    const res = await call('POST', `/${created.id}/start`, cookie);
    expect(res.statusCode, res.body).toBe(200);
    return created.id;
  }

  const scan = (id: string, code: string, cookie = manager.cookie) =>
    call('POST', `/${id}/scan`, cookie, { code });
  async function scanTimes(id: string, code: string, times: number, cookie = manager.cookie) {
    for (let i = 0; i < times; i += 1) {
      const res = await scan(id, code, cookie);
      expect(res.statusCode, res.body).toBe(200);
    }
  }
  const detailOf = async (id: string, cookie = manager.cookie) => {
    const res = await call('GET', `/${id}`, cookie);
    expect(res.statusCode, res.body).toBe(200);
    return res.json().data as CountJson;
  };
  const closeCount = (id: string, cookie = manager.cookie) => call('POST', `/${id}/close`, cookie);

  /** Conteo sin diferencias: una variante con 3 piezas, contadas 3. */
  async function cleanCountInReview() {
    const cat = await category('Aretes');
    const v = await variantIn(cat.id, { sku: 'A-1', stock: 3 });
    const id = await startedCount(cat.id);
    await scanTimes(id, 'A-1', 3);
    expect((await closeCount(id)).json().data.status).toBe('IN_REVIEW');
    return { id, cat, v };
  }

  describe('permisos', () => {
    it('401 sin sesión en todos los endpoints', async () => {
      const id = '01900000-0000-7000-8000-000000000000';
      const fid = '01900000-0000-7000-8000-000000000001';
      for (const [method, path] of [
        ['GET', ''],
        ['POST', ''],
        ['GET', `/${id}`],
        ['GET', `/${id}/scans`],
        ['POST', `/${id}/start`],
        ['POST', `/${id}/take`],
        ['POST', `/${id}/scan`],
        ['POST', `/${id}/undo`],
        ['PUT', `/${id}/items/${fid}`],
        ['POST', `/${id}/close`],
        ['POST', `/${id}/approve`],
        ['POST', `/${id}/cancel`],
        ['PATCH', `/${id}/findings/${fid}`],
        ['POST', `/${id}/findings/${fid}/regularize`],
      ] as const) {
        const res = await app.inject({ method, url: `${URL}${path}`, payload: {} });
        expect(res.statusCode, `${method} ${path}`).toBe(401);
      }
    });

    it('el vendedor no ve ni usa los conteos (403), aunque tenga inventory:read', async () => {
      const cat = await category('Anillos');
      await variantIn(cat.id, { stock: 1 });
      const id = await startedCount(cat.id);
      expect((await call('GET', '', seller.cookie)).statusCode).toBe(403);
      expect((await call('GET', `/${id}`, seller.cookie)).statusCode).toBe(403);
      expect((await call('POST', '', seller.cookie, { categoryId: cat.id })).statusCode).toBe(403);
      expect((await scan(id, 'x', seller.cookie)).statusCode).toBe(403);
      expect((await call('POST', `/${id}/approve`, seller.cookie)).statusCode).toBe(403);
    });

    it('autoriza antes de validar: 403 aunque el cuerpo sea inválido; 400 con permiso', async () => {
      expect((await call('POST', '', seller.cookie, {})).statusCode).toBe(403);
      expect((await call('POST', '', operator.cookie, {})).statusCode).toBe(400);
      expect(
        (await call('POST', '', operator.cookie, { categoryId: 'no-es-uuid' })).statusCode,
      ).toBe(400);
    });

    it('quien solo captura no puede aprobar ni regularizar (403); quien solo lee no captura', async () => {
      const { id } = await cleanCountInReview();
      expect((await call('POST', `/${id}/approve`, operator.cookie)).statusCode).toBe(403);
      const fid = '01900000-0000-7000-8000-000000000001';
      expect(
        (await call('POST', `/${id}/findings/${fid}/regularize`, operator.cookie, { note: 'x' }))
          .statusCode,
      ).toBe(403);
      const reader = await sessionFor([PERMISSIONS.INVENTORY_COUNTS_READ]);
      expect((await call('GET', '', reader.cookie)).statusCode).toBe(200);
      expect((await scan(id, 'A-1', reader.cookie)).statusCode).toBe(403);
      expect((await call('POST', '', reader.cookie, {})).statusCode).toBe(403);
    });
  });

  describe('validación', () => {
    it('400 con códigos vacíos, cantidades negativas y ids inválidos', async () => {
      const cat = await category('Anillos');
      await variantIn(cat.id, { stock: 1 });
      const id = await startedCount(cat.id);
      expect((await call('POST', `/${id}/scan`, manager.cookie, { code: '   ' })).statusCode).toBe(
        400,
      );
      expect((await call('POST', `/${id}/scan`, manager.cookie, {})).statusCode).toBe(400);
      const variantId = '01900000-0000-7000-8000-000000000002';
      expect(
        (await call('PUT', `/${id}/items/${variantId}`, manager.cookie, { quantity: -1 }))
          .statusCode,
      ).toBe(400);
      expect((await call('GET', '/no-es-uuid', manager.cookie)).statusCode).toBe(400);
      expect((await call('GET', `/${id}/scans?page=0`, manager.cookie)).statusCode).toBe(400);
    });

    it('404 si el conteo o la categoría no existen; 422 si la categoría no tiene variantes', async () => {
      const missing = '01900000-0000-7000-8000-000000000009';
      expect((await call('GET', `/${missing}`, manager.cookie)).statusCode).toBe(404);
      expect((await call('POST', '', manager.cookie, { categoryId: missing })).statusCode).toBe(
        404,
      );
      const empty = await category('Vacía');
      expect((await call('POST', '', manager.cookie, { categoryId: empty.id })).statusCode).toBe(
        422,
      );
    });
  });

  describe('alcance por categoría', () => {
    it('la categoría padre incluye a sus hijas; activas y las inactivas con saldo > 0', async () => {
      const root = await category('Joyería');
      const child = await category('Anillos', root.id);
      const grandchild = await category('Solitarios', child.id);
      const other = await category('Bolsos');
      const a = await variantIn(root.id, { sku: 'R-1', stock: 2 });
      const b = await variantIn(child.id, { sku: 'R-2' });
      const c = await variantIn(grandchild.id, { sku: 'R-3', stock: 1 });
      const inactiveWithStock = await variantIn(child.id, { sku: 'R-4', stock: 4, active: false });
      const inactiveEmpty = await variantIn(child.id, { sku: 'R-5', active: false });
      const outside = await variantIn(other.id, { sku: 'R-6', stock: 9 });

      const id = await startedCount(root.id);
      const items = await app.prisma.inventoryCountItem.findMany({
        where: { inventoryCountId: id },
      });
      const ids = new Set(items.map((item) => item.variantId));
      expect(ids).toEqual(new Set([a.id, b.id, c.id, inactiveWithStock.id]));
      expect(ids.has(inactiveEmpty.id)).toBe(false);
      expect(ids.has(outside.id)).toBe(false);
      const head = await detailOf(id);
      expect(head.totalVariants).toBe(4);
      expect(head.scope).toBe('Joyería');
    });

    it('una subcategoría solo cuenta lo suyo (y la ruta completa queda como alcance)', async () => {
      const root = await category('Joyería');
      const child = await category('Anillos', root.id);
      await variantIn(root.id, { sku: 'S-1', stock: 2 });
      await variantIn(child.id, { sku: 'S-2', stock: 2 });
      const created = await createCount(child.id);
      const head = await detailOf(created.id);
      expect(head.scope).toBe('Joyería › Anillos');
      expect(head.status).toBe('DRAFT');
      expect(head.totalVariants).toBe(0); // el borrador aún no tiene foto
      expect(created.number).toBe(1);
      await call('POST', `/${created.id}/start`, manager.cookie);
      expect((await detailOf(created.id)).totalVariants).toBe(1);
    });

    it('numeración correlativa CNT-000001, 2, …', async () => {
      const a = await category('A');
      const b = await category('B');
      await variantIn(a.id, { stock: 1 });
      await variantIn(b.id, { stock: 1 });
      expect((await createCount(a.id)).number).toBe(1);
      expect((await createCount(b.id)).number).toBe(2);
    });
  });

  describe('conteos simultáneos (Q-13 B)', () => {
    it('se rechaza crear un conteo que comparte variantes con otro no terminado', async () => {
      const root = await category('Joyería');
      const child = await category('Anillos', root.id);
      await variantIn(child.id, { stock: 2 });
      const first = await createCount(child.id);
      const overlap = await call('POST', '', manager.cookie, { categoryId: root.id });
      expect(overlap.statusCode).toBe(409);
      expect(overlap.json().error.message).toContain('CNT-000001');

      // También con el otro ya iniciado
      await call('POST', `/${first.id}/start`, manager.cookie);
      expect((await call('POST', '', manager.cookie, { categoryId: root.id })).statusCode).toBe(
        409,
      );
      expect((await call('POST', '', manager.cookie, { categoryId: child.id })).statusCode).toBe(
        409,
      );
    });

    it('conteos sin variantes en común conviven; al cancelar uno se libera el alcance', async () => {
      const a = await category('A');
      const b = await category('B');
      await variantIn(a.id, { stock: 1 });
      await variantIn(b.id, { stock: 1 });
      const first = await startedCount(a.id);
      const second = await startedCount(b.id);
      expect(first).not.toBe(second);
      expect((await call('POST', '', manager.cookie, { categoryId: a.id })).statusCode).toBe(409);
      expect((await call('POST', `/${first}/cancel`, manager.cookie, {})).statusCode).toBe(200);
      expect((await call('POST', '', manager.cookie, { categoryId: a.id })).statusCode).toBe(201);
    });

    it('al iniciar se vuelve a comprobar (el alcance pudo cambiar desde la creación)', async () => {
      const x = await category('X');
      const y = await category('Y');
      const vx = await variantIn(x.id, { sku: 'X-1', stock: 1 });
      await variantIn(y.id, { sku: 'Y-1', stock: 1 });
      const countY = await createCount(y.id);
      await startedCount(x.id);
      // Un producto de X pasa a Y: ahora el borrador de Y comparte una variante con el conteo de X
      await app.prisma.product.update({ where: { id: vx.productId }, data: { categoryId: y.id } });
      const res = await call('POST', `/${countY.id}/start`, manager.cookie);
      expect(res.statusCode).toBe(409);
      expect((await detailOf(countY.id)).status).toBe('DRAFT');
    });

    it('dos creaciones simultáneas sobre la misma categoría: solo una prospera', async () => {
      const x = await category('X');
      await variantIn(x.id, { sku: 'X-1', stock: 1 });
      const results = await Promise.all([
        call('POST', '', manager.cookie, { categoryId: x.id }),
        call('POST', '', operator.cookie, { categoryId: x.id }),
      ]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
      expect(await app.prisma.inventoryCount.count()).toBe(1);
    });
  });

  describe('captura a ciegas', () => {
    it('en captura y en recuento la API no devuelve stock del sistema ni diferencias', async () => {
      const cat = await category('Collares');
      const a = await variantIn(cat.id, { sku: 'C-1', barcode: '770001', stock: 5 });
      await variantIn(cat.id, { sku: 'C-2', stock: 3 });
      const id = await startedCount(cat.id);

      const checkBlind = (body: unknown) => {
        const keys = keysOf(body);
        for (const forbidden of FORBIDDEN_KEYS) expect(keys.has(forbidden), forbidden).toBe(false);
      };

      // Recién iniciado y como Administrador (todos los permisos): ciego igualmente
      const fresh = await call('GET', `/${id}`, manager.cookie);
      checkBlind(fresh.json());
      expect(fresh.json().data.view).toBe('BLIND');

      const scanned = await scan(id, 'C-1');
      checkBlind(scanned.json());
      await scan(id, '770001');
      await scan(id, 'NO-EXISTE');
      checkBlind((await call('GET', `/${id}`, manager.cookie)).json());
      checkBlind((await call('GET', '', manager.cookie)).json());
      checkBlind((await call('GET', `/${id}`, operator.cookie)).json());
      checkBlind((await call('GET', `/${id}/scans`, manager.cookie)).json());
      // Ningún número del saldo (5 ni 3) viaja: solo lo contado (2)
      const detail = await detailOf(id);
      expect(detail.items).toEqual([
        expect.objectContaining({ sku: 'C-1', quantity: 2, barcode: '770001' }),
      ]);
      expect(JSON.stringify(detail)).not.toContain('"quantity":5');

      // Fijar a mano y deshacer tampoco filtran stock
      checkBlind(
        (await call('PUT', `/${id}/items/${a.id}`, manager.cookie, { quantity: 4 })).json(),
      );
      checkBlind((await call('POST', `/${id}/undo`, manager.cookie)).json());

      // Primer conteo con diferencias → RECOUNT: sigue ciego
      expect((await closeCount(id)).json().data.status).toBe('RECOUNT');
      const recount = await call('GET', `/${id}`, manager.cookie);
      checkBlind(recount.json());
      expect(recount.json().data.view).toBe('BLIND');
      checkBlind((await scan(id, 'C-1')).json());
      checkBlind((await call('GET', '', manager.cookie)).json());
    }, 120_000);

    it('la revisión sí muestra el sistema, lo esperado y las diferencias', async () => {
      const { id } = await cleanCountInReview();
      const detail = await detailOf(id);
      expect(detail.view).toBe('REVIEW');
      expect(detail.items[0]).toEqual(
        expect.objectContaining({ systemQty: 3, expectedQty: 3, countedQty: 3, difference: 0 }),
      );
    });

    it('un conteo cancelado sigue sin mostrar stock', async () => {
      const cat = await category('Collares');
      await variantIn(cat.id, { sku: 'C-1', stock: 5 });
      const id = await startedCount(cat.id);
      await scan(id, 'C-1');
      await call('POST', `/${id}/cancel`, manager.cookie, { reason: 'Se cambió el plan' });
      const detail = await detailOf(id);
      expect(detail.view).toBe('BLIND');
      expect(detail.status).toBe('CANCELLED');
      for (const forbidden of FORBIDDEN_KEYS) expect(keysOf(detail).has(forbidden)).toBe(false);
    });
  });

  describe('escaneo', () => {
    it('resuelve por SKU (sin distinguir mayúsculas), código de barras y código de proveedor', async () => {
      const cat = await category('Pulseras');
      const a = await variantIn(cat.id, { sku: 'P-AAA', barcode: '880001', stock: 1 });
      const b = await variantIn(cat.id, { sku: 'P-BBB', stock: 1 });
      const c = await variantIn(cat.id, { sku: 'P-CCC', stock: 1 });
      const supplier = await app.prisma.supplier.create({ data: { name: 'Proveedor' } });
      await app.prisma.supplierProduct.create({
        data: { supplierId: supplier.id, variantId: c.id, supplierCode: 'PROV-77' },
      });
      const id = await startedCount(cat.id);

      expect((await scan(id, 'p-aaa')).json().data.item.sku).toBe('P-AAA');
      expect((await scan(id, '880001')).json().data.item.quantity).toBe(2);
      const bySupplier = await scan(id, '  PROV-77\r\n');
      expect(bySupplier.json().data.item.sku).toBe('P-CCC');
      expect(bySupplier.json().data.scan).toEqual(
        expect.objectContaining({ kind: 'ITEM', delta: 1, quantityAfter: 1 }),
      );

      const items = await app.prisma.inventoryCountItem.findMany({
        where: { inventoryCountId: id },
      });
      const qty = (variantId: string) =>
        items.find((i) => i.variantId === variantId)?.countedQty ?? null;
      expect(qty(a.id)).toBe(2);
      expect(qty(b.id)).toBeNull();
      expect(qty(c.id)).toBe(1);
    });

    it('un código de proveedor que corresponde a varias piezas se rechaza (422)', async () => {
      const cat = await category('Pulseras');
      const a = await variantIn(cat.id, { sku: 'P-1', stock: 1 });
      const b = await variantIn(cat.id, { sku: 'P-2', stock: 1 });
      const s1 = await app.prisma.supplier.create({ data: { name: 'S1' } });
      const s2 = await app.prisma.supplier.create({ data: { name: 'S2' } });
      await app.prisma.supplierProduct.create({
        data: { supplierId: s1.id, variantId: a.id, supplierCode: 'DUP' },
      });
      await app.prisma.supplierProduct.create({
        data: { supplierId: s2.id, variantId: b.id, supplierCode: 'DUP' },
      });
      const id = await startedCount(cat.id);
      const res = await scan(id, 'DUP');
      expect(res.statusCode).toBe(422);
      expect(await app.prisma.inventoryCountScan.count({ where: { inventoryCountId: id } })).toBe(
        0,
      );
    });

    it('cada lectura se guarda al instante y el conteo se reanuda tras un nuevo inicio de sesión', async () => {
      const cat = await category('Pulseras');
      await variantIn(cat.id, { sku: 'P-1', stock: 4 });
      const id = await startedCount(cat.id, operator.cookie);
      await scanTimes(id, 'P-1', 3, operator.cookie);

      // Pieza por pieza en la base: 3 lecturas con usuario, delta y hora
      const rows = await app.prisma.inventoryCountScan.findMany({
        where: { inventoryCountId: id },
        orderBy: { id: 'asc' },
      });
      expect(rows.map((r) => r.quantityAfter)).toEqual([1, 2, 3]);
      expect(
        rows.every((r) => r.userId === operator.id && r.delta === 1 && r.source === 'SCAN'),
      ).toBe(true);

      // La sesión caduca / se cierra el navegador: nuevo login del mismo usuario
      await app.prisma.session.deleteMany({});
      expect((await call('GET', `/${id}`, operator.cookie)).statusCode).toBe(401);
      const again = await login(app, operator.email, operator.password);
      const resumed = await detailOf(id, again.cookie);
      expect(resumed.items[0]!.quantity).toBe(3);
      expect(resumed.operatorId).toBe(operator.id);
      expect((await scan(id, 'P-1', again.cookie)).json().data.item.quantity).toBe(4);
    });

    it('el historial de lecturas se puede consultar', async () => {
      const cat = await category('Pulseras');
      await variantIn(cat.id, { sku: 'P-1', stock: 4 });
      const id = await startedCount(cat.id);
      await scanTimes(id, 'P-1', 2);
      await scan(id, 'RARO');
      const res = await call('GET', `/${id}/scans`, manager.cookie);
      expect(res.statusCode).toBe(200);
      expect(res.json().meta.total).toBe(3);
      expect(res.json().data[0]).toEqual(
        expect.objectContaining({
          code: 'RARO',
          findingCode: 'RARO',
          source: 'SCAN',
          undone: false,
        }),
      );
    });

    it('fijar la cantidad a mano y deshacer la última lectura', async () => {
      const cat = await category('Pulseras');
      const v = await variantIn(cat.id, { sku: 'P-1', stock: 4 });
      const id = await startedCount(cat.id);
      expect((await call('POST', `/${id}/undo`, manager.cookie)).statusCode).toBe(422);
      await scanTimes(id, 'P-1', 2);
      const set = await call('PUT', `/${id}/items/${v.id}`, manager.cookie, { quantity: 7 });
      expect(set.json().data.item.quantity).toBe(7);
      expect(set.json().data.scan).toEqual(expect.objectContaining({ delta: 5, quantityAfter: 7 }));

      let undone = await call('POST', `/${id}/undo`, manager.cookie);
      expect(undone.json().data.item.quantity).toBe(2); // vuelve a lo escaneado
      undone = await call('POST', `/${id}/undo`, manager.cookie);
      expect(undone.json().data.item.quantity).toBe(1);
      undone = await call('POST', `/${id}/undo`, manager.cookie);
      expect(undone.json().data.item.quantity).toBe(0);
      expect(undone.json().data.scan).toBeNull();
      expect((await detailOf(id)).scannedVariants).toBe(0);

      const marks = await app.prisma.inventoryCountScan.findMany({
        where: { inventoryCountId: id },
      });
      expect(marks).toHaveLength(3);
      expect(marks.every((m) => m.undoneAt !== null)).toBe(true);
      // Fijar una variante ajena al conteo es 404
      const other = await category('Otra');
      const stranger = await variantIn(other.id, { stock: 1 });
      expect(
        (await call('PUT', `/${id}/items/${stranger.id}`, manager.cookie, { quantity: 1 }))
          .statusCode,
      ).toBe(404);
    });
  });

  describe('hallazgos', () => {
    it('código inexistente o de otra categoría: hallazgo, sin tocar el stock', async () => {
      const cat = await category('Aretes');
      const otherCat = await category('Bolsos');
      const mine = await variantIn(cat.id, { sku: 'A-1', stock: 2 });
      const foreign = await variantIn(otherCat.id, { sku: 'B-1', barcode: '990001', stock: 6 });
      const id = await startedCount(cat.id);

      const unknown = await scan(id, 'XYZ-999');
      expect(unknown.json().data.finding).toEqual(
        expect.objectContaining({ type: 'NOT_FOUND', code: 'XYZ-999', quantity: 1 }),
      );
      expect(unknown.json().data.item).toBeNull();
      await scan(id, 'XYZ-999');
      const outOfScope = await scan(id, '990001');
      expect(outOfScope.json().data.finding).toEqual(
        expect.objectContaining({ type: 'OUT_OF_SCOPE', sku: 'B-1', quantity: 1 }),
      );
      await scan(id, 'b-1'); // otro código de la misma pieza: se acumula
      const detail = await detailOf(id);
      expect(detail.findings).toHaveLength(2);
      expect(
        detail.findings.find((f: { type: string }) => f.type === 'OUT_OF_SCOPE')!.quantity,
      ).toBe(2);
      expect(detail.findings.find((f: { type: string }) => f.type === 'NOT_FOUND')!.quantity).toBe(
        2,
      );
      expect(detail.items).toHaveLength(0);

      // Notas del operador sobre un hallazgo
      const fid = detail.findings[0]!.id;
      const noted = await call('PATCH', `/${id}/findings/${fid}`, manager.cookie, {
        note: 'Estaba en la vitrina',
      });
      expect(noted.json().data.note).toBe('Estaba en la vitrina');

      // El stock no se alteró (ni de la pieza propia ni de la ajena) y no hay movimientos
      expect(await balanceOf(mine.id)).toBe(2);
      expect(await balanceOf(foreign.id)).toBe(6);
      expect(
        await app.prisma.inventoryMovement.count({ where: { type: 'COUNT_ADJUSTMENT' } }),
      ).toBe(0);
    });

    it('el aprobador los regulariza con nota desde la revisión; no antes ni dos veces', async () => {
      const cat = await category('Aretes');
      await variantIn(cat.id, { sku: 'A-1', stock: 1 });
      const id = await startedCount(cat.id);
      await scan(id, 'A-1');
      await scan(id, 'DESCONOCIDO');
      const fid = (await detailOf(id)).findings[0]!.id;

      // Durante la captura no se regulariza
      expect(
        (await call('POST', `/${id}/findings/${fid}/regularize`, manager.cookie, { note: 'ok' }))
          .statusCode,
      ).toBe(422);
      expect((await closeCount(id)).json().data.status).toBe('IN_REVIEW');

      expect(
        (await call('POST', `/${id}/findings/${fid}/regularize`, manager.cookie, { note: ' ' }))
          .statusCode,
      ).toBe(400);
      const done = await call('POST', `/${id}/findings/${fid}/regularize`, manager.cookie, {
        note: 'Se dio de alta como producto nuevo',
      });
      expect(done.statusCode).toBe(200);
      expect(done.json().data).toEqual(
        expect.objectContaining({
          regularized: true,
          regularizationNote: 'Se dio de alta como producto nuevo',
        }),
      );
      expect(
        (
          await call('POST', `/${id}/findings/${fid}/regularize`, manager.cookie, {
            note: 'otra vez',
          })
        ).statusCode,
      ).toBe(422);
      const audit = await app.prisma.auditLog.findFirst({
        where: { action: 'inventory_count.finding_regularized' },
      });
      expect(audit?.userId).toBe(manager.id);
    });
  });

  describe('operador único', () => {
    it('otro usuario no captura a la vez; puede tomar el conteo y el anterior queda fuera', async () => {
      const cat = await category('Aretes');
      await variantIn(cat.id, { sku: 'A-1', stock: 5 });
      const id = await startedCount(cat.id, operator.cookie);
      await scan(id, 'A-1', operator.cookie);

      const denied = await scan(id, 'A-1', manager.cookie);
      expect(denied.statusCode).toBe(403);
      expect(denied.json().error.message).toContain('capturando');
      expect((await call('POST', `/${id}/undo`, manager.cookie)).statusCode).toBe(403);
      expect((await closeCount(id, manager.cookie)).statusCode).toBe(403);
      expect(await app.prisma.inventoryCountScan.count({ where: { inventoryCountId: id } })).toBe(
        1,
      );

      const taken = await call('POST', `/${id}/take`, manager.cookie);
      expect(taken.statusCode).toBe(200);
      expect(taken.json().data.operatorId).toBe(manager.id);
      expect((await scan(id, 'A-1', manager.cookie)).statusCode).toBe(200);
      expect((await scan(id, 'A-1', operator.cookie)).statusCode).toBe(403);
      const audit = await app.prisma.auditLog.findFirst({
        where: { action: 'inventory_count.taken' },
      });
      expect(audit?.userId).toBe(manager.id);
    });

    it('no se captura un borrador ni se toma un conteo en revisión', async () => {
      const cat = await category('Aretes');
      await variantIn(cat.id, { sku: 'A-1', stock: 1 });
      const draft = await createCount(cat.id);
      expect((await scan(draft.id, 'A-1')).statusCode).toBe(422);
      expect((await call('POST', `/${draft.id}/take`, manager.cookie)).statusCode).toBe(422);
      expect((await closeCount(draft.id)).statusCode).toBe(422);
      await call('POST', `/${draft.id}/start`, manager.cookie);
      expect((await call('POST', `/${draft.id}/start`, manager.cookie)).statusCode).toBe(422);
      await scan(draft.id, 'A-1');
      await closeCount(draft.id);
      expect((await scan(draft.id, 'A-1')).statusCode).toBe(422);
      expect((await call('POST', `/${draft.id}/take`, operator.cookie)).statusCode).toBe(422);
    });
  });

  describe('flujo de estados y segundo recuento', () => {
    it('sin diferencias pasa directo a revisión y al aprobar no se genera ningún movimiento', async () => {
      const { id, v } = await cleanCountInReview();
      const detail = await detailOf(id);
      expect(detail.status).toBe('IN_REVIEW');
      expect(detail.recountTotal).toBe(0);
      expect(detail.differencesCount).toBe(0);

      const approved = await call('POST', `/${id}/approve`, manager.cookie);
      expect(approved.statusCode).toBe(200);
      expect(approved.json().data.status).toBe('APPROVED');
      expect(
        await app.prisma.inventoryMovement.count({ where: { type: 'COUNT_ADJUSTMENT' } }),
      ).toBe(0);
      expect(await balanceOf(v.id)).toBe(3);
    });

    it('con diferencias exige segundo recuento, a ciegas y solo de esas variantes', async () => {
      const cat = await category('Anillos');
      const ok = await variantIn(cat.id, { sku: 'N-OK', stock: 4 });
      const missing = await variantIn(cat.id, { sku: 'N-MISS', stock: 5 });
      const unseen = await variantIn(cat.id, { sku: 'N-UNSEEN', stock: 2 }); // no escaneada → 0
      const id = await startedCount(cat.id);
      await scanTimes(id, 'N-OK', 4);
      await scanTimes(id, 'N-MISS', 3);

      // No se aprueba ni se salta el recuento
      expect((await call('POST', `/${id}/approve`, manager.cookie)).statusCode).toBe(422);

      const closed = await closeCount(id);
      expect(closed.json().data.status).toBe('RECOUNT');
      const recountView = await detailOf(id);
      expect(recountView.view).toBe('BLIND');
      expect(recountView.recountTotal).toBe(2);
      expect(recountView.items.map((i: { sku: string }) => i.sku).sort()).toEqual([
        'N-MISS',
        'N-UNSEEN',
      ]);
      expect(recountView.items.every((i: { quantity: number }) => i.quantity === 0)).toBe(true);

      // En recuento: aprobar sigue prohibido; una pieza sin diferencia no se recuenta
      expect((await call('POST', `/${id}/approve`, manager.cookie)).statusCode).toBe(422);
      const notListed = await scan(id, 'N-OK');
      expect(notListed.statusCode).toBe(422);

      // Recuento: N-MISS tiene 5 (el primer conteo se equivocó); N-UNSEEN sin lecturas = 0
      await scanTimes(id, 'N-MISS', 5);
      expect((await closeCount(id)).json().data.status).toBe('IN_REVIEW');

      const review = await detailOf(id);
      expect(review.view).toBe('REVIEW');
      const row = (sku: string) => review.items.find((i: { sku: string }) => i.sku === sku);
      expect(row('N-OK')).toEqual(
        expect.objectContaining({ countedQty: 4, recountQty: null, finalQty: 4, difference: 0 }),
      );
      expect(row('N-MISS')).toEqual(
        expect.objectContaining({
          systemQty: 5,
          countedQty: 3,
          recountQty: 5,
          finalQty: 5,
          difference: 0,
        }),
      );
      expect(row('N-UNSEEN')).toEqual(
        expect.objectContaining({
          systemQty: 2,
          countedQty: 0,
          recountQty: 0,
          finalQty: 0,
          difference: -2,
        }),
      );
      expect(review.differencesCount).toBe(1);
      expect(review.netUnits).toBe(-2);

      const approved = await call('POST', `/${id}/approve`, manager.cookie);
      expect(approved.statusCode, approved.body).toBe(200);
      expect(await balanceOf(ok.id)).toBe(4);
      expect(await balanceOf(missing.id)).toBe(5);
      expect(await balanceOf(unseen.id)).toBe(0);
    });

    it('el valor del recuento prevalece como conteo final', async () => {
      const cat = await category('Anillos');
      const v = await variantIn(cat.id, { sku: 'R-1', stock: 6 });
      const id = await startedCount(cat.id);
      await scanTimes(id, 'R-1', 4);
      expect((await closeCount(id)).json().data.status).toBe('RECOUNT');
      await scanTimes(id, 'R-1', 2);
      await closeCount(id);
      expect((await call('POST', `/${id}/approve`, manager.cookie)).statusCode).toBe(200);
      expect(await balanceOf(v.id)).toBe(2); // rige el recuento (2), no el primer conteo (4)
    });
  });

  describe('aprobación', () => {
    it('genera un COUNT_ADJUSTMENT por variante con diferencia, con trazabilidad y auditoría', async () => {
      const cat = await category('Anillos');
      const short = await variantIn(cat.id, { sku: 'L-1', stock: 10, costPrice: '3' });
      const over = await variantIn(cat.id, { sku: 'L-2', stock: 2, costPrice: '5' });
      const same = await variantIn(cat.id, { sku: 'L-3', stock: 1 });
      const id = await startedCount(cat.id);
      await scanTimes(id, 'L-1', 7);
      await scanTimes(id, 'L-2', 3);
      await scanTimes(id, 'L-3', 1);
      await closeCount(id);
      await scanTimes(id, 'L-1', 7); // recuento confirma
      await scanTimes(id, 'L-2', 3);
      await closeCount(id);

      const review = await detailOf(id);
      expect(review.valueImpact).toBe('-4.00'); // -3 × 3.00 + 1 × 5.00
      expect(review.items.find((i: { sku: string }) => i.sku === 'L-1')!.valueImpact).toBe('-9.00');

      const approved = await call('POST', `/${id}/approve`, manager.cookie);
      expect(approved.statusCode, approved.body).toBe(200);
      expect(approved.json().data.approvedByName).toBeTruthy();

      expect(await balanceOf(short.id)).toBe(7);
      expect(await balanceOf(over.id)).toBe(3);
      expect(await balanceOf(same.id)).toBe(1);

      const movements = await app.prisma.inventoryMovement.findMany({
        where: { type: 'COUNT_ADJUSTMENT' },
        orderBy: { id: 'asc' },
      });
      expect(movements).toHaveLength(2);
      const byVariant = new Map(movements.map((m) => [m.variantId, m]));
      const mShort = byVariant.get(short.id);
      expect(mShort).toEqual(
        expect.objectContaining({
          quantity: -3,
          balanceBefore: 10,
          balanceAfter: 7,
          referenceType: 'INVENTORY_COUNT',
          referenceId: id,
          reason: 'Conteo CNT-000001',
          userId: manager.id,
        }),
      );
      expect(mShort?.unitCost?.toFixed(4)).toBe('3.0000');
      expect(byVariant.get(over.id)?.quantity).toBe(1);

      // Líneas congeladas
      const approvedDetail = await detailOf(id);
      const l1 = approvedDetail.items.find((i: { sku: string }) => i.sku === 'L-1');
      expect(l1).toEqual(
        expect.objectContaining({
          expectedQty: 10,
          finalQty: 7,
          difference: -3,
          currentQty: 10,
          resultingQty: 7,
        }),
      );
      expect(l1!.movementId).toBe(mShort?.id.toString());

      const audit = await app.prisma.auditLog.findFirst({
        where: { action: 'inventory_count.approved', entityId: id },
      });
      expect(audit?.userId).toBe(manager.id);
      expect(JSON.stringify(audit?.after)).toContain('L-1');
    });

    it('doble aprobación imposible: la segunda se rechaza y no duplica movimientos', async () => {
      const cat = await category('Collares');
      const v = await variantIn(cat.id, { sku: 'D-1', stock: 5 });
      const second = await startedCount(cat.id);
      await scanTimes(second, 'D-1', 3);
      await closeCount(second);
      await scanTimes(second, 'D-1', 3);
      await closeCount(second);

      const first = await call('POST', `/${second}/approve`, manager.cookie);
      expect(first.statusCode).toBe(200);
      const again = await call('POST', `/${second}/approve`, manager.cookie);
      expect(again.statusCode).toBe(422);
      expect(again.json().error.message).toContain('ya fue aprobado');
      expect(await balanceOf(v.id)).toBe(3);
      expect(
        await app.prisma.inventoryMovement.count({ where: { type: 'COUNT_ADJUSTMENT' } }),
      ).toBe(1);
    });

    it('dos aprobaciones simultáneas: una prospera y la otra se rechaza', async () => {
      const cat = await category('Collares');
      const v = await variantIn(cat.id, { sku: 'D-1', stock: 5 });
      const id = await startedCount(cat.id);
      await scanTimes(id, 'D-1', 2);
      await closeCount(id);
      await scanTimes(id, 'D-1', 2);
      await closeCount(id);
      const approver2 = await sessionFor(MANAGER);
      const results = await Promise.all([
        call('POST', `/${id}/approve`, manager.cookie),
        call('POST', `/${id}/approve`, approver2.cookie),
      ]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 422]);
      expect(await balanceOf(v.id)).toBe(2);
      expect(
        await app.prisma.inventoryMovement.count({ where: { type: 'COUNT_ADJUSTMENT' } }),
      ).toBe(1);
    });

    it('concilia un ingreso confirmado durante el conteo (ADR-014)', async () => {
      const cat = await category('Anillos');
      const v = await variantIn(cat.id, { sku: 'K-1', stock: 10 });
      const w = await variantIn(cat.id, { sku: 'K-2', stock: 4 });
      const id = await startedCount(cat.id);
      await scanTimes(id, 'K-1', 9); // falta 1 pieza
      await scanTimes(id, 'K-2', 4);

      // Mientras se cuenta, entra mercadería de K-1 (+5): ingreso real, confirmado
      const stocker = await sessionFor([
        PERMISSIONS.STOCK_ENTRIES_READ,
        PERMISSIONS.STOCK_ENTRIES_MANAGE,
        PERMISSIONS.STOCK_ENTRIES_CONFIRM,
      ]);
      const supplier = await app.prisma.supplier.create({ data: { name: 'Proveedor' } });
      const draft = await app.inject({
        method: 'POST',
        url: '/api/v1/stock-entries',
        headers: { cookie: stocker.cookie },
        payload: { supplierId: supplier.id },
      });
      const entryId = draft.json().data.id as string;
      await app.inject({
        method: 'PUT',
        url: `/api/v1/stock-entries/${entryId}/items`,
        headers: { cookie: stocker.cookie },
        payload: { items: [{ variantId: v.id, receivedQty: 5, unitCost: '2' }] },
      });
      const confirmed = await app.inject({
        method: 'POST',
        url: `/api/v1/stock-entries/${entryId}/confirm`,
        headers: { cookie: stocker.cookie },
      });
      expect(confirmed.statusCode, confirmed.body).toBe(200);
      expect(await balanceOf(v.id)).toBe(15);

      // Primer conteo: K-1 difiere (9 contadas vs 10 esperadas al contar) → recuento solo de K-1
      const closed = await closeCount(id);
      expect(closed.json().data.status).toBe('RECOUNT');
      expect((await detailOf(id)).items.map((i: { sku: string }) => i.sku)).toEqual(['K-1']);
      // Recuento (después del ingreso): en el estante hay 9 + 5 recién llegadas = 14
      await scanTimes(id, 'K-1', 14);
      await closeCount(id);
      // Antes de aprobar entra otro ingreso (+2): también se concilia
      await stockUp(v.id, 2);

      const review = await detailOf(id);
      const row = review.items.find((i: { sku: string }) => i.sku === 'K-1');
      expect(row).toEqual(
        expect.objectContaining({
          systemQty: 10,
          expectedQty: 15, // lo que había cuando se recontó (10 + el ingreso de 5)
          reconciledMovements: 2, // el ingreso posterior al recuento
          currentQty: 17,
          finalQty: 14,
          difference: -1,
          resultingQty: 16,
        }),
      );
      // K-2 no tuvo movimientos: sin diferencia
      expect(review.items.find((i: { sku: string }) => i.sku === 'K-2')!.difference).toBe(0);

      expect((await call('POST', `/${id}/approve`, manager.cookie)).statusCode).toBe(200);
      // Los dos ingresos se conservan; el ajuste fue solo −1 (no −6 por comparar con la foto)
      expect(await balanceOf(v.id)).toBe(16);
      expect(await balanceOf(w.id)).toBe(4);
      const adjustment = await app.prisma.inventoryMovement.findFirst({
        where: { type: 'COUNT_ADJUSTMENT', variantId: v.id },
      });
      expect(adjustment).toEqual(
        expect.objectContaining({ quantity: -1, balanceBefore: 17, balanceAfter: 16 }),
      );
    });

    it('un ingreso durante el conteo sin otras diferencias no genera ajuste ni recuento', async () => {
      const cat = await category('Anillos');
      const v = await variantIn(cat.id, { sku: 'K-1', stock: 10 });
      const id = await startedCount(cat.id);
      await scanTimes(id, 'K-1', 10);
      await stockUp(v.id, 5); // movimiento posterior a la lectura
      expect((await closeCount(id)).json().data.status).toBe('IN_REVIEW');
      expect((await call('POST', `/${id}/approve`, manager.cookie)).statusCode).toBe(200);
      expect(await balanceOf(v.id)).toBe(15);
      expect(
        await app.prisma.inventoryMovement.count({ where: { type: 'COUNT_ADJUSTMENT' } }),
      ).toBe(0);
    });

    it('no permite dejar el saldo negativo: nada cambia y el conteo sigue en revisión', async () => {
      const cat = await category('Anillos');
      const a = await variantIn(cat.id, { sku: 'N-1', stock: 5 });
      const b = await variantIn(cat.id, { sku: 'N-2', stock: 5 });
      const id = await startedCount(cat.id);
      await scanTimes(id, 'N-1', 3);
      await scanTimes(id, 'N-2', 4); // diferencia ordinaria de −1 (sí se podría aplicar)
      await closeCount(id);
      await scanTimes(id, 'N-1', 3);
      await scanTimes(id, 'N-2', 4);
      await closeCount(id);
      // Ya en revisión sale mercadería de N-1 por otra vía: saldo 1 (contadas 3 + salida −4 = −1)
      await stockUp(a.id, -4, 'ADJUSTMENT');

      const review = await detailOf(id);
      expect(review.blockers.join(' ')).toContain('N-1');
      const res = await call('POST', `/${id}/approve`, manager.cookie);
      expect(res.statusCode).toBe(422);
      expect(await balanceOf(a.id)).toBe(1);
      expect(await balanceOf(b.id)).toBe(5); // la línea válida también se revirtió (atomicidad)
      expect(
        await app.prisma.inventoryMovement.count({ where: { type: 'COUNT_ADJUSTMENT' } }),
      ).toBe(0);
      expect((await detailOf(id)).status).toBe('IN_REVIEW');
      expect(
        await app.prisma.auditLog.count({ where: { action: 'inventory_count.approved' } }),
      ).toBe(0);
    });

    it('costos y valorización solo con costs:read', async () => {
      const cat = await category('Anillos');
      await variantIn(cat.id, { sku: 'V-1', stock: 4, costPrice: '10' });
      const id = await startedCount(cat.id);
      await scanTimes(id, 'V-1', 3);
      await closeCount(id);
      await scanTimes(id, 'V-1', 3);
      await closeCount(id);

      const withCosts = await detailOf(id, manager.cookie);
      expect(withCosts.valueImpact).toBe('-10.00');
      expect(withCosts.items[0]!.unitCost).toBe('10.0000');
      const without = await detailOf(id, operator.cookie);
      expect(without.valueImpact).toBeNull();
      expect(without.items[0]!.unitCost).toBeNull();
      expect(without.items[0]!.valueImpact).toBeNull();
    });
  });

  describe('cancelación', () => {
    it('cancelar no mueve stock en ningún estado y un aprobado no se cancela', async () => {
      const cat = await category('Anillos');
      const v = await variantIn(cat.id, { sku: 'Z-1', stock: 5 });
      const draft = await createCount(cat.id);
      expect((await call('POST', `/${draft.id}/cancel`, manager.cookie, {})).statusCode).toBe(200);

      const started = await startedCount(cat.id);
      await scanTimes(started, 'Z-1', 1);
      await closeCount(started);
      expect((await detailOf(started)).status).toBe('RECOUNT');
      const cancelled = await call('POST', `/${started}/cancel`, manager.cookie, {
        reason: 'Mal contado',
      });
      expect(cancelled.json().data.status).toBe('CANCELLED');
      expect(await balanceOf(v.id)).toBe(5);
      expect(
        await app.prisma.inventoryMovement.count({ where: { type: 'COUNT_ADJUSTMENT' } }),
      ).toBe(0);
      expect((await call('POST', `/${started}/cancel`, manager.cookie, {})).statusCode).toBe(422);
      expect((await scan(started, 'Z-1')).statusCode).toBe(422);
      expect((await call('POST', `/${started}/approve`, manager.cookie)).statusCode).toBe(422);

      const { id } = await cleanCountInReview();
      await call('POST', `/${id}/approve`, manager.cookie);
      expect((await call('POST', `/${id}/cancel`, manager.cookie, {})).statusCode).toBe(422);
    });

    it('un conteo en revisión se puede cancelar', async () => {
      const { id, v } = await cleanCountInReview();
      expect((await call('POST', `/${id}/cancel`, manager.cookie, {})).json().data.status).toBe(
        'CANCELLED',
      );
      expect(await balanceOf(v.id)).toBe(3);
    });
  });

  describe('lista', () => {
    it('muestra estado, categoría y progreso; filtra por estado', async () => {
      const a = await category('Aretes');
      const b = await category('Bolsos');
      await variantIn(a.id, { sku: 'L-1', stock: 3 });
      await variantIn(b.id, { sku: 'L-2', stock: 3 });
      const first = await startedCount(a.id);
      await scanTimes(first, 'L-1', 2);
      await createCount(b.id);

      const all = await call('GET', '', manager.cookie);
      expect(all.json().meta.total).toBe(2);
      expect(all.json().data[0]).toEqual(
        expect.objectContaining({ status: 'DRAFT', scope: 'Bolsos' }),
      );
      expect(all.json().data[1]).toEqual(
        expect.objectContaining({
          status: 'IN_PROGRESS',
          scannedVariants: 1,
          piecesCounted: 2,
          totalVariants: 1,
        }),
      );
      const open = await call('GET', '?status=IN_PROGRESS', manager.cookie);
      expect(open.json().data).toHaveLength(1);
      expect((await call('GET', '?status=open', manager.cookie)).json().data).toHaveLength(2);
    });
  });

  describe('integridad en la base de datos', () => {
    it('un conteo aprobado y sus lecturas son inmutables', async () => {
      const { id } = await cleanCountInReview();
      await call('POST', `/${id}/approve`, manager.cookie);
      await expect(
        app.prisma.inventoryCount.update({ where: { id }, data: { notes: 'cambio' } }),
      ).rejects.toThrow();
      await expect(app.prisma.inventoryCount.delete({ where: { id } })).rejects.toThrow();
      await expect(
        app.prisma.inventoryCountItem.updateMany({
          where: { inventoryCountId: id },
          data: { countedQty: 99 },
        }),
      ).rejects.toThrow();
      await expect(
        app.prisma.inventoryCountScan.deleteMany({ where: { inventoryCountId: id } }),
      ).rejects.toThrow();
      await expect(
        app.prisma.inventoryCountScan.updateMany({
          where: { inventoryCountId: id },
          data: { delta: 5 },
        }),
      ).rejects.toThrow();
    });
  });
});
