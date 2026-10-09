import { loadEnv, type Env } from '../../src/config/env.ts';

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL no está definida (ver .env.example)');
  }
  // Salvaguarda: jamás correr pruebas destructivas contra una base que no sea de test.
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error(`TEST_DATABASE_URL debe apuntar a una base de pruebas (*test*): ${url}`);
  }
  return url;
}

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: testDatabaseUrl(),
    AUTH_SECRET: 'test-secret-que-tiene-mas-de-32-caracteres-ok',
    CORS_ORIGIN: 'http://localhost:5173',
    FRONTEND_URL: 'http://localhost:5173',
    ...overrides,
  });
}
