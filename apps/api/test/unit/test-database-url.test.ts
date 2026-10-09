import { afterEach, describe, expect, it, vi } from 'vitest';
import { testDatabaseUrl } from '../helpers/test-env.ts';

afterEach(() => vi.unstubAllEnvs());

describe('destino de pruebas destructivas', () => {
  it('acepta la base local dedicada con puerto asignado', () => {
    const url = 'postgresql://qa:secret@127.0.0.1:55432/joyeria_test?schema=public';
    vi.stubEnv('TEST_DATABASE_URL', url);
    expect(testDatabaseUrl()).toBe(url);
  });

  it.each([
    'postgresql://qa:secret@localhost/joyeria_dev',
    'postgresql://qa:secret@localhost/customer_test_backup',
    'postgresql://qa:secret@production.example/joyeria_test',
    'postgresql://qa:secret@localhost/joyeria_test?schema=private',
    'postgresql://qa:secret@localhost/joyeria_test?host=production.example',
    'https://localhost/joyeria_test',
    'invalid-secret',
  ])('rechaza destinos ambiguos sin exponer credenciales: caso %#', (url) => {
    vi.stubEnv('TEST_DATABASE_URL', url);
    expect(testDatabaseUrl).toThrow();
    try {
      testDatabaseUrl();
    } catch (error) {
      expect((error as Error).message).not.toContain('secret');
    }
  });

  it('no utiliza DATABASE_URL como sustituto', () => {
    vi.stubEnv('TEST_DATABASE_URL', undefined);
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/joyeria_dev');
    expect(testDatabaseUrl).toThrow('TEST_DATABASE_URL');
  });
});
