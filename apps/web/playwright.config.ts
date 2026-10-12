import { defineConfig, devices } from '@playwright/test';
import { testDatabaseUrl } from '../api/test/helpers/test-env.ts';

const databaseUrl = testDatabaseUrl();
if (!process.env.SEED_ADMIN_EMAIL || !process.env.SEED_ADMIN_PASSWORD || !process.env.AUTH_SECRET) {
  throw new Error('E2E necesita un usuario de pruebas y AUTH_SECRET; ejecutar npm run qa:e2e');
}
const webUrl = 'http://localhost:5174';

/**
 * Pruebas E2E: servidores exclusivos y TEST_DATABASE_URL explícita.
 * Ejecutar con npm run qa:e2e; requiere una vez:
 *   npx playwright install chromium
 */
export default defineConfig({
  testDir: './e2e',
  // Los recorridos con varios inicios de sesión (Argon2) superan los 30 s por defecto en equipos lentos.
  timeout: 60_000,
  // 5 s por aserción es poco con el hash Argon2 de los inicios de sesión y varias verificaciones
  // simultáneas en un equipo cargado: producía falsos fallos intermitentes. No relaja ninguna aserción.
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // Todos los archivos comparten una sola base de datos y un solo servidor: en serie, para que los
  // totales del dashboard sean exactos y los inicios de sesión (Argon2) no compitan por CPU.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: webUrl,
    trace: 'retain-on-failure',
    locale: 'es-BO',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node --import tsx apps/api/src/server.ts',
      cwd: '../..',
      url: 'http://localhost:3001/api/v1/health',
      env: {
        DATABASE_URL: databaseUrl,
        NODE_ENV: 'test',
        API_HOST: '127.0.0.1',
        API_PORT: '3001',
        CORS_ORIGIN: webUrl,
        FRONTEND_URL: webUrl,
        COOKIE_SECURE: 'false',
        TRUST_PROXY: 'false',
        // La suite inicia sesión muchas veces desde una sola IP; en producción el límite es 10.
        LOGIN_RATE_LIMIT_MAX: '1000',
        WEB_DIST_DIR: '',
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -w @joyeria/web -- --port 5174 --strictPort',
      cwd: '../..',
      url: webUrl,
      env: { API_PROXY_TARGET: 'http://127.0.0.1:3001' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
