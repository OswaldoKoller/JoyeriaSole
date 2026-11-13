import diagnosticsChannel from 'node:diagnostics_channel';
import { PERMISSIONS } from '@joyeria/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../../src/app.ts';
import { login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';
import { testEnv } from '../helpers/test-env.ts';

const API = '/api/v1';
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
const METHODS = new Set<string>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const SAMPLE_UUID = '00000000-0000-4000-8000-000000000001';

/** Construye una app con variables de entorno propias de la prueba. */
async function appWith(overrides: Record<string, string> = {}) {
  const app = await buildApp(testEnv(overrides));
  await app.ready();
  return app;
}

describe('cobertura de autenticación en TODAS las rutas', () => {
  const routes = new Map<string, { method: Method; url: string }>();
  let app: App;

  const onInit = (message: unknown) => {
    const { fastify } = message as { fastify: FastifyInstance };
    fastify.addHook('onRoute', (route) => {
      for (const method of [route.method].flat()) {
        const upper = method.toUpperCase();
        if (!METHODS.has(upper)) continue; // HEAD y OPTIONS los añaden Fastify y CORS
        routes.set(`${upper} ${route.url}`, { method: upper as Method, url: route.url });
      }
    });
  };

  beforeAll(async () => {
    diagnosticsChannel.subscribe('fastify.initialization', onInit);
    app = await appWith();
    await resetDatabase(app.prisma);
  });
  afterAll(async () => {
    diagnosticsChannel.unsubscribe('fastify.initialization', onInit);
    await app.close();
  });

  const concrete = (url: string) => url.replace(/:[A-Za-z]+/g, SAMPLE_UUID).replace(/\*/g, 'x');
  const PUBLIC = new Set([`GET ${API}/health`, `POST ${API}/auth/login`]);
  const bodyFor = (method: Method) => (method === 'GET' || method === 'DELETE' ? undefined : {});

  it('enumera las rutas registradas y solo /health y /auth/login son públicas', async () => {
    expect(routes.size).toBeGreaterThan(60);
    for (const key of PUBLIC) expect(routes.has(key)).toBe(true);

    const unguarded: string[] = [];
    for (const [key, route] of routes) {
      if (PUBLIC.has(key)) continue;
      const response = await app.inject({
        method: route.method,
        url: concrete(route.url),
        payload: bodyFor(route.method),
      });
      if (response.statusCode !== 401) unguarded.push(`${key} -> ${response.statusCode}`);
    }
    expect(unguarded).toEqual([]);
  });

  it('una sesión sin permisos recibe 403 en toda ruta de negocio', async () => {
    const { user, password } = await createTestUser(app.prisma);
    const { cookie } = await login(app, user.email, password);
    const leaking: string[] = [];
    for (const [key, route] of routes) {
      if (PUBLIC.has(key) || route.url.startsWith(`${API}/auth/`)) continue;
      const response = await app.inject({
        method: route.method,
        url: concrete(route.url),
        headers: { cookie },
        payload: bodyFor(route.method),
      });
      if (response.statusCode !== 403) leaking.push(`${key} -> ${response.statusCode}`);
    }
    expect(leaking).toEqual([]);
  });
});

describe('cabeceras, cookies y transporte en producción', () => {
  let app: App;
  beforeAll(async () => {
    app = await appWith({ NODE_ENV: 'production', COOKIE_SECURE: 'true' });
    await resetDatabase(app.prisma);
  });
  afterAll(() => app.close());

  it('las respuestas JSON llevan CSP, nosniff, HSTS y no se cachean', async () => {
    const response = await app.inject({ method: 'GET', url: `${API}/health` });
    expect(response.statusCode).toBe(200);
    const csp = String(response.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(String(response.headers['strict-transport-security'])).toMatch(/max-age=31536000/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('los errores JSON y los 404 de la API tampoco se cachean', async () => {
    const notFound = await app.inject({ method: 'GET', url: `${API}/no-existe` });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.headers['cache-control']).toBe('no-store');
    const unauthorized = await app.inject({ method: 'GET', url: `${API}/auth/me` });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.headers['cache-control']).toBe('no-store');
  });

  it('la cookie de sesión es __Host-, HttpOnly, Secure, SameSite=Strict y sin Domain', async () => {
    const { user, password } = await createTestUser(app.prisma);
    const { response, cookie } = await login(app, user.email, password);
    expect(response.statusCode).toBe(200);
    const header = String(response.headers['set-cookie']);
    expect(header).toMatch(/^__Host-sid=/);
    expect(header).toMatch(/;\s*HttpOnly/i);
    expect(header).toMatch(/;\s*Secure/i);
    expect(header).toMatch(/;\s*SameSite=Strict/i);
    expect(header).toMatch(/;\s*Path=\//i);
    expect(header).not.toMatch(/Domain=/i);

    // Al cerrar sesión el borrado lleva los mismos atributos (con __Host- el navegador lo exige).
    const logout = await app.inject({
      method: 'POST',
      url: `${API}/auth/logout`,
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(204);
    const cleared = String(logout.headers['set-cookie']);
    expect(cleared).toMatch(/^__Host-sid=;/);
    expect(cleared).toMatch(/;\s*Secure/i);
    expect(cleared).toMatch(/;\s*HttpOnly/i);
    expect(cleared).toMatch(/;\s*SameSite=Strict/i);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/i);
  });

  it('configura tiempos de petición, conexión y keep-alive explícitos', () => {
    expect(app.server.requestTimeout).toBe(120_000);
    expect(app.server.timeout).toBe(120_000);
    expect(app.server.keepAliveTimeout).toBe(65_000);
  });
});

describe('protección CSRF por Origin', () => {
  let app: App;
  beforeAll(async () => {
    app = await appWith();
    await resetDatabase(app.prisma);
  });
  afterAll(() => app.close());

  it('rechaza Origin «null» y orígenes ajenos en todo método que modifica datos', async () => {
    const { user, password } = await createTestUser(app.prisma, {
      permissions: [PERMISSIONS.USERS_MANAGE, PERMISSIONS.SUPPLIERS_MANAGE],
    });
    const { cookie } = await login(app, user.email, password);
    const origins = ['null', 'https://sitio-malicioso.example', 'http://localhost:5173.evil.io'];
    for (const origin of origins) {
      for (const [method, url] of [
        ['POST', `${API}/suppliers`],
        ['PATCH', `${API}/suppliers/${SAMPLE_UUID}`],
        ['PUT', `${API}/users/${SAMPLE_UUID}/roles`],
        ['DELETE', `${API}/suppliers/${SAMPLE_UUID}`],
        ['POST', `${API}/auth/logout`],
      ] as const) {
        const response = await app.inject({
          method,
          url,
          headers: { cookie, origin },
          payload: method === 'DELETE' ? undefined : {},
        });
        expect(response.statusCode, `${method} ${url} con Origin ${origin}`).toBe(403);
        expect(response.json().error.message).toBe('Origen no permitido');
      }
    }
    expect(await app.prisma.session.count({ where: { revokedAt: { not: null } } })).toBe(0);
  });

  it('rechaza una subida multipart entre orígenes antes de procesarla', async () => {
    const boundary = '----prueba';
    const response = await app.inject({
      method: 'POST',
      url: `${API}/products/${SAMPLE_UUID}/photos`,
      headers: {
        origin: 'https://sitio-malicioso.example',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\nxx\r\n--${boundary}--\r\n`,
    });
    expect(response.statusCode).toBe(403);
  });

  it('sin cabecera Origin (clientes que no son navegador) sigue exigiéndose la sesión', async () => {
    const withoutOrigin = await app.inject({
      method: 'POST',
      url: `${API}/suppliers`,
      payload: {},
    });
    expect(withoutOrigin.statusCode).toBe(401);
    const allowed = await app.inject({
      method: 'POST',
      url: `${API}/suppliers`,
      headers: { origin: 'http://localhost:5173' },
      payload: {},
    });
    expect(allowed.statusCode).toBe(401);
  });
});

describe('límite de intentos de login', () => {
  const credentials = { email: 'nadie@test.local', password: 'clave-equivocada-123' };
  let app: App | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  const attempt = (instance: App, headers: Record<string, string> = {}) =>
    instance.inject({ method: 'POST', url: `${API}/auth/login`, headers, payload: credentials });

  it('responde 429 con el código RATE_LIMITED al superar el máximo por IP', async () => {
    app = await appWith({ LOGIN_RATE_LIMIT_MAX: '3' });
    const statuses: number[] = [];
    for (let index = 0; index < 5; index += 1) statuses.push((await attempt(app)).statusCode);
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
    const blocked = await attempt(app);
    expect(blocked.json().error.code).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('sin TRUST_PROXY_HOPS un X-Forwarded-For falsificado NO evade el límite', async () => {
    app = await appWith({ LOGIN_RATE_LIMIT_MAX: '3', TRUST_PROXY_HOPS: '0' });
    const statuses: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const forged = { 'x-forwarded-for': `203.0.113.${index + 1}` };
      statuses.push((await attempt(app, forged)).statusCode);
    }
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
  });

  it('con TRUST_PROXY_HOPS=1 cuenta la IP añadida por el proxy propio, no las falsas del cliente', async () => {
    app = await appWith({ LOGIN_RATE_LIMIT_MAX: '3', TRUST_PROXY_HOPS: '1' });
    const statuses: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      // El cliente antepone IP falsas; el proxy propio añade al final la IP real (198.51.100.7).
      const forged = { 'x-forwarded-for': `203.0.113.${index + 1}, 198.51.100.7` };
      statuses.push((await attempt(app, forged)).statusCode);
    }
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
    // Otro cliente real (otra IP añadida por el proxy) tiene su propio contador.
    expect((await attempt(app, { 'x-forwarded-for': '198.51.100.8' })).statusCode).toBe(401);
  });
});

describe('límite global por IP', () => {
  it('usa RATE_LIMIT_MAX: pasado el máximo responde 429 RATE_LIMITED en cualquier ruta', async () => {
    const app = await appWith({ RATE_LIMIT_MAX: '4' });
    try {
      const statuses: number[] = [];
      for (let index = 0; index < 6; index += 1) {
        statuses.push((await app.inject({ method: 'GET', url: `${API}/auth/me` })).statusCode);
      }
      expect(statuses).toEqual([401, 401, 401, 401, 429, 429]);
    } finally {
      await app.close();
    }
  });

  it('por defecto permite 300 peticiones por minuto antes de bloquear', async () => {
    const app = await appWith();
    try {
      let blockedAt = 0;
      for (let index = 1; index <= 301 && blockedAt === 0; index += 1) {
        const response = await app.inject({ method: 'GET', url: `${API}/auth/me` });
        if (response.statusCode === 429) blockedAt = index;
      }
      expect(blockedAt).toBe(301);
    } finally {
      await app.close();
    }
  });
});

describe('límite propio de /health', () => {
  it('permite 60 consultas por minuto y luego responde 429', async () => {
    const app = await appWith();
    try {
      for (let index = 0; index < 60; index += 1) {
        const response = await app.inject({ method: 'GET', url: `${API}/health` });
        expect(response.statusCode).toBe(200);
      }
      expect((await app.inject({ method: 'GET', url: `${API}/health` })).statusCode).toBe(429);
    } finally {
      await app.close();
    }
  });
});

describe('cookie de sesión con COOKIE_SECURE=true fuera de producción', () => {
  it('el cierre de sesión y el cambio de clave borran la cookie con Secure/HttpOnly/SameSite', async () => {
    const app = await appWith({ COOKIE_SECURE: 'true' });
    try {
      await resetDatabase(app.prisma);
      const { user, password } = await createTestUser(app.prisma);
      const first = await login(app, user.email, password);
      expect(String(first.response.headers['set-cookie'])).toMatch(/^__Host-sid=/);
      const logout = await app.inject({
        method: 'POST',
        url: `${API}/auth/logout`,
        headers: { cookie: first.cookie },
      });
      const cleared = String(logout.headers['set-cookie']);
      expect(cleared).toMatch(/Secure/i);
      expect(cleared).toMatch(/HttpOnly/i);
      expect(cleared).toMatch(/SameSite=Strict/i);

      const second = await login(app, user.email, password);
      const change = await app.inject({
        method: 'POST',
        url: `${API}/auth/change-password`,
        headers: { cookie: second.cookie },
        payload: { currentPassword: password, newPassword: 'nueva-clave-segura-123' },
      });
      expect(change.statusCode).toBe(204);
      expect(String(change.headers['set-cookie'])).toMatch(/Secure/i);
    } finally {
      await app.close();
    }
  });
});

describe('sesión por petición sin caché (F-01)', () => {
  let app: App;
  beforeAll(async () => {
    app = await appWith();
  });
  afterAll(() => app.close());

  it('los cambios de permisos y la revocación rigen en la petición siguiente', async () => {
    await resetDatabase(app.prisma);
    const { user, password } = await createTestUser(app.prisma, {
      permissions: [PERMISSIONS.USERS_READ],
    });
    const { cookie } = await login(app, user.email, password);
    const list = () => app.inject({ method: 'GET', url: `${API}/users`, headers: { cookie } });
    expect((await list()).statusCode).toBe(200);

    // Se le quita el permiso al rol: la misma sesión pierde el acceso de inmediato.
    await app.prisma.rolePermission.deleteMany({
      where: { role: { users: { some: { userId: user.id } } } },
    });
    expect((await list()).statusCode).toBe(403);

    // Se desactiva a la persona: la sesión deja de valer de inmediato.
    await app.prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect((await list()).statusCode).toBe(401);
  });

  it('la sesión revocada deja de valer de inmediato', async () => {
    await resetDatabase(app.prisma);
    const { user, password } = await createTestUser(app.prisma);
    const { cookie } = await login(app, user.email, password);
    const me = () => app.inject({ method: 'GET', url: `${API}/auth/me`, headers: { cookie } });
    expect((await me()).statusCode).toBe(200);
    await app.prisma.session.updateMany({ data: { revokedAt: new Date() } });
    expect((await me()).statusCode).toBe(401);
  });
});

describe('transacciones interactivas', () => {
  it('toleran más de los 5 s por defecto de Prisma (30 s configurados)', async () => {
    const app = await appWith();
    try {
      const result = await app.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_sleep(5.5)`;
        return 'ok';
      });
      expect(result).toBe('ok');
    } finally {
      await app.close();
    }
  }, 20_000);
});
