import { PERMISSIONS } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';

const url = '/api/v1/users';

describe('consulta de usuarios', () => {
  let app: App;
  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
  });
  afterEach(() => app.close());

  it('exige sesión y users:read', async () => {
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    const { user, password } = await createTestUser(app.prisma, {
      permissions: [PERMISSIONS.SUPPLIERS_READ],
    });
    const { cookie } = await login(app, user.email, password);
    expect((await app.inject({ method: 'GET', url, headers: { cookie } })).statusCode).toBe(403);
  });

  it('lista y consulta roles sin exponer hashes ni sesiones', async () => {
    const { user, password } = await createTestUser(app.prisma, {
      permissions: [PERMISSIONS.USERS_READ],
    });
    const { cookie } = await login(app, user.email, password);
    const list = await app.inject({ method: 'GET', url, headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json().meta.total).toBe(1);
    expect(list.json().data[0]).toMatchObject({ id: user.id, email: user.email, isActive: true });
    expect(list.json().data[0].roles).toHaveLength(1);
    expect(JSON.stringify(list.json())).not.toMatch(/passwordHash|tokenHash|sessions/i);

    const detail = await app.inject({
      method: 'GET',
      url: `${url}/${user.id}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.id).toBe(user.id);
    expect(JSON.stringify(detail.json())).not.toMatch(/passwordHash|tokenHash|sessions/i);
  });

  it('filtra activos y rechaza paginación o identificadores inválidos', async () => {
    const reader = await createTestUser(app.prisma, { permissions: [PERMISSIONS.USERS_READ] });
    await createTestUser(app.prisma, { isActive: false });
    const { cookie } = await login(app, reader.user.email, reader.password);
    const headers = { cookie };
    const active = await app.inject({
      method: 'GET',
      url: `${url}?status=active&q=${encodeURIComponent(reader.user.email)}`,
      headers,
    });
    expect(active.json().meta.total).toBe(1);
    const inactive = await app.inject({ method: 'GET', url: `${url}?status=inactive`, headers });
    expect(inactive.json().meta.total).toBe(1);
    expect((await app.inject({ method: 'GET', url: `${url}?page=0`, headers })).statusCode).toBe(
      400,
    );
    expect((await app.inject({ method: 'GET', url: `${url}/no-uuid`, headers })).statusCode).toBe(
      400,
    );
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `${url}/00000000-0000-4000-8000-000000000000`,
          headers,
        })
      ).statusCode,
    ).toBe(404);
  });

  it('permite editar el nombre y asignar varios roles solo con permisos adecuados', async () => {
    const manager = await createTestUser(app.prisma, {
      permissions: [PERMISSIONS.USERS_READ, PERMISSIONS.USERS_MANAGE, PERMISSIONS.ROLES_MANAGE],
    });
    const target = await createTestUser(app.prisma, { permissions: [PERMISSIONS.SUPPLIERS_READ] });
    const { cookie } = await login(app, manager.user.email, manager.password);
    const targetRole = await app.prisma.userRole.findFirstOrThrow({
      where: { userId: target.user.id },
    });
    const otherRole = await app.prisma.role.create({
      data: { code: 'SECOND', name: 'Segundo rol' },
    });

    const changed = await app.inject({
      method: 'PATCH',
      url: `${url}/${target.user.id}`,
      headers: { cookie },
      payload: { name: 'Nombre nuevo' },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().data.name).toBe('Nombre nuevo');

    const roles = await app.inject({ method: 'GET', url: `${url}/roles`, headers: { cookie } });
    expect(roles.statusCode).toBe(200);
    expect(roles.json().data.some((role: { id: string }) => role.id === otherRole.id)).toBe(true);

    const assigned = await app.inject({
      method: 'PUT',
      url: `${url}/${target.user.id}/roles`,
      headers: { cookie },
      payload: { roleIds: [targetRole.roleId, otherRole.id] },
    });
    expect(assigned.statusCode).toBe(200);
    expect(assigned.json().data.roles).toHaveLength(2);
    expect(JSON.stringify(assigned.json())).not.toMatch(/passwordHash|tokenHash|sessions/i);
    const logs = await app.prisma.auditLog.findMany({ where: { entityId: target.user.id } });
    expect(logs.map((log) => log.action)).toEqual(
      expect.arrayContaining(['user.updated', 'user.roles_updated']),
    );

    const withoutRolesManage = await createTestUser(app.prisma, {
      permissions: [PERMISSIONS.USERS_MANAGE],
    });
    const limited = await login(app, withoutRolesManage.user.email, withoutRolesManage.password);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `${url}/${target.user.id}/roles`,
          headers: { cookie: limited.cookie },
          payload: { roleIds: [otherRole.id] },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('rechaza IDs de rol inexistentes o duplicados sin cambiar asignaciones', async () => {
    const manager = await createTestUser(app.prisma, {
      permissions: [PERMISSIONS.USERS_MANAGE, PERMISSIONS.ROLES_MANAGE],
    });
    const target = await createTestUser(app.prisma);
    const { cookie } = await login(app, manager.user.email, manager.password);
    const role = await app.prisma.userRole.findFirstOrThrow({ where: { userId: target.user.id } });
    const headers = { cookie };
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `${url}/${target.user.id}/roles`,
          headers,
          payload: { roleIds: [role.roleId, role.roleId] },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `${url}/${target.user.id}/roles`,
          headers,
          payload: { roleIds: ['00000000-0000-4000-8000-000000000000'] },
        })
      ).statusCode,
    ).toBe(400);
    expect(await app.prisma.userRole.count({ where: { userId: target.user.id } })).toBe(1);
  });

  it('protege el último administrador y revoca sesiones al desactivar a otro usuario', async () => {
    const actor = await createTestUser(app.prisma, {
      permissions: [PERMISSIONS.USERS_MANAGE, PERMISSIONS.ROLES_MANAGE],
    });
    const adminRole = await app.prisma.role.create({
      data: { code: 'ADMIN', name: 'Administrador' },
    });
    await app.prisma.userRole.create({ data: { userId: actor.user.id, roleId: adminRole.id } });
    const { cookie } = await login(app, actor.user.email, actor.password);
    const headers = { cookie };
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `${url}/${actor.user.id}`,
          headers,
          payload: { isActive: false },
        })
      ).statusCode,
    ).toBe(422);
    const actorRole = await app.prisma.userRole.findFirstOrThrow({
      where: { userId: actor.user.id, roleId: { not: adminRole.id } },
    });
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `${url}/${actor.user.id}/roles`,
          headers,
          payload: { roleIds: [actorRole.roleId] },
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (await app.prisma.user.findUniqueOrThrow({ where: { id: actor.user.id } })).isActive,
    ).toBe(true);

    const other = await createTestUser(app.prisma);
    await app.prisma.userRole.create({ data: { userId: other.user.id, roleId: adminRole.id } });
    const otherSession = await login(app, other.user.email, other.password);
    const disabled = await app.inject({
      method: 'PATCH',
      url: `${url}/${other.user.id}`,
      headers,
      payload: { isActive: false },
    });
    expect(disabled.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: { cookie: otherSession.cookie },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      await app.prisma.session.count({
        where: { userId: other.user.id, revokedAt: { not: null } },
      }),
    ).toBe(1);
    expect(
      await app.prisma.auditLog.count({
        where: { entityId: other.user.id, action: 'user.deactivated' },
      }),
    ).toBe(1);
  });

  it('conserva un administrador activo si dos administradores intentan desactivarse a la vez', async () => {
    const first = await createTestUser(app.prisma, { permissions: [PERMISSIONS.USERS_MANAGE] });
    const second = await createTestUser(app.prisma, { permissions: [PERMISSIONS.USERS_MANAGE] });
    const role = await app.prisma.role.create({ data: { code: 'ADMIN', name: 'Administrador' } });
    await app.prisma.userRole.createMany({
      data: [first.user.id, second.user.id].map((userId) => ({ userId, roleId: role.id })),
    });
    const firstSession = await login(app, first.user.email, first.password);
    const secondSession = await login(app, second.user.email, second.password);
    const results = await Promise.all([
      app.inject({
        method: 'PATCH',
        url: `${url}/${first.user.id}`,
        headers: { cookie: firstSession.cookie },
        payload: { isActive: false },
      }),
      app.inject({
        method: 'PATCH',
        url: `${url}/${second.user.id}`,
        headers: { cookie: secondSession.cookie },
        payload: { isActive: false },
      }),
    ]);
    expect(results.map((response) => response.statusCode).sort()).toEqual([200, 422]);
    expect(
      await app.prisma.user.count({
        where: { isActive: true, roles: { some: { role: { code: 'ADMIN' } } } },
      }),
    ).toBe(1);
  });

  it('crea un usuario con varios roles y audita sin exponer la contraseña', async () => {
    const manager = await createTestUser(app.prisma, {
      permissions: [PERMISSIONS.USERS_MANAGE, PERMISSIONS.ROLES_MANAGE],
    });
    const { cookie } = await login(app, manager.user.email, manager.password);
    const firstRole = await app.prisma.userRole.findFirstOrThrow({
      where: { userId: manager.user.id },
    });
    const secondRole = await app.prisma.role.create({ data: { code: 'SELLER', name: 'Vendedor' } });
    const payload = {
      email: 'nuevo@test.local',
      name: 'Nuevo usuario',
      password: 'clave-inicial-123',
      roleIds: [firstRole.roleId, secondRole.id],
    };
    const created = await app.inject({ method: 'POST', url, headers: { cookie }, payload });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.roles).toHaveLength(2);
    expect(JSON.stringify(created.json())).not.toMatch(/passwordHash|clave-inicial-123|sessions/i);
    expect((await login(app, payload.email, payload.password)).response.statusCode).toBe(204);
    expect(
      await app.prisma.auditLog.count({
        where: { action: 'user.created', entityId: created.json().data.id },
      }),
    ).toBe(1);
    const duplicate = await app.inject({ method: 'POST', url, headers: { cookie }, payload });
    expect(duplicate.statusCode).toBe(409);
    expect(await app.prisma.user.count({ where: { email: payload.email } })).toBe(1);
  });

  it('protege el alta con permisos y valida contraseña y roles', async () => {
    const payload = {
      email: 'nuevo@test.local',
      name: 'Nuevo',
      password: 'clave-inicial-123',
      roleIds: [],
    };
    const validPayload = { ...payload, roleIds: ['00000000-0000-4000-8000-000000000000'] };
    expect((await app.inject({ method: 'POST', url, payload: validPayload })).statusCode).toBe(401);
    const limited = await createTestUser(app.prisma, { permissions: [PERMISSIONS.USERS_MANAGE] });
    const session = await login(app, limited.user.email, limited.password);
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          headers: { cookie: session.cookie },
          payload: validPayload,
        })
      ).statusCode,
    ).toBe(403);
    const manager = await createTestUser(app.prisma, {
      permissions: [PERMISSIONS.USERS_MANAGE, PERMISSIONS.ROLES_MANAGE],
    });
    const { cookie } = await login(app, manager.user.email, manager.password);
    const role = await app.prisma.userRole.findFirstOrThrow({ where: { userId: manager.user.id } });
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          headers: { cookie },
          payload: {
            ...payload,
            password: 'corta',
            roleIds: [role.roleId],
          },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'POST', url, headers: { cookie }, payload })).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          headers: { cookie },
          payload: {
            ...payload,
            roleIds: ['00000000-0000-4000-8000-000000000000'],
          },
        })
      ).statusCode,
    ).toBe(400);
  });
});
