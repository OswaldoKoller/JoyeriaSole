import { describe, expect, it } from 'vitest';
import { loadEnv, startupWarnings } from '../../src/config/env.ts';

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
    expect(env.SESSION_TTL_HOURS).toBe(8);
  });

  it('en producción las cookies son Secure por defecto', () => {
    expect(loadEnv({ ...base, NODE_ENV: 'production' }).COOKIE_SECURE).toBe(true);
  });

  it('usa PORT del hosting si API_PORT no está definido', () => {
    expect(loadEnv({ ...base, PORT: '10000' }).API_PORT).toBe(10000);
    expect(loadEnv({ ...base, PORT: '10000', API_PORT: '4000' }).API_PORT).toBe(4000);
  });

  it('el límite de login es 10 por defecto y configurable', () => {
    expect(loadEnv(base).LOGIN_RATE_LIMIT_MAX).toBe(10);
    expect(loadEnv({ ...base, LOGIN_RATE_LIMIT_MAX: '500' }).LOGIN_RATE_LIMIT_MAX).toBe(500);
    expect(() => loadEnv({ ...base, LOGIN_RATE_LIMIT_MAX: '0' })).toThrow(/LOGIN_RATE_LIMIT_MAX/);
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

  it('rechaza una duración distinta de las ocho horas aprobadas', () => {
    expect(() => loadEnv({ ...base, SESSION_TTL_HOURS: '3' })).toThrow(/SESSION_TTL_HOURS/);
  });
});

describe('TRUST_PROXY_HOPS', () => {
  it('por defecto no se confía en ningún proxy', () => {
    expect(loadEnv(base).TRUST_PROXY_HOPS).toBe(0);
  });

  it('acepta un número de saltos pequeño y rechaza valores inválidos', () => {
    expect(loadEnv({ ...base, TRUST_PROXY_HOPS: '1' }).TRUST_PROXY_HOPS).toBe(1);
    expect(() => loadEnv({ ...base, TRUST_PROXY_HOPS: '-1' })).toThrow(/TRUST_PROXY_HOPS/);
    expect(() => loadEnv({ ...base, TRUST_PROXY_HOPS: '1.5' })).toThrow(/TRUST_PROXY_HOPS/);
    expect(() => loadEnv({ ...base, TRUST_PROXY_HOPS: '99' })).toThrow(/TRUST_PROXY_HOPS/);
  });

  it('el antiguo TRUST_PROXY=true se rechaza con un mensaje claro (ruptura de compatibilidad)', () => {
    expect(() => loadEnv({ ...base, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY_HOPS/);
    expect(loadEnv({ ...base, TRUST_PROXY: 'false' }).TRUST_PROXY_HOPS).toBe(0);
  });
});

describe('avisos de arranque', () => {
  it('advierte de COOKIE_SECURE=false en producción y de nada más', () => {
    const insecure = loadEnv({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'false' });
    expect(startupWarnings(insecure)).toEqual([expect.stringMatching(/COOKIE_SECURE=false/)]);
    expect(startupWarnings(loadEnv({ ...base, NODE_ENV: 'production' }))).toEqual([]);
    expect(startupWarnings(loadEnv({ ...base, COOKIE_SECURE: 'false' }))).toEqual([]);
  });
});
