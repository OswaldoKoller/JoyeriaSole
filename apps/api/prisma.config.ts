import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// En desarrollo las variables viven en el `.env` de la raíz del monorepo.
// En producción/CI vienen del entorno y este archivo no existe (dotenv lo ignora).
loadEnv({ path: path.resolve(import.meta.dirname, '../../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Sin `env()` estricto: `prisma generate` (postinstall, build de Docker) no necesita la URL.
    // Los comandos que sí conectan (migrate, seed, studio) fallan con un error claro si falta.
    url: process.env.DATABASE_URL ?? '',
  },
});
