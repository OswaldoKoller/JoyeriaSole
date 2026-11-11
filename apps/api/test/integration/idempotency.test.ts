import { randomUUID } from 'node:crypto';
import { PERMISSIONS, type Permission } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { App } from '../../src/app.ts';
import { idempotentTransaction, purgeExpiredIdempotencyKeys } from '../../src/lib/idempotency.ts';
import { recordAudit } from '../../src/modules/audit/audit.service.ts';
import { idempotencyHeadersSchema, idempotencyOf } from '../../src/plugins/idempotency.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { assertLedgerInvariant } from '../helpers/ledger.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';

const MANAGER: Permission[] = [
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.INVENTORY_INITIAL_STOCK,
  PERMISSIONS.INVENTORY_EXCHANGE,
  PERMISSIONS.COSTS_READ,
];

const PROBE_AUDIT_ACTION = 'test.idempotency_probe';
const probeResult = z.object({ value: z.string(), at: z.string() });

/**
 * Ruta solo de prueba que usa el helper como lo haría un módulo nuevo (p. ej. Ventas):
 * clave OBLIGATORIA, auditoría en la misma transacción y una respuesta con un valor variable
 * (`at`) para distinguir la respuesta original de una nueva ejecución.
 */
function registerProbeRoute(app: App) {
  app.post(
    '/api/v1/test/idempotency-probe/:slot',
    {
      preValidation: app.requirePermission(PERMISSIONS.INVENTORY_READ),
      schema: {
        headers: idempotencyHeadersSchema,
        params: z.object({ slot: z.string().max(20) }),
        body: z.object({ value: z.string().max(50) }),
        response: { 201: z.object({ data: probeResult }) },
      },
    },
    async (request, reply) => {
      const context = idempotencyOf(request, { required: true });
      const idempotency = { context, responseSchema: probeResult };
      const data = await idempotentTransaction(app.prisma, idempotency, async (tx) => {
        await recordAudit(tx, { action: PROBE_AUDIT_ACTION, entityId: request.params.slot });
        return { value: request.body.value, at: new Date().toISOString() };
      });
      return reply.status(201).send({ data });
    },
  );
}

