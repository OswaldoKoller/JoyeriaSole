import { PERMISSIONS } from '@joyeria/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';

const url = '/api/v1/suppliers';

describe('proveedores', () => {
  let app: App;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  beforeEach(() => resetDatabase(app.prisma));
  afterAll(() => app.close());

  async function session(permissions: (typeof PERMISSIONS)[keyof typeof PERMISSIONS][]) {
    const { user, password } = await createTestUser(app.prisma, { permissions });
    return (await login(app, user.email, password)).cookie;
  }

  it('exige sesión y permisos en lectura y escritura', async () => {
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url, payload: { name: 'Sol' } })).statusCode).toBe(
      401,
    );
    const noPermission = await session([PERMISSIONS.CATALOG_READ]);
    expect(
      (await app.inject({ method: 'GET', url, headers: { cookie: noPermission } })).statusCode,
    ).toBe(403);
    const readOnly = await session([PERMISSIONS.SUPPLIERS_READ]);
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          headers: { cookie: readOnly },
          payload: { name: 'Sol' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: 'GET', url, headers: { cookie: readOnly } })).statusCode,
    ).toBe(200);
  });

  it('valida entrada, UUID y paginación', async () => {
    const cookie = await session([PERMISSIONS.SUPPLIERS_READ, PERMISSIONS.SUPPLIERS_MANAGE]);
    const headers = { cookie };
    expect(
      (await app.inject({ method: 'POST', url, headers, payload: { name: '   ' } })).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          headers,
          payload: { name: 'Sol', email: 'no-es-correo' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: `${url}?pageSize=101`, headers })).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: `${url}/no-es-uuid`, headers })).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `${url}/00000000-0000-4000-8000-000000000000`,
          headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    for (const payload of [
      { name: 'Sol', type: 'OTRO' },
      { name: 'Sol', defaultCurrency: 'EUR' },
      { name: 'Sol', country: 'x'.repeat(81) },
      { name: 'Sol', paymentTerms: 'x'.repeat(301) },
    ]) {
      expect((await app.inject({ method: 'POST', url, headers, payload })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: 'GET', url: `${url}?type=OTRO`, headers })).statusCode).toBe(
      400,
    );
    expect(await app.prisma.supplier.count()).toBe(0);
  });

  it('aplica valores por defecto (nacional, bolivianos) y expone los campos nuevos', async () => {
    const cookie = await session([PERMISSIONS.SUPPLIERS_READ, PERMISSIONS.SUPPLIERS_MANAGE]);
    const headers = { cookie };
    const minimal = await app.inject({ method: 'POST', url, headers, payload: { name: 'Mínimo' } });
    expect(minimal.statusCode).toBe(201);
    expect(minimal.json().data).toMatchObject({
      name: 'Mínimo',
      type: 'NATIONAL',
      defaultCurrency: 'BOB',
      country: null,
      whatsapp: null,
      paymentTerms: null,
    });
    const foreign = await app.inject({
      method: 'POST',
      url,
      headers,
      payload: {
        name: 'Importadora Sol',
        type: 'FOREIGN',
        country: '  China ',
        whatsapp: '+86 130 0000 0000',
        defaultCurrency: 'USD',
        paymentTerms: '50% anticipo, 50% contra embarque',
      },
    });
    expect(foreign.statusCode).toBe(201);
    expect(foreign.json().data).toMatchObject({
      type: 'FOREIGN',
      country: 'China',
      whatsapp: '+86 130 0000 0000',
      defaultCurrency: 'USD',
      paymentTerms: '50% anticipo, 50% contra embarque',
    });
  });

  it('una edición parcial no reinicia tipo ni moneda y audita el valor anterior y el nuevo', async () => {
    const cookie = await session([PERMISSIONS.SUPPLIERS_READ, PERMISSIONS.SUPPLIERS_MANAGE]);
    const headers = { cookie };
    const created = (
      await app.inject({
        method: 'POST',
        url,
        headers,
        payload: { name: 'Importadora', type: 'FOREIGN', country: 'China', defaultCurrency: 'USD' },
      })
    ).json().data;
    const edited = await app.inject({
      method: 'PATCH',
      url: `${url}/${created.id}`,
      headers,
      payload: { contactName: 'Li', country: 'Hong Kong', paymentTerms: '30 días' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().data).toMatchObject({
      type: 'FOREIGN',
      defaultCurrency: 'USD',
      country: 'Hong Kong',
    });
    const back = await app.inject({
      method: 'PATCH',
      url: `${url}/${created.id}`,
      headers,
      payload: { type: 'NATIONAL', defaultCurrency: 'BOB', country: null },
    });
    expect(back.json().data).toMatchObject({
      type: 'NATIONAL',
      defaultCurrency: 'BOB',
      country: null,
    });
    const logs = await app.prisma.auditLog.findMany({
      where: { entityId: created.id, action: 'supplier.updated' },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs).toHaveLength(2);
    expect(logs[0]?.before).toMatchObject({ country: 'China', paymentTerms: null });
    expect(logs[0]?.after).toMatchObject({ country: 'Hong Kong', paymentTerms: '30 días' });
    expect(logs[1]?.before).toMatchObject({ type: 'FOREIGN', defaultCurrency: 'USD' });
    expect(logs[1]?.after).toMatchObject({ type: 'NATIONAL', defaultCurrency: 'BOB' });
  });

  it('filtra por tipo y busca por país y persona de contacto además de nombre y NIT', async () => {
    const cookie = await session([PERMISSIONS.SUPPLIERS_READ]);
    const headers = { cookie };
    await app.prisma.supplier.createMany({
      data: [
        { name: 'Alfa', taxId: '111', contactName: 'Rosa Quispe' },
        { name: 'Beta', type: 'FOREIGN', country: 'China', defaultCurrency: 'USD' },
        { name: 'Gamma', type: 'FOREIGN', country: 'Turquía', contactName: 'Mehmet' },
      ],
    });
    const names = async (query: string): Promise<string[]> => {
      const response = await app.inject({ method: 'GET', url: `${url}?${query}`, headers });
      return response.json<{ data: { name: string }[] }>().data.map((item) => item.name);
    };
    expect(await names('type=FOREIGN')).toEqual(['Beta', 'Gamma']);
    expect(await names('type=NATIONAL')).toEqual(['Alfa']);
    expect(await names('type=all')).toEqual(['Alfa', 'Beta', 'Gamma']);
    expect(await names('q=chin')).toEqual(['Beta']);
    expect(await names('q=quispe')).toEqual(['Alfa']);
    expect(await names('q=turq&type=FOREIGN')).toEqual(['Gamma']);
    expect(await names('q=turq&type=NATIONAL')).toEqual([]);
    expect(await names('q=111')).toEqual(['Alfa']);
  });

  it('crea, consulta, edita y desactiva dejando auditoría íntegra', async () => {
    const cookie = await session([PERMISSIONS.SUPPLIERS_READ, PERMISSIONS.SUPPLIERS_MANAGE]);
    const headers = { cookie };
    const created = await app.inject({
      method: 'POST',
      url,
      headers,
      payload: { name: '  Taller Plata  ', taxId: '12345', phone: '70012345' },
    });
    expect(created.statusCode).toBe(201);
    const supplier = created.json().data;
    expect(supplier).toMatchObject({ name: 'Taller Plata', taxId: '12345', isActive: true });
    expect(
      (await app.inject({ method: 'GET', url: `${url}/${supplier.id}`, headers })).json().data.id,
    ).toBe(supplier.id);

    const edited = await app.inject({
      method: 'PATCH',
      url: `${url}/${supplier.id}`,
      headers,
      payload: { contactName: 'Ana' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().data.contactName).toBe('Ana');
    const disabled = await app.inject({
      method: 'PATCH',
      url: `${url}/${supplier.id}`,
      headers,
      payload: { isActive: false },
    });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json().data.isActive).toBe(false);
    expect(await app.prisma.supplier.count({ where: { id: supplier.id } })).toBe(1);

    const logs = await app.prisma.auditLog.findMany({
      where: { entityId: supplier.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.map((log) => log.action)).toEqual([
      'supplier.created',
      'supplier.updated',
      'supplier.deactivated',
    ]);
    expect(logs[1]?.before).toMatchObject({ contactName: null });
    expect(logs[1]?.after).toMatchObject({ contactName: 'Ana' });
    expect(logs.every((log) => log.userId !== null)).toBe(true);
  });

  it('busca, filtra inactivos y pagina sin perderlos', async () => {
    const cookie = await session([PERMISSIONS.SUPPLIERS_READ]);
    const headers = { cookie };
    await app.prisma.supplier.createMany({
      data: [
        { name: 'Alfa', taxId: '111', isActive: true },
        { name: 'Beta', taxId: '222', isActive: false },
        { name: 'Gamma', taxId: '333', isActive: true },
      ],
    });
    const firstPage = await app.inject({ method: 'GET', url: `${url}?pageSize=2&page=1`, headers });
    expect(firstPage.json().meta).toEqual({ page: 1, pageSize: 2, total: 3 });
    expect(firstPage.json().data.map((item: { name: string }) => item.name)).toEqual([
      'Alfa',
      'Beta',
    ]);
    const search = await app.inject({
      method: 'GET',
      url: `${url}?q=222&status=inactive`,
      headers,
    });
    expect(search.json().data.map((item: { name: string }) => item.name)).toEqual(['Beta']);
    const active = await app.inject({ method: 'GET', url: `${url}?status=active`, headers });
    expect(active.json().meta.total).toBe(2);
  });

  it('devuelve conflicto por NIT duplicado sin crear proveedor ni auditoría', async () => {
    const cookie = await session([PERMISSIONS.SUPPLIERS_MANAGE]);
    const headers = { cookie };
    expect(
      (await app.inject({ method: 'POST', url, headers, payload: { name: 'Uno', taxId: 'NIT-1' } }))
        .statusCode,
    ).toBe(201);
    const duplicate = await app.inject({
      method: 'POST',
      url,
      headers,
      payload: { name: 'Dos', taxId: 'NIT-1' },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(await app.prisma.supplier.count()).toBe(1);
    expect(await app.prisma.auditLog.count({ where: { action: 'supplier.created' } })).toBe(1);
  });

  it('responde 404 al consultar o editar un proveedor inexistente', async () => {
    const cookie = await session([PERMISSIONS.SUPPLIERS_READ, PERMISSIONS.SUPPLIERS_MANAGE]);
    const headers = { cookie };
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await app.inject({ method: 'GET', url: `${url}/${id}`, headers })).statusCode).toBe(
      404,
    );
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `${url}/${id}`,
          headers,
          payload: { name: 'Nuevo' },
        })
      ).statusCode,
    ).toBe(404);
  });
});
