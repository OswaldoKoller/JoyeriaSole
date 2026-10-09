import { execSync } from 'node:child_process';
import path from 'node:path';
import { testDatabaseUrl } from './test-env.ts';

/** Aplica las migraciones a la BD de pruebas una vez antes de toda la suite de integración. */
export default function setup() {
  const url = testDatabaseUrl();
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
