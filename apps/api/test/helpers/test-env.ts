import { loadEnv, type Env } from '../../src/config/env.ts';

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL no está definida (ver .env.example)');
  }
  // Salvaguarda: jamás correr pruebas destructivas contra una base que no sea de test.
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new Error('TEST_DATABASE_URL no es una URL válida');
  }
  if (
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    target.pathname !== '/joyeria_test' ||
    [...target.searchParams].some(([key, value]) => key !== 'schema' || value !== 'public')
  ) {
    throw new Error(
      'TEST_DATABASE_URL debe apuntar a localhost/joyeria_test con schema public; usar npm run qa',
    );
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
