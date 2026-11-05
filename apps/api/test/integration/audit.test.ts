import { PERMISSIONS, type Permission } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';

const URL = '/api/v1/audit';
const actionsOf = (body: { data: { action: string }[] }) => body.data.map((row) => row.action);

describe('consulta de auditoría (solo Administrador, Q-15.3)', () => {
  let app: App;

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
  });
  afterEach(() => app.close());

  /**
   * Crea un usuario con esos permisos e inicia sesión. El inicio de sesión también se audita
   * (`auth.login`), así que la tabla se vacía después para que cada prueba controle sus datos.
   */
  async function session(permissions: Permission[]) {
    const { user, password } = await createTestUser(app.prisma, { permissions });
    const { cookie } = await login(app, user.email, password);
    await app.prisma.$executeRawUnsafe('TRUNCATE TABLE "audit_logs"');
    return { cookie, user };
  }

  const get = (cookie: string | undefined, url: string) =>
    app.inject({ method: 'GET', url, ...(cookie && { headers: { cookie } }) });

  describe('permisos y validación', () => {
    it('401 sin sesión en los tres endpoints', async () => {
      for (const url of [URL, `${URL}/actions`, `${URL}/1`]) {
        expect((await get(undefined, url)).statusCode, url).toBe(401);
      }
    });

    it('403 para quien no tiene audit:read (Responsable y Vendedor)', async () => {
      const manager = await session([
        PERMISSIONS.CATALOG_READ,
        PERMISSIONS.INVENTORY_READ,
        PERMISSIONS.INVENTORY_ADJUST,
        PERMISSIONS.PRICES_PROPOSE,
      ]);
      const seller = await session([PERMISSIONS.CATALOG_READ, PERMISSIONS.INVENTORY_READ]);
      for (const { cookie } of [manager, seller]) {
        for (const url of [URL, `${URL}/actions`, `${URL}/1`]) {
          expect((await get(cookie, url)).statusCode, url).toBe(403);
        }
      }
    });

    it('400 por filtros inválidos', async () => {
      const { cookie } = await session([PERMISSIONS.AUDIT_READ]);
      for (const query of [
        'userId=no-es-uuid',
        'from=ayer',
        'to=2026-13-45',
        'from=2026-11-05T10:00:00Z&to=2026-11-04T10:00:00Z',
        'page=0',
        'pageSize=101',
        'pageSize=0',
        `action=${'a'.repeat(81)}`,
      ]) {
        const res = await get(cookie, `${URL}?${query}`);
        expect(res.statusCode, query).toBe(400);
        expect(res.json().error.code).toBe('VALIDATION_ERROR');
      }
      expect((await get(cookie, `${URL}/abc`)).statusCode).toBe(400);
    });

    it('no existe ninguna ruta de escritura sobre la auditoría', async () => {
      const { cookie } = await session([PERMISSIONS.AUDIT_READ]);
      await app.prisma.auditLog.create({ data: { action: 'x.y' } });
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
        for (const url of [URL, `${URL}/1`]) {
          const res = await app.inject({
            method,
            url,
            headers: { cookie },
            ...(method !== 'DELETE' && { payload: {} }),
          });
          expect([404, 405], `${method} ${url}`).toContain(res.statusCode);
        }
      }
      expect(await app.prisma.auditLog.count()).toBe(1);
    });
  });

  describe('listado', () => {
    async function seed() {
      const ana = await createTestUser(app.prisma, { permissions: [] });
      const luis = await createTestUser(app.prisma, { permissions: [] });
      const base = Date.parse('2026-11-01T12:00:00Z');
      const rows = [
        { action: 'price.requested', entityType: 'Variant', entityId: 'v-1', userId: ana.user.id },
        { action: 'price.approved', entityType: 'Variant', entityId: 'v-1', userId: luis.user.id },
        { action: 'product.created', entityType: 'Product', entityId: 'p-1', userId: ana.user.id },
        { action: 'auth.login_failed', entityType: null, entityId: null, userId: null },
        { action: 'product.updated', entityType: 'Product', entityId: 'p-2', userId: luis.user.id },
      ];
      for (const [index, row] of rows.entries()) {
        await app.prisma.auditLog.create({
          data: { ...row, createdAt: new Date(base + index * 3_600_000), ip: '10.0.0.1' },
        });
      }
      return { ana, luis };
    }

    it('devuelve los registros más recientes primero con la forma esperada', async () => {
      const { cookie } = await session([PERMISSIONS.AUDIT_READ]);
      await seed();
      const res = await get(cookie, URL);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.meta).toEqual({ page: 1, pageSize: 25, total: 5 });
      expect(actionsOf(body)).toEqual([
        'product.updated',
        'auth.login_failed',
        'product.created',
        'price.approved',
        'price.requested',
      ]);
      const first = body.data[0];
      expect(typeof first.id).toBe('string');
      expect(first).toMatchObject({ entityType: 'Product', entityId: 'p-2', ip: '10.0.0.1' });
      expect(first.user).toEqual({
        id: expect.any(String),
        name: expect.any(String),
        email: expect.any(String),
      });
      expect(body.data[1].user).toBeNull();
      expect(first).not.toHaveProperty('userAgent');
    });

    it('desempata por id cuando el instante es el mismo', async () => {
      const { cookie } = await session([PERMISSIONS.AUDIT_READ]);
      const at = new Date('2026-11-01T12:00:00Z');
      for (const action of ['a.one', 'a.two', 'a.three']) {
        await app.prisma.auditLog.create({ data: { action, createdAt: at } });
      }
      const res = await get(cookie, `${URL}?action=a.&pageSize=10`);
      expect(actionsOf(res.json())).toEqual(['a.three', 'a.two', 'a.one']);
    });

    it('pagina y reporta el total', async () => {
      const { cookie } = await session([PERMISSIONS.AUDIT_READ]);
      await seed();
      const first = (await get(cookie, `${URL}?pageSize=2&page=1`)).json();
      const third = (await get(cookie, `${URL}?pageSize=2&page=3`)).json();
      const beyond = (await get(cookie, `${URL}?pageSize=2&page=9`)).json();
      expect(first.data).toHaveLength(2);
      expect(first.meta).toEqual({ page: 1, pageSize: 2, total: 5 });
      expect(third.data).toHaveLength(1);
      expect(beyond.data).toHaveLength(0);
      expect(beyond.meta.total).toBe(5);
    });

    it('filtra por acción exacta o por prefijo', async () => {
      const { cookie } = await session([PERMISSIONS.AUDIT_READ]);
      await seed();
      const exact = (await get(cookie, `${URL}?action=price.approved`)).json();
      expect(actionsOf(exact)).toEqual(['price.approved']);
      for (const prefix of ['price.', 'price.*']) {
        const res = (await get(cookie, `${URL}?action=${encodeURIComponent(prefix)}`)).json();
        expect(res.meta.total, prefix).toBe(2);
      }
      // El guion bajo del prefijo no es un comodín: «pric_.» no coincide con «price.».
      expect((await get(cookie, `${URL}?action=pric_.`)).json().meta.total).toBe(0);
      // Sin punto final es una coincidencia exacta, no un prefijo.
      expect((await get(cookie, `${URL}?action=price`)).json().meta.total).toBe(0);
    });

    it('filtra por usuario, tipo y id de entidad', async () => {
      const { cookie } = await session([PERMISSIONS.AUDIT_READ]);
      const { ana } = await seed();
      expect((await get(cookie, `${URL}?userId=${ana.user.id}`)).json().meta.total).toBe(2);
      expect((await get(cookie, `${URL}?entityType=Product`)).json().meta.total).toBe(2);
      expect((await get(cookie, `${URL}?entityType=Variant&entityId=v-1`)).json().meta.total).toBe(
        2,
      );
      expect((await get(cookie, `${URL}?entityId=p-2`)).json().meta.total).toBe(1);
    });

    it('filtra por intervalo de fechas (cerrado) y combina filtros', async () => {
      const { cookie } = await session([PERMISSIONS.AUDIT_READ]);
      await seed();
      const from = '2026-11-01T14:00:00.000Z'; // price.approved (13:00) queda fuera
      const to = '2026-11-01T15:00:00.000Z'; // auth.login_failed (15:00) entra: el límite es cerrado
      const res = (await get(cookie, `${URL}?from=${from}&to=${to}`)).json();
      expect(actionsOf(res)).toEqual(['auth.login_failed', 'product.created']);
      const combined = (
        await get(cookie, `${URL}?from=${from}&to=${to}&action=product.&entityType=Product`)
      ).json();
      expect(actionsOf(combined)).toEqual(['product.created']);
      // Un desfase explícito equivale al mismo instante: 08:00-04:00 = 12:00Z (el primero, cerrado).
      const offset = (await get(cookie, `${URL}?from=2026-11-01T08:00:00-04:00`)).json();
      expect(offset.meta.total).toBe(5);
    });

    it('busca por texto en acción, entidad, id y nombre o correo, sin tratar % y _ como comodines', async () => {
      const { cookie } = await session([PERMISSIONS.AUDIT_READ]);
      const { ana } = await seed();
      const search = async (q: string) => {
        const res = await get(cookie, `${URL}?q=${encodeURIComponent(q)}`);
        return res.json<{ meta: { total: number } }>().meta.total;
      };
      expect(await search('PRICE')).toBe(2);
      expect(await search('variant')).toBe(2);
      expect(await search('p-2')).toBe(1);
      expect(await search(ana.user.name)).toBe(2);
      expect(await search(ana.user.email)).toBe(2);
      expect(await search('%')).toBe(0);
      // Solo coincide el «_» literal de auth.login_failed (si fuera comodín serían 5).
      expect(await search('_')).toBe(1);
      expect(await search('inexistente')).toBe(0);
    });

    it('un listado vacío responde 200 con total 0', async () => {
      const { cookie } = await session([PERMISSIONS.AUDIT_READ]);
      const res = await get(cookie, URL);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: [], meta: { page: 1, pageSize: 25, total: 0 } });
    });

    it('redacta las claves sensibles guardadas en before, after y metadata', async () => {
      const { cookie } = await session([PERMISSIONS.AUDIT_READ]);
      await app.prisma.auditLog.create({
        data: {
          action: 'user.password_reset',
          entityType: 'User',
          entityId: 'u-1',
          before: { name: 'Ana', passwordHash: '$argon2id$secreto' },
          after: { mustChangePassword: true, password: 'clave-en-claro' },
          metadata: {
            headers: { cookie: 'sid=abc', authorization: 'Bearer xyz' },
            sessions: [{ tokenHash: 'deadbeef', label: 'ok' }],
            apiSecret: 's3cr3t',
          },
        },
      });
      const list = await get(cookie, URL);
      for (const leaked of [
        '$argon2id$secreto',
        'clave-en-claro',
        'sid=abc',
        'Bearer xyz',
        'deadbeef',
        's3cr3t',
      ]) {
        expect(list.body, leaked).not.toContain(leaked);
      }
      const entry = list.json().data[0];
      expect(entry.before).toEqual({ name: 'Ana', passwordHash: '[oculto]' });
      expect(entry.after).toEqual({ mustChangePassword: true, password: '[oculto]' });
      expect(entry.metadata.sessions).toEqual([{ tokenHash: '[oculto]', label: 'ok' }]);

      const detail = await get(cookie, `${URL}/${entry.id}`);
      for (const leaked of ['$argon2id$secreto', 'clave-en-claro', 'sid=abc', 's3cr3t']) {
        expect(detail.body, leaked).not.toContain(leaked);
      }
    });

    it('consultar la auditoría no añade ni cambia registros (solo lectura)', async () => {
      const { cookie } = await session([PERMISSIONS.AUDIT_READ]);
      await seed();
      await get(cookie, URL);
      await get(cookie, `${URL}/actions`);
      expect(await app.prisma.auditLog.count()).toBe(5);
    });
  });

  describe('detalle', () => {
    it('200 con todos los campos, incluido el agente de usuario', async () => {
      const { cookie } = await session([PERMISSIONS.AUDIT_READ]);
      const { user } = await createTestUser(app.prisma, { permissions: [] });
      const row = await app.prisma.auditLog.create({
        data: {
          action: 'product.created',
          userId: user.id,
          entityType: 'Product',
          entityId: 'p-1',
          before: { a: 1 },
          after: { a: 2 },
          metadata: { note: 'x' },
          ip: '10.0.0.9',
          userAgent: 'Vitest/1.0',
          requestId: 'req-123',
        },
      });
      const res = await get(cookie, `${URL}/${row.id}`);
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({
        id: row.id.toString(),
        action: 'product.created',
        user: { id: user.id, name: user.name, email: user.email },
        entityType: 'Product',
        entityId: 'p-1',
        before: { a: 1 },
        after: { a: 2 },
        metadata: { note: 'x' },
        ip: '10.0.0.9',
        userAgent: 'Vitest/1.0',
        requestId: 'req-123',
      });
    });

    it('404 si el registro no existe', async () => {
      const { cookie } = await session([PERMISSIONS.AUDIT_READ]);
      const res = await get(cookie, `${URL}/999999`);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    });
  });

  describe('acciones y tipos disponibles', () => {
    it('lista acciones, tipos de entidad y usuarios distintos, ordenados', async () => {
      const { cookie } = await session([PERMISSIONS.AUDIT_READ]);
      const { user: ana } = await createTestUser(app.prisma, { permissions: [] });
      for (const [action, entityType] of [
        ['product.created', 'Product'],
        ['price.requested', 'Variant'],
        ['product.created', 'Product'],
        ['auth.logout', null],
      ] as const) {
        await app.prisma.auditLog.create({ data: { action, entityType, userId: ana.id } });
      }
      await app.prisma.auditLog.create({ data: { action: 'auth.login_failed' } });
      const res = await get(cookie, `${URL}/actions`);
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.actions).toEqual([
        'auth.login_failed',
        'auth.logout',
        'price.requested',
        'product.created',
      ]);
      expect(data.entityTypes).toEqual(['Product', 'Variant']);
      expect(data.users).toEqual([{ id: ana.id, name: ana.name, email: ana.email }]);
    });
  });
});
