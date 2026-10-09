import type { LightMyRequestResponse } from 'fastify';
import { buildApp, type App } from '../../src/app.ts';
import { testEnv } from './test-env.ts';

export async function buildTestApp(configure?: (app: App) => void | Promise<void>) {
  const app = await buildApp(testEnv());
  await configure?.(app);
  await app.ready();
  return app;
}

/** Inicia sesión y devuelve la cabecera Cookie lista para reutilizar en `inject`. */
export async function login(app: App, email: string, password: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
  return { response, cookie: cookieHeader(response) };
}

export function cookieHeader(response: LightMyRequestResponse): string {
  return response.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}
