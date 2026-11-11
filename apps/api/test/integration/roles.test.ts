import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  type Permission,
} from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';

const url = '/api/v1/roles';

// Una app por prueba: el límite de intentos de inicio de sesión es por instancia.
let app: App;
beforeEach(async () => {
  app = await buildTestApp();
  await resetDatabase(app.prisma);
});
afterEach(() => app.close());

/** Lo mínimo del seed: catálogo de permisos y roles de sistema Administrador y Vendedor. */
async function seedRoles() {
  await app.prisma.permission.createMany({
    data: ALL_PERMISSIONS.map((code) => ({ code, description: PERMISSION_DESCRIPTIONS[code] })),
    skipDuplicates: true,
  });
  const permissions = await app.prisma.permission.findMany();
  const idOf = (code: string) => permissions.find((p) => p.code === code)?.id ?? '';
  const systemRole = (code: 'ADMIN' | 'SELLER') =>
    app.prisma.role.create({
      data: {
        code,
        name: DEFAULT_ROLE_PERMISSIONS[code].name,
        description: DEFAULT_ROLE_PERMISSIONS[code].description,
        isSystem: true,
        permissions: {
          create: DEFAULT_ROLE_PERMISSIONS[code].permissions.map((p) => ({
            permissionId: idOf(p),
          })),
        },
      },
    });
  return { admin: await systemRole('ADMIN'), seller: await systemRole('SELLER') };
}

/** Usuario con el rol ADMIN de sistema (todos los permisos). */
async function adminSession(adminRoleId: string) {
  const { user, password } = await createTestUser(app.prisma);
  await app.prisma.userRole.deleteMany({ where: { userId: user.id } });
  await app.prisma.userRole.create({ data: { userId: user.id, roleId: adminRoleId } });
  const { cookie } = await login(app, user.email, password);
  return { user, cookie };
}

async function sessionWith(permissions: Permission[]) {
  const { user, password } = await createTestUser(app.prisma, { permissions });
  const { cookie } = await login(app, user.email, password);
  return { user, cookie };
}

function createRole(cookie: string, payload: unknown) {
  return app.inject({ method: 'POST', url, headers: { cookie }, payload: payload as object });
}

function patchRole(cookie: string, id: string, payload: unknown) {
  return app.inject({
    method: 'PATCH',
    url: `${url}/${id}`,
    headers: { cookie },
    payload: payload as object,
  });
}

async function rolePermissions(roleId: string) {
  const rows = await app.prisma.rolePermission.findMany({
    where: { roleId },
    select: { permission: { select: { code: true } } },
  });
  return rows.map((row) => row.permission.code).sort();
}

describe('acceso a la gestión de roles', () => {
  it('exige sesión (401) en consulta y cambios', async () => {
    for (const request of [
      { method: 'GET' as const, url },
      { method: 'GET' as const, url: `${url}/permissions` },
      { method: 'POST' as const, url, payload: {} },
    ]) {
      expect((await app.inject(request)).statusCode).toBe(401);
    }
  });

  it('consultar exige roles:read y modificar exige roles:manage (403)', async () => {
    const { seller } = await seedRoles();
    const usersOnly = await sessionWith([PERMISSIONS.USERS_READ, PERMISSIONS.USERS_MANAGE]);
    expect(
      (await app.inject({ method: 'GET', url, headers: { cookie: usersOnly.cookie } })).statusCode,
    ).toBe(403);

    const reader = await sessionWith([PERMISSIONS.ROLES_READ, PERMISSIONS.CATALOG_READ]);
    expect(
      (await app.inject({ method: 'GET', url, headers: { cookie: reader.cookie } })).statusCode,
    ).toBe(200);
    const payload = { name: 'Intento', permissions: [PERMISSIONS.CATALOG_READ] };
    expect((await createRole(reader.cookie, payload)).statusCode).toBe(403);
    expect((await patchRole(reader.cookie, seller.id, { description: 'x' })).statusCode).toBe(403);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `${url}/${seller.id}`,
          headers: { cookie: reader.cookie },
        })
      ).statusCode,
    ).toBe(403);
    expect(await app.prisma.role.count({ where: { name: 'Intento' } })).toBe(0);
  });
});

