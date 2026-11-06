import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

export type { PrismaClient };

/**
 * Valores por defecto de las transacciones interactivas: Prisma usa 5 s de ejecución y 2 s de
 * espera de conexión, insuficientes para operaciones por línea (confirmar un ingreso grande) con
 * una base remota. Las operaciones más largas (conteos) fijan sus propios 60 s.
 */
export const TRANSACTION_OPTIONS = { timeout: 30_000, maxWait: 10_000 } as const;

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    transactionOptions: { ...TRANSACTION_OPTIONS },
  });
}