describe('idempotencia (Idempotency-Key): mecanismo genérico', () => {
  let app: App;
  let cookie: string;

  beforeEach(async () => {
    app = await buildTestApp(registerProbeRoute);
    await resetDatabase(app.prisma);
    const manager = await createTestUser(app.prisma, { permissions: MANAGER });
    ({ cookie } = await login(app, manager.user.email, manager.password));
  });
  afterEach(() => app.close());

  let counter = 0;
  async function createVariant(stock = 0) {
    counter += 1;
    const category = await app.prisma.category.create({
      data: { name: `Cat ${counter}`, slug: `idem-${counter}-${Date.now()}` },
    });
    const product = await app.prisma.product.create({
      data: { categoryId: category.id, name: `Producto ${counter}` },
    });
    const variant = await app.prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `IDEM-${counter}-${Date.now()}`,
        costPrice: '5',
        status: 'ACTIVE',
      },
    });
    if (stock > 0) {
      const res = await initialStock(variant.id, stock);
      expect(res.statusCode, res.body).toBe(201);
    }
    return variant;
  }

  function initialStock(variantId: string, quantity: number, key?: string, c = cookie) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/inventory/${variantId}/initial`,
      headers: { cookie: c, ...(key && { 'idempotency-key': key }) },
      payload: { quantity, reason: 'Stock de prueba' },
    });
  }

  function exchange(
    returnedId: string,
    deliveredId: string,
    options: { key?: string; reason?: string; cookie?: string } = {},
  ) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/inventory/exchanges',
      headers: {
        cookie: options.cookie ?? cookie,
        ...(options.key && { 'idempotency-key': options.key }),
      },
      payload: {
        returned: { variantId: returnedId, quantity: 1 },
        delivered: { variantId: deliveredId, quantity: 1 },
        reason: options.reason ?? 'Talla equivocada',
      },
    });
  }

  function probe(slot: string, value: string, key?: string) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/test/idempotency-probe/${slot}`,
      headers: { cookie, ...(key && { 'idempotency-key': key }) },
      payload: { value },
    });
  }

  const exchangeMovements = () =>
    app.prisma.inventoryMovement.count({ where: { referenceType: 'EXCHANGE' } });
  const exchangeAudits = () =>
    app.prisma.auditLog.count({ where: { action: 'inventory.exchange' } });
  const balanceOf = async (variantId: string) =>
    (await app.prisma.inventoryBalance.findUnique({ where: { variantId } }))?.quantity ?? 0;

  describe('protección y validación de la cabecera', () => {
    it('401 sin sesión aunque la clave sea inválida; 400 con una clave que no es UUID', async () => {
      const unauthenticated = await app.inject({
        method: 'POST',
        url: '/api/v1/inventory/exchanges',
        headers: { 'idempotency-key': 'no-es-uuid' },
        payload: {},
      });
      expect(unauthenticated.statusCode).toBe(401);

      const a = await createVariant(2);
      const b = await createVariant(2);
      const invalid = await exchange(a.id, b.id, { key: 'no-es-uuid' });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json().error.code).toBe('VALIDATION_ERROR');
      expect(await exchangeMovements()).toBe(0);
    });

    it('sin permiso responde 403 y no reclama la clave', async () => {
      const seller = await createTestUser(app.prisma, {
        permissions: [PERMISSIONS.INVENTORY_READ],
      });
      const sellerCookie = (await login(app, seller.user.email, seller.password)).cookie;
      const a = await createVariant(2);
      const b = await createVariant(2);
      const res = await exchange(a.id, b.id, { key: randomUUID(), cookie: sellerCookie });
      expect(res.statusCode).toBe(403);
      expect(await app.prisma.idempotencyKey.count()).toBe(0);
    });

    it('una operación que exige la clave responde 400 IDEMPOTENCY_KEY_REQUIRED si falta', async () => {
      const res = await probe('a', 'uno');
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(await app.prisma.auditLog.count({ where: { action: PROBE_AUDIT_ACTION } })).toBe(0);
    });

    it('conserva las demás cabeceras (la auditoría registra el user-agent)', async () => {
      const a = await createVariant(2);
      const b = await createVariant(2);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/inventory/exchanges',
        headers: { cookie, 'idempotency-key': randomUUID(), 'user-agent': 'navegador-de-prueba' },
        payload: {
          returned: { variantId: a.id, quantity: 1 },
          delivered: { variantId: b.id, quantity: 1 },
          reason: 'Talla equivocada',
        },
      });
      expect(res.statusCode, res.body).toBe(201);
      const audit = await app.prisma.auditLog.findFirstOrThrow({
        where: { action: 'inventory.exchange' },
      });
      expect(audit.userAgent).toBe('navegador-de-prueba');
    });
  });

  describe('cambio de pieza (cada POST genera un documento nuevo)', () => {
    it('misma clave y mismo cuerpo: devuelve la respuesta original sin repetir movimientos ni auditoría', async () => {
      const a = await createVariant(3);
      const b = await createVariant(3);
      const key = randomUUID();

      const first = await exchange(a.id, b.id, { key });
      expect(first.statusCode, first.body).toBe(201);
      expect(first.headers['idempotent-replay']).toBeUndefined();

      const second = await exchange(a.id, b.id, { key });
      expect(second.statusCode).toBe(201);
      expect(second.headers['idempotent-replay']).toBe('true');
      expect(second.json()).toEqual(first.json());

      expect(await exchangeMovements()).toBe(2);
      expect(await exchangeAudits()).toBe(1);
      expect(await balanceOf(a.id)).toBe(4);
      expect(await balanceOf(b.id)).toBe(2);
      await assertLedgerInvariant(app.prisma);

      // La clave queda con usuario, ruta, hash y respuesta.
      const stored = await app.prisma.idempotencyKey.findUniqueOrThrow({ where: { key } });
      expect(stored.scope).toBe('POST /api/v1/inventory/exchanges');
      expect(stored.requestHash).toMatch(/^[0-9a-f]{64}$/);
      expect(stored.response).toEqual(first.json().data);
      expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);
    });

    it('la clave no distingue mayúsculas (UUID)', async () => {
      const a = await createVariant(3);
      const b = await createVariant(3);
      const key = randomUUID();
      expect((await exchange(a.id, b.id, { key })).statusCode).toBe(201);
      const again = await exchange(a.id, b.id, { key: key.toUpperCase() });
      expect(again.statusCode).toBe(201);
      expect(again.headers['idempotent-replay']).toBe('true');
      expect(await exchangeMovements()).toBe(2);
    });

    it('misma clave con otro cuerpo: 409 IDEMPOTENCY_KEY_REUSED y no se crea nada', async () => {
      const a = await createVariant(3);
      const b = await createVariant(3);
      const key = randomUUID();
      expect((await exchange(a.id, b.id, { key })).statusCode).toBe(201);

      const other = await exchange(a.id, b.id, { key, reason: 'Otro motivo' });
      expect(other.statusCode).toBe(409);
      expect(other.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(await exchangeMovements()).toBe(2);
      expect(await exchangeAudits()).toBe(1);
    });

    it('misma clave en otra ruta: 409 IDEMPOTENCY_KEY_REUSED', async () => {
      const a = await createVariant(3);
      const b = await createVariant(3);
      const c = await createVariant();
      const key = randomUUID();
      expect((await exchange(a.id, b.id, { key })).statusCode).toBe(201);

      const res = await initialStock(c.id, 5, key);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(await balanceOf(c.id)).toBe(0);
    });

    it('misma clave desde otro usuario: 409 (no devuelve la respuesta ajena)', async () => {
      const a = await createVariant(3);
      const b = await createVariant(3);
      const key = randomUUID();
      expect((await exchange(a.id, b.id, { key })).statusCode).toBe(201);

      const other = await createTestUser(app.prisma, { permissions: MANAGER });
      const otherCookie = (await login(app, other.user.email, other.password)).cookie;
      const res = await exchange(a.id, b.id, { key, cookie: otherCookie });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(res.json().data).toBeUndefined();
      expect(await exchangeMovements()).toBe(2);
    });

    it('dos peticiones simultáneas con la misma clave: solo una ejecuta', async () => {
      const a = await createVariant(5);
      const b = await createVariant(5);
      const key = randomUUID();

      const responses = await Promise.all([
        exchange(a.id, b.id, { key }),
        exchange(a.id, b.id, { key }),
        exchange(a.id, b.id, { key }),
      ]);
      for (const res of responses) expect(res.statusCode, res.body).toBe(201);
      const replays = responses.filter((res) => res.headers['idempotent-replay'] === 'true');
      expect(replays).toHaveLength(2);
      const [first] = responses;
      for (const res of responses) expect(res.json()).toEqual(first.json());

      expect(await exchangeMovements()).toBe(2);
      expect(await exchangeAudits()).toBe(1);
      expect(await balanceOf(a.id)).toBe(6);
      expect(await balanceOf(b.id)).toBe(4);
      await assertLedgerInvariant(app.prisma);
    });

    it('sin clave sigue funcionando como antes: cada POST es un cambio nuevo', async () => {
      const a = await createVariant(3);
      const b = await createVariant(3);
      expect((await exchange(a.id, b.id)).statusCode).toBe(201);
      expect((await exchange(a.id, b.id)).statusCode).toBe(201);
      expect(await exchangeMovements()).toBe(4);
      expect(await app.prisma.idempotencyKey.count()).toBe(0);
    });

    it('si la operación falla no se guarda la clave y el reintento vuelve a ejecutar', async () => {
      const a = await createVariant(1);
      const b = await createVariant();
      const key = randomUUID();

      const failed = await exchange(a.id, b.id, { key });
      expect(failed.statusCode).toBe(422);
      expect(await app.prisma.idempotencyKey.count()).toBe(0);

      // Llega stock de la pieza entregada; el reintento con la misma clave ahora se aplica.
      expect((await initialStock(b.id, 2)).statusCode).toBe(201);
      const retried = await exchange(a.id, b.id, { key });
      expect(retried.statusCode, retried.body).toBe(201);
      expect(retried.headers['idempotent-replay']).toBeUndefined();
      expect(await exchangeMovements()).toBe(2);
    });
  });

  describe('stock inicial', () => {
    it('repetir con la misma clave devuelve 201 original en vez de 422 y no duplica', async () => {
      const variant = await createVariant();
      const key = randomUUID();
      const first = await initialStock(variant.id, 7, key);
      expect(first.statusCode, first.body).toBe(201);
      const again = await initialStock(variant.id, 7, key);
      expect(again.statusCode).toBe(201);
      expect(again.headers['idempotent-replay']).toBe('true');
      expect(again.json()).toEqual({ data: { quantity: 7 } });

      expect(await app.prisma.inventoryMovement.count({ where: { variantId: variant.id } })).toBe(
        1,
      );
      expect(
        await app.prisma.auditLog.count({ where: { action: 'inventory.initial_stock' } }),
      ).toBe(1);
      expect(await balanceOf(variant.id)).toBe(7);

      // Otra clave (otro intento del usuario) recibe la regla de siempre.
      const otherAttempt = await initialStock(variant.id, 7, randomUUID());
      expect(otherAttempt.statusCode).toBe(422);
    });
  });

  describe('vigencia y limpieza de claves', () => {
    it('una clave vencida se puede reutilizar y la limpieza elimina las vencidas', async () => {
      const first = await probe('a', 'uno', randomUUID());
      expect(first.statusCode).toBe(201);
      const key = randomUUID();
      expect((await probe('a', 'dos', key)).statusCode).toBe(201);

      await app.prisma.idempotencyKey.update({
        where: { key },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      // Vencida: otro cuerpo con la misma clave ya no es un conflicto; se ejecuta de nuevo.
      const reused = await probe('b', 'tres', key);
      expect(reused.statusCode, reused.body).toBe(201);
      expect(reused.headers['idempotent-replay']).toBeUndefined();
      expect(reused.json().data.value).toBe('tres');
      expect(await app.prisma.auditLog.count({ where: { action: PROBE_AUDIT_ACTION } })).toBe(3);

      await app.prisma.idempotencyKey.update({
        where: { key },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(await purgeExpiredIdempotencyKeys(app.prisma)).toBe(1);
      expect(await app.prisma.idempotencyKey.count()).toBe(1);
    });

    it('la respuesta repetida es la original aunque la operación diera otro resultado hoy', async () => {
      const key = randomUUID();
      const first = await probe('a', 'uno', key);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const again = await probe('a', 'uno', key);
      expect(again.json().data.at).toBe(first.json().data.at);
      expect(again.headers['idempotent-replay']).toBe('true');
      expect(await app.prisma.auditLog.count({ where: { action: PROBE_AUDIT_ACTION } })).toBe(1);

      // El hash cubre también los parámetros de la ruta.
      const otherSlot = await probe('b', 'uno', key);
      expect(otherSlot.statusCode).toBe(409);
    });
  });
});
