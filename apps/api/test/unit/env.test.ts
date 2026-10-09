import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.ts';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  AUTH_SECRET: 'x'.repeat(32),
};

describe('configuración de entorno', () => {
  it('aplica valores por defecto seguros', () => {
    const env = loadEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3000);
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.CORS_ORIGIN).toEqual(['http://localhost:5173']);
  });

  it('en producción las cookies son Secure por defecto', () => {
    expect(loadEnv({ ...base, NODE_ENV: 'production' }).COOKIE_SECURE).toBe(true);
  });

  it('usa PORT del hosting si API_PORT no está definido', () => {
    expect(loadEnv({ ...base, PORT: '10000' }).API_PORT).toBe(10000);
    expect(loadEnv({ ...base, PORT: '10000', API_PORT: '4000' }).API_PORT).toBe(4000);
  });

  it('acepta varios orígenes CORS separados por coma', () => {
    const env = loadEnv({ ...base, CORS_ORIGIN: 'https://a.com, https://b.com' });
    expect(env.CORS_ORIGIN).toEqual(['https://a.com', 'https://b.com']);
  });

  it('falla al arrancar si falta un secreto o es demasiado corto', () => {
    expect(() => loadEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(/AUTH_SECRET/);
    expect(() => loadEnv({ ...base, AUTH_SECRET: 'corto' })).toThrow(/AUTH_SECRET/);
  });

  it('rechaza una DATABASE_URL que no sea PostgreSQL', () => {
    expect(() => loadEnv({ ...base, DATABASE_URL: 'mysql://u:p@h/db' })).toThrow(/DATABASE_URL/);
  });
});
