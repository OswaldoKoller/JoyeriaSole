/**
 * B-1 (revisión de seguridad): los permisos exclusivos del Administrador (`cash:correct`,
 * `sales-incidents:manage`, `settings:manage`) solo son efectivos con el rol ADMIN. Una concesión
 * anterior a la protección de la pantalla de roles, o hecha por SQL, no sirve, aunque la fila de
 * `role_permissions` siga existiendo.
 */
import { randomUUID } from 'node:crypto';
import { ADMIN_ONLY_PERMISSIONS, PERMISSIONS, ROLES } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { hashPassword } from '../../src/lib/password.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { resetDatabase } from '../helpers/db.ts';

let app: App;
beforeEach(async () => {
  app = await buildTestApp();
  await resetDatabase(app.prisma);
});
afterEach(() => app.close());

/** Usuario con un rol creado DIRECTAMENTE en la base (sin pasar por la pantalla de roles). */
async function userWithDirectRole(roleCode: string, permissions: string[]) {
  const role = await app.prisma.role.upsert({
    where: { code: roleCode },
    update: {},
    create: {
      code: roleCode,
      name: `Rol ${roleCode}`,
      permissions: {
        create: permissions.map((code) => ({
          permission: { connectOrCreate: { where: { code }, create: { code } } },
        })),
      },
    },
  });
  const password = 'clave-de-prueba-123';
  const user = await app.prisma.user.create({
    data: {
      email: `${roleCode.toLowerCase()}-${randomUUID().slice(0, 8)}@test.local`,
      name: `Usuario ${roleCode}`,
      passwordHash: await hashPassword(password),
      roles: { create: { roleId: role.id } },
    },
  });
  const { cookie } = await login(app, user.email, password);
  return { user, role, cookie };
}

describe('permisos exclusivos del Administrador en la autorización', () => {
  it('sin el rol ADMIN no son efectivos aunque estén en role_permissions', async () => {
    const granted = [
      ...ADMIN_ONLY_PERMISSIONS,
      PERMISSIONS.CASH_READ,
      PERMISSIONS.CASH_OPEN,
      PERMISSIONS.CASH_CLOSE,
    ];
    const { role, cookie } = await userWithDirectRole('CUSTOM_SUPERVISOR', granted);

    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } });
    const effective = me.json().data.permissions as string[];
    for (const permission of ADMIN_ONLY_PERMISSIONS) expect(effective).not.toContain(permission);
    expect(effective).toContain(PERMISSIONS.CASH_READ);

    const session = await app.inject({
      method: 'POST',
      url: '/api/v1/cash/sessions',
      headers: { cookie, 'idempotency-key': randomUUID() },
      payload: { openingAmount: '10' },
    });
    expect(session.statusCode).toBe(201);
    const id = session.json().data.id as string;
    const closed = await app.inject({
      method: 'POST',
      url: `/api/v1/cash/sessions/${id}/close`,
      headers: { cookie, 'idempotency-key': randomUUID() },
      payload: { countedCash: '10' },
    });
    expect(closed.statusCode).toBe(200);

    const correction = await app.inject({
      method: 'POST',
      url: `/api/v1/cash/sessions/${id}/corrections`,
      headers: { cookie, 'idempotency-key': randomUUID() },
      payload: { kind: 'NOTE', reason: 'Observación que no debería poder registrar' },
    });
    expect(correction.statusCode).toBe(403);
    for (const url of ['/api/v1/settings/business', '/api/v1/sale-incidents']) {
      expect((await app.inject({ method: 'GET', url, headers: { cookie } })).statusCode, url).toBe(
        403,
      );
    }
    expect(await app.prisma.cashSessionCorrection.count()).toBe(0);

    // No se borró nada de role_permissions: solo se ignora.
    expect(await app.prisma.rolePermission.count({ where: { roleId: role.id } })).toBe(
      granted.length,
    );
  });

  it('con el rol ADMIN sí son efectivos', async () => {
    const { cookie } = await userWithDirectRole(ROLES.ADMIN, [...ADMIN_ONLY_PERMISSIONS]);
    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } });
    for (const permission of ADMIN_ONLY_PERMISSIONS) {
      expect(me.json().data.permissions).toContain(permission);
    }
    const settings = await app.inject({
      method: 'GET',
      url: '/api/v1/settings/business',
      headers: { cookie },
    });
    expect(settings.statusCode).toBe(200);
  });
});
