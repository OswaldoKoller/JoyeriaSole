import { PERMISSIONS, type Permission } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';

const BASE = '/api/v1/pricing';
const UNKNOWN_ID = '01900000-0000-7000-8000-000000000000';

/** Roles de prueba equivalentes a los reales (ADR-018, matriz del brief). */
const ADMIN: Permission[] = [
  PERMISSIONS.CATALOG_READ,
  PERMISSIONS.CATALOG_MANAGE,
  PERMISSIONS.COSTS_READ,
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.PRICES_PROPOSE,
  PERMISSIONS.PRICES_APPROVE,
];
const MANAGER: Permission[] = [
  PERMISSIONS.CATALOG_READ,
  PERMISSIONS.CATALOG_MANAGE,
  PERMISSIONS.COSTS_READ,
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.PRICES_PROPOSE,
];
const SELLER: Permission[] = [PERMISSIONS.CATALOG_READ, PERMISSIONS.INVENTORY_READ];

interface Change {
  id: string;
  variantId: string;
  previousPrice: string;
  newPrice: string;
  status: string;
  origin: string;
  requestedBy: { id: string; name: string };
  decidedBy: { id: string; name: string } | null;
  decisionComment: string | null;
  costSnapshot: string | null;
  batchId: string | null;
}

describe('precios de venta: solicitud, aprobación e historial', () => {
  let app: App;
  let admin: { cookie: string; id: string };
  let manager: { cookie: string; id: string };
  let seller: { cookie: string; id: string };

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
    admin = await session(ADMIN);
    manager = await session(MANAGER);
    seller = await session(SELLER);
  });
  afterEach(() => app.close());

  async function session(permissions: Permission[]) {
    const { user, password } = await createTestUser(app.prisma, { permissions });
    const { cookie } = await login(app, user.email, password);
    return { cookie, id: user.id };
  }

  let counter = 0;
  async function createVariant(
    options: { salePrice?: string; costPrice?: string; active?: boolean } = {},
  ) {
    // Valor local: createVariant puede llamarse en paralelo y `counter` cambia durante los await.
    counter += 1;
    const n = counter;
    const category = await app.prisma.category.create({
      data: { name: `Cat ${n}`, slug: `cat-${n}-${Date.now()}` },
    });
    const product = await app.prisma.product.create({
      data: { categoryId: category.id, name: `Producto ${n}` },
    });
    return app.prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `PRC-${n}-${Date.now()}`,
        salePrice: options.salePrice ?? '0',
        costPrice: options.costPrice ?? '40.3333',
        status: options.active === false ? 'INACTIVE' : 'ACTIVE',
      },
    });
  }

  const call = (method: 'GET' | 'POST', url: string, cookie: string, payload?: object) =>
    app.inject({ method, url, headers: { cookie }, ...(payload !== undefined && { payload }) });

  async function request(variantId: string, newPrice: string, who = manager): Promise<Change> {
    const res = await call('POST', `${BASE}/requests`, who.cookie, {
      items: [{ variantId, newPrice }],
      reason: 'Temporada',
    });
    expect(res.statusCode, res.body).toBe(201);
    return (res.json().data as Change[])[0] as Change;
  }

  const priceOf = async (variantId: string) =>
    (
      await app.prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })
    ).salePrice.toFixed(2);

  describe('seguridad y validación (401 / 403 / 400)', () => {
    const endpoints: { method: 'GET' | 'POST'; url: string; payload?: object }[] = [
      { method: 'GET', url: `${BASE}/variants` },
      { method: 'GET', url: `${BASE}/changes` },
      { method: 'GET', url: `${BASE}/variants/${UNKNOWN_ID}/history` },
      { method: 'GET', url: `${BASE}/pending-count` },
      { method: 'POST', url: `${BASE}/requests`, payload: { items: [] } },
      { method: 'POST', url: `${BASE}/apply`, payload: { items: [] } },
      { method: 'POST', url: `${BASE}/changes/approve`, payload: { ids: [] } },
      { method: 'POST', url: `${BASE}/changes/reject`, payload: { ids: [] } },
      { method: 'POST', url: `${BASE}/changes/${UNKNOWN_ID}/cancel` },
    ];

    it('401 sin sesión en todos los endpoints', async () => {
      for (const endpoint of endpoints) {
        const res = await app.inject({
          method: endpoint.method,
          url: endpoint.url,
          ...(endpoint.payload && { payload: endpoint.payload }),
        });
        expect(res.statusCode, `${endpoint.method} ${endpoint.url}`).toBe(401);
      }
    });

    it('el Vendedor recibe 403 en todos los endpoints (no llega a precios ni costos)', async () => {
      for (const endpoint of endpoints) {
        const res = await call(endpoint.method, endpoint.url, seller.cookie, endpoint.payload);
        expect(res.statusCode, `${endpoint.method} ${endpoint.url}`).toBe(403);
        expect(res.body).not.toMatch(/cost/i);
      }
    });

    it('el Responsable no aprueba, rechaza, aplica ni ve el contador de pendientes (403)', async () => {
      const variant = await createVariant();
      const change = await request(variant.id, '100');
      const forbidden = [
        call('POST', `${BASE}/changes/approve`, manager.cookie, { ids: [change.id] }),
        call('POST', `${BASE}/changes/reject`, manager.cookie, { ids: [change.id], comment: 'No' }),
        call('POST', `${BASE}/apply`, manager.cookie, {
          items: [{ variantId: variant.id, newPrice: '50' }],
        }),
        call('GET', `${BASE}/pending-count`, manager.cookie),
      ];
      for (const res of await Promise.all(forbidden)) expect(res.statusCode).toBe(403);
      expect(await priceOf(variant.id)).toBe('0.00');
      expect(
        (await app.prisma.priceChange.findUniqueOrThrow({ where: { id: change.id } })).status,
      ).toBe('PENDING');
    });

    it('quien solo aprueba no puede solicitar (403) y quien solo solicita no puede aplicar', async () => {
      const onlyApprover = await session([PERMISSIONS.PRICES_APPROVE]);
      const res = await call('POST', `${BASE}/requests`, onlyApprover.cookie, {
        items: [{ variantId: UNKNOWN_ID, newPrice: '1' }],
      });
      expect(res.statusCode).toBe(403);
    });

    it('400 con datos inválidos', async () => {
      const variant = await createVariant();
      const bad: [string, object][] = [
        [`${BASE}/requests`, { items: [] }],
        [`${BASE}/requests`, { items: [{ variantId: variant.id, newPrice: '-5' }] }],
        [`${BASE}/requests`, { items: [{ variantId: variant.id, newPrice: '1,5' }] }],
        [`${BASE}/requests`, { items: [{ variantId: 'no-uuid', newPrice: '5' }] }],
        [
          `${BASE}/requests`,
          {
            items: [
              { variantId: variant.id, newPrice: '5' },
              { variantId: variant.id, newPrice: '6' },
            ],
          },
        ],
        [`${BASE}/changes/reject`, { ids: [variant.id] }],
        [`${BASE}/changes/reject`, { ids: [variant.id], comment: ' ' }],
        [`${BASE}/changes/approve`, { ids: [] }],
      ];
      for (const [url, payload] of bad) {
        const cookie = url.includes('/changes/') ? admin.cookie : manager.cookie;
        const res = await call('POST', url, cookie, payload);
        expect(res.statusCode, `${url} ${JSON.stringify(payload)}`).toBe(400);
      }
      expect((await call('GET', `${BASE}/variants?page=0`, admin.cookie)).statusCode).toBe(400);
      expect((await call('GET', `${BASE}/changes?status=XX`, admin.cookie)).statusCode).toBe(400);
    });
  });

  describe('listado con panel de costos', () => {
    it('muestra precio, stock, costos y la solicitud pendiente a quien tiene costs:read', async () => {
      const variant = await createVariant({ salePrice: '150', costPrice: '12.5000' });
      await app.prisma.inventoryBalance.create({ data: { variantId: variant.id, quantity: 7 } });
      const supplier = await app.prisma.supplier.create({ data: { name: 'Prov' } });
      const confirmedAt = new Date('2026-11-01T12:00:00Z');
      const entry = await app.prisma.stockEntry.create({
        data: {
          supplierId: supplier.id,
          status: 'CONFIRMED',
          currency: 'USD',
          exchangeRate: '6.96',
          createdById: admin.id,
          confirmedById: admin.id,
          confirmedAt,
          items: {
            create: {
              variantId: variant.id,
              receivedQty: 4,
              unitPrice: '1.5',
              unitCost: '10.4400',
              unitExtraCost: '2.0600',
              extraCostAllocated: '8.24',
              totalCost: '50.0000',
            },
          },
        },
      });
      await request(variant.id, '180');

      const res = await call('GET', `${BASE}/variants?q=${variant.sku}`, manager.cookie);
      expect(res.statusCode).toBe(200);
      const [row] = res.json().data;
      expect(res.json().meta.total).toBe(1);
      expect(row).toMatchObject({
        variantId: variant.id,
        salePrice: '150.00',
        stockQuantity: 7,
        costs: {
          purchaseUnitCost: '10.4400',
          purchaseQty: 4,
          purchaseSubtotal: '41.7600',
          extraUnitCost: '2.0600',
          totalUnitCost: '12.5000',
          lastEntryId: entry.id,
        },
        pending: { newPrice: '180.00', reason: 'Temporada' },
      });
    });

    it('sin costs:read los costos son null en la respuesta', async () => {
      const variant = await createVariant({ costPrice: '77.7777' });
      const noCosts = await session([PERMISSIONS.PRICES_PROPOSE, PERMISSIONS.CATALOG_READ]);
      const res = await call('GET', `${BASE}/variants`, noCosts.cookie);
      expect(res.statusCode).toBe(200);
      expect(res.json().data[0]).toMatchObject({
        variantId: variant.id,
        costs: null,
        stockQuantity: null,
      });
      expect(res.body).not.toContain('77.7777');
    });

    it('filtra por búsqueda, categoría, «sin precio» y «con pendientes»; pagina', async () => {
      const priced = await createVariant({ salePrice: '10' });
      const free = await createVariant({ salePrice: '0' });
      const withPending = await createVariant({ salePrice: '20' });
      await createVariant({ active: false });
      await request(withPending.id, '25');

      const noPrice = await call('GET', `${BASE}/variants?noPrice=true`, admin.cookie);
      expect(noPrice.json().data.map((r: { variantId: string }) => r.variantId)).toEqual([free.id]);
      expect(noPrice.json().meta.total).toBe(1);

      const pending = await call('GET', `${BASE}/variants?withPending=true`, admin.cookie);
      expect(pending.json().data.map((r: { variantId: string }) => r.variantId)).toEqual([
        withPending.id,
      ]);

      const bySku = await call('GET', `${BASE}/variants?q=${priced.sku}`, admin.cookie);
      expect(bySku.json().data).toHaveLength(1);

      const category = await app.prisma.product.findUniqueOrThrow({
        where: { id: priced.productId },
      });
      const byCategory = await call(
        'GET',
        `${BASE}/variants?categoryId=${category.categoryId}`,
        admin.cookie,
      );
      expect(byCategory.json().data.map((r: { variantId: string }) => r.variantId)).toEqual([
        priced.id,
      ]);

      // Las variantes inactivas no aparecen: 3 activas en total.
      const all = await call('GET', `${BASE}/variants?pageSize=2&page=2`, admin.cookie);
      expect(all.json().meta).toEqual({ page: 2, pageSize: 2, total: 3 });
      expect(all.json().data).toHaveLength(1);
    });
  });

  describe('solicitud del Responsable', () => {
    it('crea la solicitud PENDING sin cambiar el precio vigente, con snapshot del costo y auditoría', async () => {
      const variant = await createVariant({ salePrice: '90', costPrice: '40.3333' });
      const change = await request(variant.id, '120.5');
      expect(change).toMatchObject({
        previousPrice: '90.00',
        newPrice: '120.50',
        status: 'PENDING',
        origin: 'REQUEST',
        decidedBy: null,
        costSnapshot: '40.3333',
        requestedBy: { id: manager.id },
      });
      expect(await priceOf(variant.id)).toBe('90.00');
      const audit = await app.prisma.auditLog.findFirst({
        where: { action: 'price.requested', entityId: change.id },
      });
      expect(audit?.userId).toBe(manager.id);
    });

    it('solicita varias variantes en un lote atómico: si una falla no se crea ninguna', async () => {
      const a = await createVariant({ salePrice: '10' });
      const b = await createVariant({ salePrice: '10' });
      const ok = await call('POST', `${BASE}/requests`, manager.cookie, {
        items: [
          { variantId: a.id, newPrice: '15' },
          { variantId: b.id, newPrice: '16' },
        ],
      });
      expect(ok.statusCode).toBe(201);
      expect(ok.json().data).toHaveLength(2);

      const c = await createVariant({ salePrice: '10' });
      const mixed = await call('POST', `${BASE}/requests`, manager.cookie, {
        items: [
          { variantId: c.id, newPrice: '99' },
          { variantId: a.id, newPrice: '17' }, // ya tiene una pendiente
        ],
      });
      expect(mixed.statusCode).toBe(409);
      expect(await app.prisma.priceChange.count({ where: { variantId: c.id } })).toBe(0);
    });

    it('rechaza precio igual al vigente, variante inexistente o inactiva y segunda pendiente', async () => {
      const variant = await createVariant({ salePrice: '10' });
      const same = await call('POST', `${BASE}/requests`, manager.cookie, {
        items: [{ variantId: variant.id, newPrice: '10.00' }],
      });
      expect(same.statusCode).toBe(422);
      const missing = await call('POST', `${BASE}/requests`, manager.cookie, {
        items: [{ variantId: UNKNOWN_ID, newPrice: '10' }],
      });
      expect(missing.statusCode).toBe(404);
      const inactive = await createVariant({ active: false });
      const res = await call('POST', `${BASE}/requests`, manager.cookie, {
        items: [{ variantId: inactive.id, newPrice: '10' }],
      });
      expect(res.statusCode).toBe(422);
      await request(variant.id, '11');
      const second = await call('POST', `${BASE}/requests`, manager.cookie, {
        items: [{ variantId: variant.id, newPrice: '12' }],
      });
      expect(second.statusCode).toBe(409);
    });

    it('permite precio 0 («Sin precio», D9)', async () => {
      const variant = await createVariant({ salePrice: '30' });
      const change = await request(variant.id, '0');
      expect(change.newPrice).toBe('0.00');
    });

    it('el solicitante cancela mientras esté pendiente; otros no; una cancelada no se aprueba', async () => {
      const variant = await createVariant({ salePrice: '10' });
      const change = await request(variant.id, '20');
      const otherManager = await session(MANAGER);
      expect(
        (await call('POST', `${BASE}/changes/${change.id}/cancel`, otherManager.cookie)).statusCode,
      ).toBe(403);
      const cancel = await call('POST', `${BASE}/changes/${change.id}/cancel`, manager.cookie);
      expect(cancel.statusCode).toBe(200);
      expect(cancel.json().data).toMatchObject({
        status: 'CANCELLED',
        decidedBy: { id: manager.id },
      });
      expect(
        (await call('POST', `${BASE}/changes/${change.id}/cancel`, manager.cookie)).statusCode,
      ).toBe(422);
      expect(
        (await call('POST', `${BASE}/changes/approve`, admin.cookie, { ids: [change.id] }))
          .statusCode,
      ).toBe(422);
      expect(await priceOf(variant.id)).toBe('10.00');
      // Con la cancelada ya no hay pendiente: se puede volver a solicitar.
      await request(variant.id, '21');
      expect(
        await app.prisma.auditLog.count({
          where: { action: 'price.cancelled', entityId: change.id },
        }),
      ).toBe(1);
      expect(
        (await call('POST', `${BASE}/changes/${UNKNOWN_ID}/cancel`, manager.cookie)).statusCode,
      ).toBe(404);
    });
  });

  describe('aprobación del Administrador', () => {
    it('aprueba una solicitud: precio vigente, historial y auditoría en una transacción', async () => {
      const variant = await createVariant({ salePrice: '90' });
      const change = await request(variant.id, '125');
      const res = await call('POST', `${BASE}/changes/approve`, admin.cookie, { ids: [change.id] });
      expect(res.statusCode, res.body).toBe(200);
      const [approved] = res.json().data as Change[];
      expect(approved).toMatchObject({
        status: 'APPROVED',
        origin: 'REQUEST',
        decidedBy: { id: admin.id },
        requestedBy: { id: manager.id },
        batchId: res.json().meta.batchId,
      });
      expect(await priceOf(variant.id)).toBe('125.00');
      const changed = await app.prisma.auditLog.findFirst({
        where: { action: 'variant.price_changed', entityId: variant.id },
      });
      expect(changed).toMatchObject({
        userId: admin.id,
        before: { salePrice: '90.00' },
        after: { salePrice: '125.00' },
      });
      expect(
        await app.prisma.auditLog.count({
          where: { action: 'price.approved', entityId: change.id },
        }),
      ).toBe(1);
    });

    it('aprueba en masa con un mismo lote', async () => {
      const variants = await Promise.all([createVariant(), createVariant(), createVariant()]);
      const changes: Change[] = [];
      for (const [index, variant] of variants.entries()) {
        changes.push(await request(variant.id, String(100 + index)));
      }
      const res = await call('POST', `${BASE}/changes/approve`, admin.cookie, {
        ids: changes.map((change) => change.id),
      });
      expect(res.statusCode).toBe(200);
      const rows = res.json().data as Change[];
      expect(new Set(rows.map((row) => row.batchId)).size).toBe(1);
      for (const [index, variant] of variants.entries()) {
        expect(await priceOf(variant.id)).toBe(`${100 + index}.00`);
      }
      const count = await call('GET', `${BASE}/pending-count`, admin.cookie);
      expect(count.json().data.count).toBe(0);
    });

    it('la aprobación en masa es atómica: si un elemento falla no se aplica ninguno', async () => {
      const a = await createVariant({ salePrice: '10' });
      const b = await createVariant({ salePrice: '10' });
      const changeA = await request(a.id, '50');
      const changeB = await request(b.id, '60');
      // El precio de B cambia por otro camino después de la solicitud: su solicitud queda obsoleta.
      await app.prisma.productVariant.update({ where: { id: b.id }, data: { salePrice: '15' } });

      const res = await call('POST', `${BASE}/changes/approve`, admin.cookie, {
        ids: [changeA.id, changeB.id],
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.details.ids).toEqual([changeB.id]);
      expect(await priceOf(a.id)).toBe('10.00');
      expect(await priceOf(b.id)).toBe('15.00');
      const statuses = await app.prisma.priceChange.findMany({ orderBy: { id: 'asc' } });
      expect(statuses.every((row) => row.status === 'PENDING')).toBe(true);
      expect(await app.prisma.auditLog.count({ where: { action: 'variant.price_changed' } })).toBe(
        0,
      );
    });

    it('conflicto por precio anterior desactualizado tras un cambio aprobado en medio', async () => {
      const variant = await createVariant({ salePrice: '10' });
      const request1 = await request(variant.id, '20');
      // Un cambio directo del Administrador es imposible con pendiente: se cancela la pendiente,
      // se aplica el directo y se fuerza la reaparición de una solicitud obsoleta por SQL.
      await call('POST', `${BASE}/changes/${request1.id}/cancel`, manager.cookie);
      const direct = await call('POST', `${BASE}/apply`, admin.cookie, {
        items: [{ variantId: variant.id, newPrice: '30' }],
      });
      expect(direct.statusCode).toBe(201);
      await app.prisma.$executeRaw`
        INSERT INTO price_changes (id, variant_id, previous_price, new_price, origin, requested_by_id, cost_snapshot)
        VALUES (${UNKNOWN_ID}::uuid, ${variant.id}::uuid, 10, 40, 'REQUEST', ${manager.id}::uuid, 0)`;
      const res = await call('POST', `${BASE}/changes/approve`, admin.cookie, {
        ids: [UNKNOWN_ID],
      });
      expect(res.statusCode).toBe(409);
      expect(await priceOf(variant.id)).toBe('30.00');
    });

    it('rechaza ids inexistentes (404) y solicitudes ya resueltas (422)', async () => {
      const variant = await createVariant();
      const change = await request(variant.id, '10');
      expect(
        (await call('POST', `${BASE}/changes/approve`, admin.cookie, { ids: [UNKNOWN_ID] }))
          .statusCode,
      ).toBe(404);
      await call('POST', `${BASE}/changes/approve`, admin.cookie, { ids: [change.id] });
      expect(
        (await call('POST', `${BASE}/changes/approve`, admin.cookie, { ids: [change.id] }))
          .statusCode,
      ).toBe(422);
    });
  });

  describe('rechazo', () => {
    it('exige comentario; rechaza en masa; el precio no cambia', async () => {
      const a = await createVariant({ salePrice: '10' });
      const b = await createVariant({ salePrice: '10' });
      const changes = [await request(a.id, '30'), await request(b.id, '40')];
      const ids = changes.map((change) => change.id);

      const noComment = await call('POST', `${BASE}/changes/reject`, admin.cookie, { ids });
      expect(noComment.statusCode).toBe(400);

      const res = await call('POST', `${BASE}/changes/reject`, admin.cookie, {
        ids,
        comment: 'Precio demasiado alto',
      });
      expect(res.statusCode, res.body).toBe(200);
      for (const row of res.json().data as Change[]) {
        expect(row).toMatchObject({
          status: 'REJECTED',
          decisionComment: 'Precio demasiado alto',
          decidedBy: { id: admin.id },
        });
      }
      expect(await priceOf(a.id)).toBe('10.00');
      expect(await priceOf(b.id)).toBe('10.00');
      expect(await app.prisma.auditLog.count({ where: { action: 'price.rejected' } })).toBe(2);
      // Una rechazada libera la variante: se puede solicitar de nuevo.
      await request(a.id, '35');
    });

    it('el rechazo en masa también es atómico', async () => {
      const a = await createVariant();
      const change = await request(a.id, '10');
      const res = await call('POST', `${BASE}/changes/reject`, admin.cookie, {
        ids: [change.id, UNKNOWN_ID],
        comment: 'No procede',
      });
      expect(res.statusCode).toBe(404);
      expect(
        (await app.prisma.priceChange.findUniqueOrThrow({ where: { id: change.id } })).status,
      ).toBe('PENDING');
    });
  });

  describe('cambio directo del Administrador (ADMIN_DIRECT)', () => {
    it('aplica de inmediato, queda aprobado por él mismo y audita', async () => {
      const a = await createVariant({ salePrice: '10', costPrice: '4.5000' });
      const b = await createVariant({ salePrice: '0', costPrice: '0' });
      const res = await call('POST', `${BASE}/apply`, admin.cookie, {
        items: [
          { variantId: a.id, newPrice: '19.9' },
          { variantId: b.id, newPrice: '50' },
        ],
        reason: 'Ajuste de temporada',
      });
      expect(res.statusCode, res.body).toBe(201);
      const rows = res.json().data as Change[];
      for (const row of rows) {
        expect(row).toMatchObject({
          status: 'APPROVED',
          origin: 'ADMIN_DIRECT',
          requestedBy: { id: admin.id },
          decidedBy: { id: admin.id },
        });
      }
      expect(rows[0]?.costSnapshot).toBe('4.5000');
      expect(await priceOf(a.id)).toBe('19.90');
      expect(await priceOf(b.id)).toBe('50.00');
      expect(await app.prisma.auditLog.count({ where: { action: 'variant.price_changed' } })).toBe(
        2,
      );
    });

    it('es atómico y no pisa una solicitud pendiente de otra persona', async () => {
      const a = await createVariant({ salePrice: '10' });
      const b = await createVariant({ salePrice: '10' });
      await request(b.id, '77');
      const res = await call('POST', `${BASE}/apply`, admin.cookie, {
        items: [
          { variantId: a.id, newPrice: '20' },
          { variantId: b.id, newPrice: '30' },
        ],
      });
      expect(res.statusCode).toBe(409);
      expect(await priceOf(a.id)).toBe('10.00');
      expect(await priceOf(b.id)).toBe('10.00');
    });
  });

  describe('historial', () => {
    it('lista por variante y global, con costos solo para quien tiene costs:read', async () => {
      const variant = await createVariant({ salePrice: '10', costPrice: '4.0000' });
      const first = await request(variant.id, '20');
      await call('POST', `${BASE}/changes/approve`, admin.cookie, { ids: [first.id] });
      await call('POST', `${BASE}/apply`, admin.cookie, {
        items: [{ variantId: variant.id, newPrice: '25' }],
      });

      const byVariant = await call('GET', `${BASE}/variants/${variant.id}/history`, manager.cookie);
      expect(byVariant.statusCode).toBe(200);
      const rows = byVariant.json().data as Change[];
      expect(rows.map((row) => [row.previousPrice, row.newPrice, row.origin])).toEqual([
        ['20.00', '25.00', 'ADMIN_DIRECT'],
        ['10.00', '20.00', 'REQUEST'],
      ]);
      expect(rows[0]?.costSnapshot).toBe('4.0000');

      const global = await call('GET', `${BASE}/changes?status=APPROVED&pageSize=1`, admin.cookie);
      expect(global.json().meta).toEqual({ page: 1, pageSize: 1, total: 2 });

      const noCosts = await session([PERMISSIONS.PRICES_PROPOSE]);
      const hidden = await call('GET', `${BASE}/variants/${variant.id}/history`, noCosts.cookie);
      expect(hidden.statusCode).toBe(200);
      expect((hidden.json().data as Change[]).every((row) => row.costSnapshot === null)).toBe(true);

      expect(
        (await call('GET', `${BASE}/variants/${UNKNOWN_ID}/history`, admin.cookie)).statusCode,
      ).toBe(404);
    });

    it('el historial es inmutable en la base de datos (trigger)', async () => {
      const variant = await createVariant({ salePrice: '10' });
      const change = await request(variant.id, '20');
      await call('POST', `${BASE}/changes/approve`, admin.cookie, { ids: [change.id] });

      await expect(
        app.prisma.priceChange.update({ where: { id: change.id }, data: { newPrice: '999' } }),
      ).rejects.toThrow(/ya fue resuelto/i);
      await expect(
        app.prisma.priceChange.update({
          where: { id: change.id },
          data: { status: 'REJECTED', decisionComment: 'x yz' },
        }),
      ).rejects.toThrow();
      await expect(app.prisma.priceChange.delete({ where: { id: change.id } })).rejects.toThrow();

      // Una pendiente solo puede resolverse: no se editan sus datos.
      const pending = await request((await createVariant({ salePrice: '5' })).id, '6');
      await expect(
        app.prisma.priceChange.update({ where: { id: pending.id }, data: { newPrice: '7' } }),
      ).rejects.toThrow(/solo puede resolverse/i);
      await expect(app.prisma.priceChange.delete({ where: { id: pending.id } })).rejects.toThrow();
    });

    it('la base impone las reglas: precio igual, rechazo sin comentario y pendientes duplicadas', async () => {
      const variant = await createVariant({ salePrice: '10' });
      await expect(
        app.prisma.priceChange.create({
          data: {
            variantId: variant.id,
            previousPrice: '10',
            newPrice: '10',
            origin: 'REQUEST',
            requestedById: manager.id,
            costSnapshot: '0',
          },
        }),
      ).rejects.toThrow();
      await request(variant.id, '11');
      await expect(
        app.prisma.priceChange.create({
          data: {
            variantId: variant.id,
            previousPrice: '10',
            newPrice: '12',
            origin: 'REQUEST',
            requestedById: manager.id,
            costSnapshot: '0',
          },
        }),
      ).rejects.toThrow();
      await expect(
        app.prisma.priceChange.create({
          data: {
            variantId: variant.id,
            previousPrice: '10',
            newPrice: '13',
            status: 'REJECTED',
            origin: 'REQUEST',
            requestedById: manager.id,
            decidedById: admin.id,
            decidedAt: new Date(),
            costSnapshot: '0',
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('ningún otro camino cambia sale_price', () => {
    async function createProduct(cookie: string, payload: Record<string, unknown>) {
      const category = await app.prisma.category.create({
        data: { name: `C-${Math.random()}`, slug: `c-${Math.random()}` },
      });
      return app.inject({
        method: 'POST',
        url: '/api/v1/products',
        headers: { cookie },
        payload: { categoryId: category.id, name: 'Anillo', ...payload },
      });
    }

    it('PATCH de producto no acepta salePrice (400) y el precio no cambia', async () => {
      const variant = await createVariant({ salePrice: '10' });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/products/${variant.productId}`,
        headers: { cookie: admin.cookie },
        payload: { name: 'Nuevo nombre', salePrice: '999' },
      });
      expect(res.statusCode).toBe(400);
      expect(await priceOf(variant.id)).toBe('10.00');
      const ok = await app.inject({
        method: 'PATCH',
        url: `/api/v1/products/${variant.productId}`,
        headers: { cookie: admin.cookie },
        payload: { name: 'Nuevo nombre' },
      });
      expect(ok.statusCode).toBe(200);
      expect(await priceOf(variant.id)).toBe('10.00');
    });

    it('el Responsable no fija precio inicial al crear (403); sin precio sí puede crear', async () => {
      const denied = await createProduct(manager.cookie, { salePrice: '80' });
      expect(denied.statusCode).toBe(403);
      expect(await app.prisma.product.count()).toBe(0);
      const free = await createProduct(manager.cookie, { salePrice: '0' });
      expect(free.statusCode).toBe(201);
      expect(free.json().data.variants[0].salePrice).toBe('0.00');
      expect(await app.prisma.priceChange.count()).toBe(0);
    });

    it('el Administrador fija el precio inicial al crear: queda como INITIAL en el historial', async () => {
      const res = await createProduct(admin.cookie, { salePrice: '150.5' });
      expect(res.statusCode, res.body).toBe(201);
      const variantId = res.json().data.variants[0].id as string;
      const history = await call('GET', `${BASE}/variants/${variantId}/history`, admin.cookie);
      expect(history.json().data).toHaveLength(1);
      expect(history.json().data[0]).toMatchObject({
        origin: 'INITIAL',
        status: 'APPROVED',
        previousPrice: '0.00',
        newPrice: '150.50',
        requestedBy: { id: admin.id },
        decidedBy: { id: admin.id },
      });
      expect(
        await app.prisma.auditLog.count({
          where: { action: 'variant.price_changed', entityId: variantId },
        }),
      ).toBe(1);
    });

    it('una variante nueva con precio también exige prices:approve y se registra como INITIAL', async () => {
      const attribute = await app.prisma.attribute.create({
        data: { code: 'talla', name: 'Talla', dataType: 'OPTION' },
      });
      const options = await Promise.all(
        ['16', '17'].map((value) =>
          app.prisma.attributeOption.create({ data: { attributeId: attribute.id, value } }),
        ),
      );
      const created = await createProduct(admin.cookie, {});
      const productId = created.json().data.id as string;
      const axes = await app.inject({
        method: 'POST',
        url: `/api/v1/products/${productId}/axes`,
        headers: { cookie: admin.cookie },
        payload: { axes: [{ attributeId: attribute.id, optionId: options[0]?.id }] },
      });
      expect(axes.statusCode, axes.body).toBe(200);
      const addVariant = (cookie: string, salePrice?: string) =>
        app.inject({
          method: 'POST',
          url: `/api/v1/products/${productId}/variants`,
          headers: { cookie },
          payload: {
            values: [{ attributeId: attribute.id, optionId: options[1]?.id }],
            ...(salePrice !== undefined && { salePrice }),
          },
        });
      expect((await addVariant(manager.cookie, '90')).statusCode).toBe(403);
      const ok = await addVariant(admin.cookie, '90');
      expect(ok.statusCode, ok.body).toBe(201);
      const initial = await app.prisma.priceChange.findMany({ where: { origin: 'INITIAL' } });
      expect(initial).toHaveLength(1);
      expect(initial[0]?.newPrice.toFixed(2)).toBe('90.00');
    });
  });
});
