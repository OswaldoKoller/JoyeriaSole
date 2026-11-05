import { PERMISSIONS, type Permission } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase, seedAdjustmentReasons } from '../helpers/db.ts';

const URL = '/api/v1/inventory/adjustments';

const REQUESTER: Permission[] = [
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.INVENTORY_ADJUST,
  PERMISSIONS.CATALOG_READ,
];
const APPROVER: Permission[] = [
  ...REQUESTER,
  PERMISSIONS.INVENTORY_ADJUST_APPROVE,
  PERMISSIONS.COSTS_READ,
];
const SELLER: Permission[] = [PERMISSIONS.INVENTORY_READ, PERMISSIONS.CATALOG_READ];

interface Item {
  quantityDelta: number;
  variantId: string;
}

describe('ajustes manuales con solicitud y aprobación', () => {
  let app: App;
  let reasons: Map<string, string>;
  let requester: { cookie: string; id: string };
  let approver: { cookie: string; id: string };
  let seller: { cookie: string; id: string };

  async function sessionFor(permissions: Permission[]) {
    const created = await createTestUser(app.prisma, { permissions });
    const { cookie } = await login(app, created.user.email, created.password);
    return { cookie, id: created.user.id };
  }

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
    reasons = await seedAdjustmentReasons(app.prisma);
    requester = await sessionFor(REQUESTER);
    approver = await sessionFor(APPROVER);
    seller = await sessionFor(SELLER);
  });
  afterEach(() => app.close());

  let counter = 0;
  /** Variante activa con `stock` piezas cargadas como stock inicial (movimiento real). */
  async function createVariant(stock = 0, options: { costPrice?: string; active?: boolean } = {}) {
    counter += 1;
    const category = await app.prisma.category.create({
      data: { name: `Cat ${counter}`, slug: `cat-${counter}-${Date.now()}` },
    });
    const product = await app.prisma.product.create({
      data: { categoryId: category.id, name: `Producto ${counter}` },
    });
    const variant = await app.prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `ADJ-${counter}-${Date.now()}`,
        costPrice: options.costPrice ?? '0',
        status: options.active === false ? 'INACTIVE' : 'ACTIVE',
      },
    });
    if (stock > 0) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/inventory/${variant.id}/initial`,
        headers: { cookie: approver.cookie },
        payload: { quantity: stock, reason: 'Carga inicial de prueba' },
      });
      expect(res.statusCode).toBe(201);
    }
    return variant;
  }

  function request(items: Item[], extra: Record<string, unknown> = {}, cookie = requester.cookie) {
    return app.inject({
      method: 'POST',
      url: URL,
      headers: { cookie },
      payload: { reasonId: reasons.get('LOSS'), items, ...extra },
    });
  }

  async function requestOk(items: Item[], extra: Record<string, unknown> = {}) {
    const res = await request(items, extra);
    expect(res.statusCode).toBe(201);
    return res.json().data as { id: string; number: number; status: string };
  }

  const post = (path: string, cookie: string, payload?: object) =>
    app.inject({ method: 'POST', url: `${URL}${path}`, headers: { cookie }, payload });
  const approve = (id: string, cookie = approver.cookie) => post(`/${id}/approve`, cookie);
  const balanceOf = async (variantId: string) =>
    (await app.prisma.inventoryBalance.findUnique({ where: { variantId } }))?.quantity ?? 0;

  describe('permisos', () => {
    it('401 sin sesión en todos los endpoints', async () => {
      const id = '01900000-0000-7000-8000-000000000000';
      for (const [method, path] of [
        ['GET', ''],
        ['GET', '/reasons'],
        ['GET', '/pending-count'],
        ['GET', `/${id}`],
        ['POST', ''],
        ['POST', `/${id}/cancel`],
        ['POST', `/${id}/approve`],
        ['POST', `/${id}/reject`],
      ] as const) {
        const res = await app.inject({ method, url: `${URL}${path}`, payload: {} });
        expect(res.statusCode, `${method} ${path}`).toBe(401);
      }
    });

    it('el vendedor no ve ni solicita nada (403), aunque tenga inventory:read', async () => {
      const variant = await createVariant(5);
      for (const path of ['', '/reasons']) {
        const res = await app.inject({
          method: 'GET',
          url: `${URL}${path}`,
          headers: { cookie: seller.cookie },
        });
        expect(res.statusCode).toBe(403);
      }
      const res = await request([{ variantId: variant.id, quantityDelta: -1 }], {}, seller.cookie);
      expect(res.statusCode).toBe(403);
      expect(await app.prisma.inventoryAdjustment.count()).toBe(0);
    });

    it('quien solo solicita no puede aprobar, rechazar ni ver el contador (403)', async () => {
      const variant = await createVariant(5);
      const adjustment = await requestOk([{ variantId: variant.id, quantityDelta: -2 }]);

      expect((await approve(adjustment.id, requester.cookie)).statusCode).toBe(403);
      expect(
        (await post(`/${adjustment.id}/reject`, requester.cookie, { notes: 'x' })).statusCode,
      ).toBe(403);
      const count = await app.inject({
        method: 'GET',
        url: `${URL}/pending-count`,
        headers: { cookie: requester.cookie },
      });
      expect(count.statusCode).toBe(403);

      expect(await balanceOf(variant.id)).toBe(5);
      const stored = await app.prisma.inventoryAdjustment.findUniqueOrThrow({
        where: { id: adjustment.id },
      });
      expect(stored.status).toBe('PENDING');
    });
  });

  describe('solicitud', () => {
    it('valida la entrada: 400', async () => {
      const variant = await createVariant(5);
      const loss = reasons.get('LOSS');
      const bad = [
        { reasonId: loss, items: [] },
        { reasonId: loss, items: [{ variantId: variant.id, quantityDelta: 0 }] },
        { reasonId: loss, items: [{ variantId: variant.id, quantityDelta: 1.5 }] },
        {
          reasonId: loss,
          items: [
            { variantId: variant.id, quantityDelta: -1 },
            { variantId: variant.id, quantityDelta: -2 },
          ],
        },
        { reasonId: 'no-es-uuid', items: [{ variantId: variant.id, quantityDelta: -1 }] },
        { items: [{ variantId: variant.id, quantityDelta: -1 }] },
      ];
      for (const payload of bad) {
        const res = await app.inject({
          method: 'POST',
          url: URL,
          headers: { cookie: requester.cookie },
          payload,
        });
        expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      }
      expect(
        (await post('/01900000-0000-7000-8000-000000000000/reject', approver.cookie, {}))
          .statusCode,
      ).toBe(400);
    });

    it('crea el ajuste pendiente SIN tocar el stock y deja auditoría', async () => {
      const variant = await createVariant(5);
      const movementsBefore = await app.prisma.inventoryMovement.count();
      const res = await request([{ variantId: variant.id, quantityDelta: -2 }], {
        notes: 'Se cayó de la vitrina',
      });
      expect(res.statusCode).toBe(201);
      const body = res.json().data;
      expect(body).toMatchObject({
        number: 1,
        status: 'PENDING',
        reasonName: 'Pérdida',
        notes: 'Se cayó de la vitrina',
        requestedById: requester.id,
        itemsCount: 1,
        netUnits: -2,
        resolvedAt: null,
      });
      expect(body.items[0]).toMatchObject({
        quantityDelta: -2,
        quantityAtRequest: 5,
        currentQuantity: 5,
        balanceBefore: null,
        balanceAfter: null,
      });

      expect(await balanceOf(variant.id)).toBe(5);
      expect(await app.prisma.inventoryMovement.count()).toBe(movementsBefore);

      const audit = await app.prisma.auditLog.findFirst({
        where: { action: 'inventory_adjustment.requested', entityId: body.id },
      });
      expect(audit?.userId).toBe(requester.id);
    });

    it('oculta costos y valores a quien no tiene costs:read y los muestra a quien sí', async () => {
      const variant = await createVariant(10, { costPrice: '12.5000' });
      const { id } = await requestOk([{ variantId: variant.id, quantityDelta: -2 }]);

      const hidden = await app.inject({
        method: 'GET',
        url: `${URL}/${id}`,
        headers: { cookie: requester.cookie },
      });
      expect(hidden.json().data.valueImpact).toBeNull();
      expect(hidden.json().data.items[0]).toMatchObject({ unitCost: null, valueImpact: null });
      const hiddenList = await app.inject({
        method: 'GET',
        url: URL,
        headers: { cookie: requester.cookie },
      });
      expect(hiddenList.json().data[0].valueImpact).toBeNull();
      expect(JSON.stringify(hidden.json())).not.toContain('12.5');

      const shown = await app.inject({
        method: 'GET',
        url: `${URL}/${id}`,
        headers: { cookie: approver.cookie },
      });
      expect(shown.json().data.valueImpact).toBe('-25.00');
      expect(shown.json().data.items[0]).toMatchObject({
        unitCost: '12.5000',
        valueImpact: '-25.00',
      });
    });

    it('el motivo «Otro» exige observación; los demás no', async () => {
      const variant = await createVariant(5);
      const items = [{ variantId: variant.id, quantityDelta: -1 }];
      const other = reasons.get('OTHER');
      expect((await request(items, { reasonId: other })).statusCode).toBe(422);
      expect((await request(items, { reasonId: other, notes: '   ' })).statusCode).toBe(422);
      expect(
        (await request(items, { reasonId: other, notes: 'Regalo autorizado' })).statusCode,
      ).toBe(201);
      expect((await request(items)).statusCode).toBe(201);
    });

    it('rechaza motivos inexistentes o inactivos, variantes inexistentes o inactivas', async () => {
      const variant = await createVariant(5);
      const inactive = await createVariant(0, { active: false });
      const missing = '01900000-0000-7000-8000-000000000000';
      expect(
        (await request([{ variantId: variant.id, quantityDelta: -1 }], { reasonId: missing }))
          .statusCode,
      ).toBe(404);
      expect((await request([{ variantId: missing, quantityDelta: 1 }])).statusCode).toBe(404);
      expect((await request([{ variantId: inactive.id, quantityDelta: 1 }])).statusCode).toBe(422);

      await app.prisma.adjustmentReason.update({
        where: { id: reasons.get('LOSS') ?? '' },
        data: { isActive: false },
      });
      expect((await request([{ variantId: variant.id, quantityDelta: -1 }])).statusCode).toBe(404);
      expect(await app.prisma.inventoryAdjustment.count()).toBe(0);
    });

    it('al solicitar valida que el saldo no quede negativo', async () => {
      const variant = await createVariant(2);
      const res = await request([{ variantId: variant.id, quantityDelta: -3 }]);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('BUSINESS_RULE_VIOLATION');
      expect(await app.prisma.inventoryAdjustment.count()).toBe(0);

      // Salida exacta del saldo (ajustar a cero) y entradas sí se permiten.
      expect((await request([{ variantId: variant.id, quantityDelta: -2 }])).statusCode).toBe(201);
      expect((await request([{ variantId: variant.id, quantityDelta: 4 }])).statusCode).toBe(201);
    });

    it('lista los motivos activos del catálogo', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `${URL}/reasons`,
        headers: { cookie: requester.cookie },
      });
      expect(res.statusCode).toBe(200);
      const names = (res.json().data as { name: string }[]).map((reason) => reason.name);
      expect(names).toEqual(['Robo', 'Pérdida', 'Muestra', 'Rotura', 'Error de registro', 'Otro']);
      expect(
        (res.json().data as { code: string; requiresNotes: boolean }[]).filter(
          (reason) => reason.requiresNotes,
        ),
      ).toEqual([expect.objectContaining({ code: 'OTHER' })]);
    });
  });

  describe('aprobación', () => {
    it('aprueba: movimiento ADJUSTMENT + saldo + estado + auditoría, de forma atómica', async () => {
      const first = await createVariant(5, { costPrice: '4.0000' });
      const second = await createVariant(1);
      const { id, number } = await requestOk(
        [
          { variantId: first.id, quantityDelta: -3 },
          { variantId: second.id, quantityDelta: 4 },
        ],
        { notes: 'Conteo de estante' },
      );
      const movementsBefore = await app.prisma.inventoryMovement.count();

      const res = await approve(id);
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body).toMatchObject({
        status: 'APPROVED',
        requestedById: requester.id,
        resolvedByName: expect.any(String),
        blockers: [],
      });
      expect(body.resolvedAt).not.toBeNull();
      const byVariant = new Map(
        (body.items as { variantId: string }[]).map((item) => [item.variantId, item]),
      );
      expect(byVariant.get(first.id)).toMatchObject({
        quantityDelta: -3,
        balanceBefore: 5,
        balanceAfter: 2,
        currentQuantity: null,
        unitCost: '4.0000',
        valueImpact: '-12.00',
      });
      expect(byVariant.get(second.id)).toMatchObject({ balanceBefore: 1, balanceAfter: 5 });

      expect(await balanceOf(first.id)).toBe(2);
      expect(await balanceOf(second.id)).toBe(5);
      expect(await app.prisma.inventoryMovement.count()).toBe(movementsBefore + 2);

      const movement = await app.prisma.inventoryMovement.findFirstOrThrow({
        where: { variantId: first.id, type: 'ADJUSTMENT' },
      });
      expect(movement).toMatchObject({
        quantity: -3,
        balanceBefore: 5,
        balanceAfter: 2,
        referenceType: 'INVENTORY_ADJUSTMENT',
        referenceId: id,
        userId: approver.id, // el movimiento lo registra quien aprueba; el solicitante queda en el documento
        notes: 'Conteo de estante',
      });
      expect(movement.reason).toContain(`AJ-${String(number).padStart(6, '0')}`);
      expect(movement.unitCost?.toFixed(4)).toBe('4.0000');

      const item = await app.prisma.inventoryAdjustmentItem.findFirstOrThrow({
        where: { adjustmentId: id, variantId: first.id },
      });
      expect(item.movementId).toBe(movement.id);

      const audit = await app.prisma.auditLog.findFirst({
        where: { action: 'inventory_adjustment.approved', entityId: id },
      });
      expect(audit?.userId).toBe(approver.id);
      expect(JSON.stringify(audit?.after)).toContain('"balanceAfter":2');
    });

    it('permite ajustar a cero y las entradas; el historial por variante muestra el movimiento', async () => {
      const variant = await createVariant(6);
      const { id } = await requestOk([{ variantId: variant.id, quantityDelta: -6 }]);
      expect((await approve(id)).statusCode).toBe(200);
      expect(await balanceOf(variant.id)).toBe(0);

      const history = await app.inject({
        method: 'GET',
        url: `/api/v1/inventory/${variant.id}/movements`,
        headers: { cookie: requester.cookie },
      });
      expect(history.json().data[0]).toMatchObject({
        type: 'ADJUSTMENT',
        quantity: -6,
        balanceBefore: 6,
        balanceAfter: 0,
      });
    });

    it('el Administrador puede aprobar sus propios ajustes', async () => {
      const variant = await createVariant(4);
      const mine = await request(
        [{ variantId: variant.id, quantityDelta: -1 }],
        {},
        approver.cookie,
      );
      expect(mine.statusCode).toBe(201);
      expect((await approve(mine.json().data.id)).statusCode).toBe(200);
      expect(await balanceOf(variant.id)).toBe(3);
    });

    it('una doble aprobación se rechaza y no duplica el movimiento', async () => {
      const variant = await createVariant(5);
      const { id } = await requestOk([{ variantId: variant.id, quantityDelta: -2 }]);
      expect((await approve(id)).statusCode).toBe(200);
      const again = await approve(id);
      expect(again.statusCode).toBe(422);
      expect(await balanceOf(variant.id)).toBe(3);
      expect(await app.prisma.inventoryMovement.count({ where: { type: 'ADJUSTMENT' } })).toBe(1);
    });

    it('al aprobar vuelve a validar con el saldo vigente: si ya no alcanza, rechaza y sigue pendiente', async () => {
      const variant = await createVariant(5);
      const first = await requestOk([{ variantId: variant.id, quantityDelta: -3 }]);
      const second = await requestOk([{ variantId: variant.id, quantityDelta: -4 }]);

      // Ambas eran válidas al solicitar (saldo 5). Al aprobar la segunda, el saldo ya es 2.
      expect((await approve(second.id)).statusCode).toBe(200);
      expect(await balanceOf(variant.id)).toBe(1);

      const blocked = await approve(first.id);
      expect(blocked.statusCode).toBe(422);
      expect(blocked.json().error.code).toBe('BUSINESS_RULE_VIOLATION');
      expect(await balanceOf(variant.id)).toBe(1);
      const stored = await app.prisma.inventoryAdjustment.findUniqueOrThrow({
        where: { id: first.id },
      });
      expect(stored.status).toBe('PENDING');

      // El detalle explica por qué hoy no se puede aprobar.
      const detail = await app.inject({
        method: 'GET',
        url: `${URL}/${first.id}`,
        headers: { cookie: approver.cookie },
      });
      expect(detail.json().data.blockers).toHaveLength(1);
      expect(detail.json().data.items[0].currentQuantity).toBe(1);
    });

    it('si una línea falla, se revierte todo el ajuste (atomicidad)', async () => {
      const ok = await createVariant(5);
      const short = await createVariant(3);
      const { id } = await requestOk([
        { variantId: ok.id, quantityDelta: -2 },
        { variantId: short.id, quantityDelta: -3 },
      ]);
      // Entre la solicitud y la aprobación, otra salida deja la segunda variante sin saldo suficiente.
      const other = await requestOk([{ variantId: short.id, quantityDelta: -2 }]);
      expect((await approve(other.id)).statusCode).toBe(200);

      const movementsBefore = await app.prisma.inventoryMovement.count();
      expect((await approve(id)).statusCode).toBe(422);
      expect(await balanceOf(ok.id)).toBe(5); // la primera línea NO quedó aplicada
      expect(await balanceOf(short.id)).toBe(1);
      expect(await app.prisma.inventoryMovement.count()).toBe(movementsBefore);
      const lines = await app.prisma.inventoryAdjustmentItem.findMany({
        where: { adjustmentId: id },
      });
      expect(lines.every((line) => line.movementId === null && line.balanceAfter === null)).toBe(
        true,
      );
    });

    it('no aprueba si la variante se desactivó entre la solicitud y la aprobación', async () => {
      const variant = await createVariant(5);
      const { id } = await requestOk([{ variantId: variant.id, quantityDelta: -1 }]);
      await app.prisma.productVariant.update({
        where: { id: variant.id },
        data: { status: 'INACTIVE' },
      });
      expect((await approve(id)).statusCode).toBe(422);
      expect(await balanceOf(variant.id)).toBe(5);
    });

    it('concurrencia: dos aprobaciones simultáneas contra el mismo saldo no dejan stock negativo', async () => {
      const variant = await createVariant(5);
      const a = await requestOk([{ variantId: variant.id, quantityDelta: -3 }]);
      const b = await requestOk([{ variantId: variant.id, quantityDelta: -3 }]);

      const results = await Promise.all([approve(a.id), approve(b.id)]);
      expect(results.map((res) => res.statusCode).sort()).toEqual([200, 422]);
      expect(await balanceOf(variant.id)).toBe(2);
      expect(await app.prisma.inventoryMovement.count({ where: { type: 'ADJUSTMENT' } })).toBe(1);
    });

    it('concurrencia: aprobar dos veces el MISMO ajuste a la vez solo aplica una', async () => {
      const variant = await createVariant(9);
      const { id } = await requestOk([{ variantId: variant.id, quantityDelta: -4 }]);
      const results = await Promise.all([approve(id), approve(id), approve(id)]);
      expect(results.map((res) => res.statusCode).sort()).toEqual([200, 422, 422]);
      expect(await balanceOf(variant.id)).toBe(5);
      expect(await app.prisma.inventoryMovement.count({ where: { type: 'ADJUSTMENT' } })).toBe(1);
    });

    it('concurrencia: ajustes con las mismas variantes en distinto orden no se interbloquean', async () => {
      const x = await createVariant(10);
      const y = await createVariant(10);
      const a = await requestOk([
        { variantId: x.id, quantityDelta: -1 },
        { variantId: y.id, quantityDelta: -1 },
      ]);
      const b = await requestOk([
        { variantId: y.id, quantityDelta: -1 },
        { variantId: x.id, quantityDelta: -1 },
      ]);
      const results = await Promise.all([approve(a.id), approve(b.id)]);
      expect(results.map((res) => res.statusCode)).toEqual([200, 200]);
      expect(await balanceOf(x.id)).toBe(8);
      expect(await balanceOf(y.id)).toBe(8);
    });
  });

  describe('rechazo y cancelación', () => {
    it('rechazar exige comentario y no cambia el stock', async () => {
      const variant = await createVariant(5);
      const { id } = await requestOk([{ variantId: variant.id, quantityDelta: -2 }]);
      expect((await post(`/${id}/reject`, approver.cookie, { notes: '   ' })).statusCode).toBe(400);

      const res = await post(`/${id}/reject`, approver.cookie, {
        notes: 'Primero verifique el estante',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({
        status: 'REJECTED',
        resolutionNotes: 'Primero verifique el estante',
        resolvedByName: expect.any(String),
      });
      expect(await balanceOf(variant.id)).toBe(5);
      expect(await app.prisma.inventoryMovement.count({ where: { type: 'ADJUSTMENT' } })).toBe(0);
      const audit = await app.prisma.auditLog.findFirst({
        where: { action: 'inventory_adjustment.rejected', entityId: id },
      });
      expect(audit?.userId).toBe(approver.id);

      // Ya resuelto: no se puede aprobar, rechazar ni cancelar.
      expect((await approve(id)).statusCode).toBe(422);
      expect((await post(`/${id}/reject`, approver.cookie, { notes: 'otra vez' })).statusCode).toBe(
        422,
      );
      expect((await post(`/${id}/cancel`, requester.cookie)).statusCode).toBe(422);
    });

    it('quien solicitó puede cancelar mientras esté pendiente; otro usuario no', async () => {
      const variant = await createVariant(5);
      const { id } = await requestOk([{ variantId: variant.id, quantityDelta: -2 }]);

      expect((await post(`/${id}/cancel`, approver.cookie)).statusCode).toBe(403);
      const res = await post(`/${id}/cancel`, requester.cookie);
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe('CANCELLED');
      expect(await balanceOf(variant.id)).toBe(5);

      expect((await approve(id)).statusCode).toBe(422);
      expect((await post(`/${id}/cancel`, requester.cookie)).statusCode).toBe(422);
      expect(
        await app.prisma.auditLog.count({
          where: { action: 'inventory_adjustment.cancelled', entityId: id },
        }),
      ).toBe(1);
    });

    it('un ajuste aprobado no se puede cancelar ni rechazar', async () => {
      const variant = await createVariant(5);
      const { id } = await requestOk([{ variantId: variant.id, quantityDelta: -2 }]);
      await approve(id);
      expect((await post(`/${id}/cancel`, requester.cookie)).statusCode).toBe(422);
      expect((await post(`/${id}/reject`, approver.cookie, { notes: 'tarde' })).statusCode).toBe(
        422,
      );
      expect(await balanceOf(variant.id)).toBe(3);
    });

    it('404 para un ajuste inexistente', async () => {
      const missing = '01900000-0000-7000-8000-000000000000';
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `${URL}/${missing}`,
            headers: { cookie: requester.cookie },
          })
        ).statusCode,
      ).toBe(404);
      expect((await approve(missing)).statusCode).toBe(404);
      expect((await post(`/${missing}/cancel`, requester.cookie)).statusCode).toBe(404);
    });
  });

  describe('listado y contador', () => {
    it('filtra por estado, variante y fechas; pagina; y cuenta los pendientes', async () => {
      const v1 = await createVariant(10);
      const v2 = await createVariant(10);
      const a = await requestOk([{ variantId: v1.id, quantityDelta: -1 }]);
      const b = await requestOk([{ variantId: v2.id, quantityDelta: 2 }]);
      const c = await requestOk([{ variantId: v1.id, quantityDelta: -2 }]);
      await approve(a.id);
      await post(`/${c.id}/reject`, approver.cookie, { notes: 'No procede' });

      const ids = async (query: string) => {
        const res = await app.inject({
          method: 'GET',
          url: `${URL}${query}`,
          headers: { cookie: requester.cookie },
        });
        expect(res.statusCode).toBe(200);
        return (res.json().data as { id: string }[]).map((row) => row.id);
      };
      expect(await ids('')).toEqual([c.id, b.id, a.id]); // más reciente primero
      expect(await ids('?status=PENDING')).toEqual([b.id]);
      expect(await ids('?status=APPROVED')).toEqual([a.id]);
      expect(await ids('?status=REJECTED')).toEqual([c.id]);
      expect(await ids('?status=CANCELLED')).toEqual([]);
      expect(await ids(`?variantId=${v2.id}`)).toEqual([b.id]);
      expect(await ids(`?variantId=${v1.id}`)).toEqual([c.id, a.id]);

      const today = new Date().toISOString().slice(0, 10);
      expect(await ids(`?from=${today}&to=${today}`)).toHaveLength(3);
      expect(await ids('?from=2999-01-01')).toEqual([]);
      expect(await ids('?to=2000-01-01')).toEqual([]);

      const page = await app.inject({
        method: 'GET',
        url: `${URL}?page=2&pageSize=2`,
        headers: { cookie: requester.cookie },
      });
      expect(page.json().meta).toEqual({ page: 2, pageSize: 2, total: 3 });
      expect(page.json().data).toHaveLength(1);

      const count = await app.inject({
        method: 'GET',
        url: `${URL}/pending-count`,
        headers: { cookie: approver.cookie },
      });
      expect(count.statusCode).toBe(200);
      expect(count.json().data).toEqual({ count: 1 });
    });
  });

  describe('integridad en la base de datos', () => {
    it('un ajuste resuelto no se puede modificar ni borrar, ni siquiera por SQL', async () => {
      const variant = await createVariant(5);
      const { id } = await requestOk([{ variantId: variant.id, quantityDelta: -2 }]);
      await approve(id);

      await expect(
        app.prisma.inventoryAdjustment.update({ where: { id }, data: { notes: 'cambiado' } }),
      ).rejects.toThrow();
      await expect(app.prisma.inventoryAdjustment.delete({ where: { id } })).rejects.toThrow();
      await expect(
        app.prisma.inventoryAdjustmentItem.updateMany({
          where: { adjustmentId: id },
          data: { quantityDelta: -1 },
        }),
      ).rejects.toThrow();
      await expect(
        app.prisma.inventoryAdjustmentItem.deleteMany({ where: { adjustmentId: id } }),
      ).rejects.toThrow();
    });

    it('las restricciones CHECK impiden líneas en cero, rechazos sin comentario y resoluciones incompletas', async () => {
      const variant = await createVariant(5);
      const reasonId = reasons.get('LOSS') ?? '';
      const base = { reasonId, requestedById: requester.id };

      await expect(
        app.prisma.inventoryAdjustment.create({
          data: {
            ...base,
            items: { create: [{ variantId: variant.id, quantityDelta: 0, quantityAtRequest: 5 }] },
          },
        }),
      ).rejects.toThrow();
      await expect(
        app.prisma.inventoryAdjustment.create({
          data: { ...base, status: 'REJECTED', resolvedById: approver.id, resolvedAt: new Date() },
        }),
      ).rejects.toThrow();
      await expect(
        app.prisma.inventoryAdjustment.create({ data: { ...base, status: 'APPROVED' } }),
      ).rejects.toThrow();
      await expect(
        app.prisma.inventoryAdjustment.create({ data: { ...base, status: 'CANCELLED' } }),
      ).rejects.toThrow();
      // Cantidad nueva que no cuadra con anterior + diferencia.
      const pending = await app.prisma.inventoryAdjustment.create({ data: base });
      await expect(
        app.prisma.inventoryAdjustmentItem.create({
          data: {
            adjustmentId: pending.id,
            variantId: variant.id,
            quantityDelta: -2,
            quantityAtRequest: 5,
            balanceBefore: 5,
            balanceAfter: 4,
            movementId: 1n,
          },
        }),
      ).rejects.toThrow();
    });
  });
});
