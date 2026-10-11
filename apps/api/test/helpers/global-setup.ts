import { execSync } from 'node:child_process';
import path from 'node:path';
import { createPrismaClient } from '../../src/lib/prisma.ts';
import { resetDatabase } from './db.ts';
import { testDatabaseUrl } from './test-env.ts';

/**
 * Aplica las migraciones a la BD de pruebas antes de la suite de integración y, al terminar,
 * la deja VACÍA. Sin esa limpieza final, las filas del último archivo de pruebas sobreviven y
 * contaminan a quien use la misma base después (p. ej. los E2E de `npm run qa`, cuyos totales
 * del dashboard dependen de que solo existan los datos DEMO).
 */
export default function setup() {
  const url = testDatabaseUrl();
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  return async () => {
    const prisma = createPrismaClient(url);
    try {
      await resetDatabase(prisma);
    } finally {
      await prisma.$disconnect();
    }
  };
}
