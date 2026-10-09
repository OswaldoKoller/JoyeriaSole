import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp } from '../helpers/app.ts';

describe('GET /api/v1/health', () => {
  let app: App;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(() => app.close());

  it('responde ok con la base de datos conectada', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', database: 'up' });
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('devuelve 404 con formato de error estándar para rutas inexistentes', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/no-existe' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });
});
