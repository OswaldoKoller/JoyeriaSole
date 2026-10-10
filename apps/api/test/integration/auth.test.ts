import { PERMISSIONS } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';

describe('autenticación y autorización', () => {
  let app: App;

  beforeEach(async () => {
    app = await buildTestApp((instance) => {
      // Ruta solo de prueba para verificar la protección por permisos.
      instance.get(
        '/api/v1/__test/audit',
        { preHandler: instance.requirePermission(PERMISSIONS.AUDIT_READ) },
        async () => ({ data: 'ok' }),
      );
    });
    await resetDatabase(app.prisma);
  });
  afterEach(() => app.close());

  it('inicia sesión con cookie httpOnly y SameSite=Strict, y expone /me', async () => {
    const { user, password } = await createTestUser(app.prisma, {
      permissions: [PERMISSIONS.CATALOG_READ],
    });

    const { response, cookie } = await login(app, user.email, password);
    expect(response.statusCode).toBe(204);
    const sessionCookie = response.cookies[0]!;
    expect(sessionCookie.httpOnly).toBe(true);
    expect(sessionCookie.sameSite).toBe('Strict');

    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().data).toMatchObject({ email: user.email, permissions: ['catalog:read'] });

    const stored = await app.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(sessionCookie.value).not.toContain(stored.tokenHash); // en BD solo el hash
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBeGreaterThan(
      3 * 60 * 60 * 1000 - 5_000,
    );
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBeLessThan(
      3 * 60 * 60 * 1000 + 5_000,
    );
  });

  it('rechaza credenciales inválidas con mensaje genérico y lo audita', async () => {
    const { user } = await createTestUser(app.prisma);

    const wrongPassword = await login(app, user.email, 'incorrecta');
    const unknownUser = await login(app, 'nadie@test.local', 'incorrecta');

    for (const { response } of [wrongPassword, unknownUser]) {
      expect(response.statusCode).toBe(401);
      expect(response.json().error.message).toBe('Correo o contraseña incorrectos');
    }
    expect(await app.prisma.auditLog.count({ where: { action: 'auth.login_failed' } })).toBe(2);
  });

  it('no permite ingresar a usuarios desactivados', async () => {
    const { user, password } = await createTestUser(app.prisma, { isActive: false });
    const { response } = await login(app, user.email, password);
    expect(response.statusCode).toBe(401);
  });

  it('el logout revoca la sesión en el servidor', async () => {
    const { user, password } = await createTestUser(app.prisma);
    const { cookie } = await login(app, user.email, password);

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(204);

    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('protege rutas por permiso: 401 sin sesión, 403 sin permiso, 200 con permiso', async () => {
    const url = '/api/v1/__test/audit';
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);

    const seller = await createTestUser(app.prisma, { permissions: [PERMISSIONS.CATALOG_READ] });
    const sellerSession = await login(app, seller.user.email, seller.password);
    const denied = await app.inject({
      method: 'GET',
      url,
      headers: { cookie: sellerSession.cookie },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('FORBIDDEN');

    const auditor = await createTestUser(app.prisma, { permissions: [PERMISSIONS.AUDIT_READ] });
    const auditorSession = await login(app, auditor.user.email, auditor.password);
    const allowed = await app.inject({
      method: 'GET',
      url,
      headers: { cookie: auditorSession.cookie },
    });
    expect(allowed.statusCode).toBe(200);
  });

  it('rechaza cookies de sesión manipuladas', async () => {
    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: 'sid=token-inventado.firma-falsa' },
    });
    expect(me.statusCode).toBe(401);
  });

  it('bloquea peticiones que modifican datos desde un origen no permitido (CSRF)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: 'https://sitio-malicioso.com' },
      payload: { email: 'a@b.com', password: 'x' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('valida el cuerpo y devuelve errores de validación con formato estándar', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'no-es-correo' },
    });
    expect(response.statusCode).toBe(400);
    const { error } = response.json();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details.map((d: { field: string }) => d.field)).toEqual(
      expect.arrayContaining(['body.email', 'body.password']),
    );
  });

  it('cambia contraseña propia, revoca sesiones y exige nuevo login', async () => {
    const { user, password } = await createTestUser(app.prisma);
    const first = await login(app, user.email, password);
    const second = await login(app, user.email, password);
    const url = '/api/v1/auth/change-password';
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          payload: {
            currentPassword: password,
            newPassword: 'nueva-clave-segura-123',
          },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          headers: { cookie: first.cookie },
          payload: {
            currentPassword: 'equivocada',
            newPassword: 'nueva-clave-segura-123',
          },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          headers: { cookie: first.cookie },
          payload: {
            currentPassword: password,
            newPassword: 'corta',
          },
        })
      ).statusCode,
    ).toBe(400);

    const changed = await app.inject({
      method: 'POST',
      url,
      headers: { cookie: first.cookie },
      payload: {
        currentPassword: password,
        newPassword: 'nueva-clave-segura-123',
      },
    });
    expect(changed.statusCode).toBe(204);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: { cookie: second.cookie },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      await app.prisma.session.count({ where: { userId: user.id, revokedAt: { not: null } } }),
    ).toBe(2);
    expect((await login(app, user.email, password)).response.statusCode).toBe(401);
    expect((await login(app, user.email, 'nueva-clave-segura-123')).response.statusCode).toBe(204);
    const audit = await app.prisma.auditLog.findFirstOrThrow({
      where: { action: 'user.password_changed' },
    });
    expect(
      JSON.stringify({ before: audit.before, after: audit.after, metadata: audit.metadata }),
    ).not.toContain('nueva-clave-segura-123');
  });
});