describe('consulta de roles y catálogo de permisos', () => {
  it('lista roles con permisos, permisos bloqueados y número de usuarios', async () => {
    const { admin, seller } = await seedRoles();
    const { cookie } = await adminSession(admin.id);
    const res = await app.inject({ method: 'GET', url, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const roles = res.json().data as {
      id: string;
      code: string;
      isSystem: boolean;
      permissions: string[];
      lockedPermissions: string[];
      userCount: number;
    }[];
    const adminRow = roles.find((role) => role.id === admin.id);
    const sellerRow = roles.find((role) => role.id === seller.id);
    expect(adminRow).toMatchObject({ isSystem: true, userCount: 1 });
    expect(adminRow?.permissions).toEqual([...ALL_PERMISSIONS].sort());
    expect(adminRow?.lockedPermissions).toEqual([...ALL_PERMISSIONS].sort());
    expect(sellerRow).toMatchObject({ isSystem: true, userCount: 0 });
    expect(sellerRow?.lockedPermissions).toEqual(
      [...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions].sort(),
    );
    expect(JSON.stringify(res.json())).not.toMatch(/passwordHash|tokenHash|email/i);
  });

  it('devuelve el catálogo de permisos agrupado por área con textos en español', async () => {
    const { cookie } = await sessionWith([PERMISSIONS.ROLES_READ]);
    const res = await app.inject({ method: 'GET', url: `${url}/permissions`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const areas = res.json().data as {
      label: string;
      permissions: { code: string; description: string }[];
    }[];
    expect(areas.map((area) => area.label)).toContain('Usuarios y roles');
    const codes = areas.flatMap((area) => area.permissions.map((p) => p.code));
    expect(codes.sort()).toEqual([...ALL_PERMISSIONS].sort());
  });
});

describe('alta, edición y baja de roles', () => {
  it('crea un rol personalizado con código propio y lo audita', async () => {
    const { admin } = await seedRoles();
    const { user, cookie } = await adminSession(admin.id);
    const res = await createRole(cookie, {
      name: 'Cajera de turno',
      description: 'Atiende el mostrador',
      permissions: [PERMISSIONS.CATALOG_READ, PERMISSIONS.INVENTORY_READ],
    });
    expect(res.statusCode).toBe(201);
    const role = res.json().data;
    expect(role).toMatchObject({
      code: 'CUSTOM_CAJERA_DE_TURNO',
      name: 'Cajera de turno',
      isSystem: false,
      userCount: 0,
      lockedPermissions: [],
      permissions: [PERMISSIONS.CATALOG_READ, PERMISSIONS.INVENTORY_READ].sort(),
    });
    const log = await app.prisma.auditLog.findFirstOrThrow({
      where: { action: 'role.created', entityId: role.id },
    });
    expect(log.userId).toBe(user.id);
    expect(log.after).toMatchObject({ name: 'Cajera de turno', permissions: role.permissions });

    // Mismo nombre con otras mayúsculas: conflicto (dos roles iguales confunden al asignarlos).
    const duplicate = await createRole(cookie, {
      name: 'CAJERA DE TURNO',
      permissions: [PERMISSIONS.CATALOG_READ],
    });
    expect(duplicate.statusCode).toBe(409);
    // Un nombre distinto con el mismo código base recibe un sufijo: el código nunca se repite.
    const similar = await createRole(cookie, {
      name: 'Cajera de turno!',
      permissions: [PERMISSIONS.CATALOG_READ],
    });
    expect(similar.statusCode).toBe(201);
    expect(similar.json().data.code).toBe('CUSTOM_CAJERA_DE_TURNO_2');
  });

  it('rechaza (400) permisos inexistentes, repetidos, nombre vacío o id inválido', async () => {
    const { admin } = await seedRoles();
    const { cookie } = await adminSession(admin.id);
    for (const payload of [
      { name: 'Rol', permissions: ['ventas:todo'] },
      { name: 'Rol', permissions: [PERMISSIONS.CATALOG_READ, PERMISSIONS.CATALOG_READ] },
      { name: 'Rol', permissions: [] },
      { name: '   ', permissions: [PERMISSIONS.CATALOG_READ] },
    ]) {
      expect((await createRole(cookie, payload)).statusCode).toBe(400);
    }
    expect((await patchRole(cookie, 'no-es-uuid', { name: 'X' })).statusCode).toBe(400);
    expect((await patchRole(cookie, admin.id, {})).statusCode).toBe(400);
    expect(
      await app.prisma.role.count({ where: { isSystem: false, code: { startsWith: 'CUSTOM_' } } }),
    ).toBe(0);
  });

  it('edita nombre y permisos, audita antes/después y la sesión abierta lo refleja al instante', async () => {
    const { admin } = await seedRoles();
    const { cookie } = await adminSession(admin.id);
    const created = (
      await createRole(cookie, { name: 'Consulta', permissions: [PERMISSIONS.CATALOG_READ] })
    ).json().data as { id: string };
    const member = await createTestUser(app.prisma);
    await app.prisma.userRole.create({ data: { userId: member.user.id, roleId: created.id } });
    const memberSession = await login(app, member.user.email, member.password);
    const suppliers = () =>
      app.inject({
        method: 'GET',
        url: '/api/v1/suppliers',
        headers: { cookie: memberSession.cookie },
      });
    expect((await suppliers()).statusCode).toBe(403);

    const updated = await patchRole(cookie, created.id, {
      name: 'Consulta ampliada',
      permissions: [PERMISSIONS.CATALOG_READ, PERMISSIONS.SUPPLIERS_READ],
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data).toMatchObject({ name: 'Consulta ampliada', userCount: 1 });
    // Sin volver a iniciar sesión: los permisos se leen en cada petición.
    expect((await suppliers()).statusCode).toBe(200);

    const log = await app.prisma.auditLog.findFirstOrThrow({
      where: { action: 'role.updated', entityId: created.id },
    });
    expect(log.before).toMatchObject({ name: 'Consulta', permissions: [PERMISSIONS.CATALOG_READ] });
    expect(log.after).toMatchObject({
      name: 'Consulta ampliada',
      permissions: [PERMISSIONS.CATALOG_READ, PERMISSIONS.SUPPLIERS_READ].sort(),
    });

    expect(
      (await patchRole(cookie, created.id, { permissions: [PERMISSIONS.CATALOG_READ] })).statusCode,
    ).toBe(200);
    expect((await suppliers()).statusCode).toBe(403);
  });

  it('elimina un rol sin usuarios y lo audita; uno con usuarios no (422)', async () => {
    const { admin } = await seedRoles();
    const { cookie } = await adminSession(admin.id);
    const role = (
      await createRole(cookie, { name: 'Temporal', permissions: [PERMISSIONS.CATALOG_READ] })
    ).json().data as { id: string };
    const member = await createTestUser(app.prisma, { isActive: false });
    await app.prisma.userRole.create({ data: { userId: member.user.id, roleId: role.id } });
    const del = () =>
      app.inject({ method: 'DELETE', url: `${url}/${role.id}`, headers: { cookie } });

    // También cuenta un usuario inactivo: conserva la asignación por si se reactiva.
    const blocked = await del();
    expect(blocked.statusCode).toBe(422);
    expect(blocked.json().error.message).toMatch(/usuario/);
    expect(await app.prisma.role.count({ where: { id: role.id } })).toBe(1);

    await app.prisma.userRole.deleteMany({ where: { roleId: role.id } });
    expect((await del()).statusCode).toBe(204);
    expect(await app.prisma.role.count({ where: { id: role.id } })).toBe(0);
    expect(await app.prisma.rolePermission.count({ where: { roleId: role.id } })).toBe(0);
    const log = await app.prisma.auditLog.findFirstOrThrow({
      where: { action: 'role.deleted', entityId: role.id },
    });
    expect(log.before).toMatchObject({ name: 'Temporal', permissions: [PERMISSIONS.CATALOG_READ] });
    expect((await del()).statusCode).toBe(404);
  });
});

describe('salvaguardas', () => {
  it('el rol Administrador no pierde permisos, no se renombra ni se elimina', async () => {
    const { admin } = await seedRoles();
    const { cookie } = await adminSession(admin.id);
    for (const payload of [
      { permissions: [PERMISSIONS.CATALOG_READ] },
      { name: 'Jefe' },
      { description: 'Otra' },
    ]) {
      expect((await patchRole(cookie, admin.id, payload)).statusCode).toBe(422);
    }
    const del = await app.inject({
      method: 'DELETE',
      url: `${url}/${admin.id}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(422);

    // Siempre queda al menos un administrador activo con todos los permisos.
    expect(await rolePermissions(admin.id)).toEqual([...ALL_PERMISSIONS].sort());
    expect(
      await app.prisma.user.count({
        where: { isActive: true, roles: { some: { role: { code: 'ADMIN' } } } },
      }),
    ).toBe(1);
    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } });
    expect(me.json().data.permissions).toEqual([...ALL_PERMISSIONS].sort());
    expect(await app.prisma.auditLog.count({ where: { entityId: admin.id } })).toBe(0);
  });

  it('un rol de sistema no se renombra ni pierde sus permisos base, pero admite extras', async () => {
    const { admin, seller } = await seedRoles();
    const { cookie } = await adminSession(admin.id);
    expect((await patchRole(cookie, seller.id, { name: 'Vendedora' })).statusCode).toBe(422);
    const lost = await patchRole(cookie, seller.id, { permissions: [PERMISSIONS.CATALOG_READ] });
    expect(lost.statusCode).toBe(422);
    expect(await rolePermissions(seller.id)).toEqual(
      [...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions].sort(),
    );

    const extra = [...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions, PERMISSIONS.SUPPLIERS_READ];
    // Reenviar el mismo nombre (como hace el formulario) no cuenta como renombrar.
    const ok = await patchRole(cookie, seller.id, { name: seller.name, permissions: extra });
    expect(ok.statusCode).toBe(200);
    expect(await rolePermissions(seller.id)).toEqual([...extra].sort());
    const del = await app.inject({
      method: 'DELETE',
      url: `${url}/${seller.id}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(422);
  });

  it('nadie concede permisos que no tiene: ni a un rol nuevo ni al suyo propio', async () => {
    await seedRoles();
    const manager = await sessionWith([
      PERMISSIONS.ROLES_READ,
      PERMISSIONS.ROLES_MANAGE,
      PERMISSIONS.SUPPLIERS_READ,
    ]);
    const denied = await createRole(manager.cookie, {
      name: 'Auditor',
      permissions: [PERMISSIONS.AUDIT_READ],
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.message).toMatch(/audit:read/);
    expect(
      (
        await createRole(manager.cookie, {
          name: 'Solo proveedores',
          permissions: [PERMISSIONS.SUPPLIERS_READ],
        })
      ).statusCode,
    ).toBe(201);

    const own = await app.prisma.userRole.findFirstOrThrow({ where: { userId: manager.user.id } });
    const before = await rolePermissions(own.roleId);
    const escalate = await patchRole(manager.cookie, own.roleId, {
      permissions: [...before, PERMISSIONS.USERS_MANAGE],
    });
    expect(escalate.statusCode).toBe(403);
    expect(await rolePermissions(own.roleId)).toEqual(before);
  });

  it('al asignar roles a usuarios tampoco se concede un rol con más permisos que los propios', async () => {
    const { admin } = await seedRoles();
    const { cookie: adminCookie } = await adminSession(admin.id);
    const auditor = (
      await createRole(adminCookie, { name: 'Auditor', permissions: [PERMISSIONS.AUDIT_READ] })
    ).json().data as { id: string };
    const manager = await sessionWith([
      PERMISSIONS.USERS_READ,
      PERMISSIONS.USERS_MANAGE,
      PERMISSIONS.ROLES_MANAGE,
    ]);
    const own = await app.prisma.userRole.findFirstOrThrow({ where: { userId: manager.user.id } });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/users/${manager.user.id}/roles`,
      headers: { cookie: manager.cookie },
      payload: { roleIds: [own.roleId, auditor.id] },
    });
    expect(res.statusCode).toBe(403);
    expect(await app.prisma.userRole.count({ where: { roleId: auditor.id } })).toBe(0);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { cookie: manager.cookie },
      payload: {
        email: 'auditor@test.local',
        name: 'Auditor',
        password: 'clave-inicial-123',
        roleIds: [auditor.id],
      },
    });
    expect(created.statusCode).toBe(403);

    // El Administrador sí puede asignarlo.
    const target = await createTestUser(app.prisma);
    const ok = await app.inject({
      method: 'PUT',
      url: `/api/v1/users/${target.user.id}/roles`,
      headers: { cookie: adminCookie },
      payload: { roleIds: [auditor.id] },
    });
    expect(ok.statusCode).toBe(200);
  });
});

describe('permisos exclusivos del Administrador (cash:correct, sales-incidents:manage, settings:manage)', () => {
  it('ni siquiera el Administrador los concede a un rol nuevo o a un rol de sistema', async () => {
    const { admin, seller } = await seedRoles();
    const { cookie } = await adminSession(admin.id);

    for (const permission of [
      PERMISSIONS.CASH_CORRECT,
      PERMISSIONS.SALES_INCIDENTS_MANAGE,
      PERMISSIONS.SETTINGS_MANAGE,
    ]) {
      const created = await createRole(cookie, {
        name: `Supervisor ${permission}`,
        permissions: [PERMISSIONS.CASH_READ, permission],
      });
      expect(created.statusCode).toBe(422);
      expect(created.json().error.details).toEqual({ permissions: [permission] });

      const patched = await patchRole(cookie, seller.id, {
        permissions: [...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions, permission],
      });
      expect(patched.statusCode).toBe(422);
    }

    expect(await app.prisma.role.count({ where: { code: { startsWith: 'CUSTOM_' } } })).toBe(0);
    expect(await rolePermissions(seller.id)).toEqual(
      [...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions].sort(),
    );
    expect(await app.prisma.auditLog.count({ where: { action: { startsWith: 'role.' } } })).toBe(0);

    // Los demás permisos de ventas y caja sí se asignan por pantalla.
    const cashier = await createRole(cookie, {
      name: 'Cajera',
      permissions: [PERMISSIONS.CASH_READ, PERMISSIONS.CASH_OPEN, PERMISSIONS.CASH_CLOSE],
    });
    expect(cashier.statusCode).toBe(201);
  });

  it('el catálogo de permisos los marca como exclusivos para que la pantalla los deshabilite', async () => {
    const { admin } = await seedRoles();
    const { cookie } = await adminSession(admin.id);
    const res = await app.inject({ method: 'GET', url: `${url}/permissions`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const flags = (
      res.json().data as { permissions: { code: string; adminOnly: boolean }[] }[]
    ).flatMap((area) => area.permissions);
    expect(
      flags
        .filter((p) => p.adminOnly)
        .map((p) => p.code)
        .sort(),
    ).toEqual(
      [
        PERMISSIONS.CASH_CORRECT,
        PERMISSIONS.SALES_INCIDENTS_MANAGE,
        PERMISSIONS.SETTINGS_MANAGE,
      ].sort(),
    );
  });
});
