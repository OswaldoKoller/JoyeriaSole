import { setTimeout as sleep } from 'node:timers/promises';
import type { Prisma } from '../../src/generated/prisma/client.ts';
import type { PrismaClient } from '../../src/lib/prisma.ts';

/** Cantidad de sesiones de ESTA base de datos esperando un bloqueo (de fila o de transacción). */
export async function blockedSessions(prisma: PrismaClient): Promise<number> {
  const [row] = await prisma.$queryRaw<{ blocked: number }[]>`
    SELECT COUNT(*)::int AS blocked
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND wait_event_type = 'Lock'`;
  return row?.blocked ?? 0;
}

/**
 * Lanza una operación y espera a que quede BLOQUEADA (suba el número de sesiones en espera por
 * encima de `blockedBefore`) o termine, lo que ocurra primero. Así las pruebas de concurrencia
 * ordenan las operaciones sin depender de pausas fijas. Devuelve la promesa de la operación.
 */
export async function startAndWait<T>(
  prisma: PrismaClient,
  operation: () => Promise<T>,
  blockedBefore: number,
  timeoutMs = 5_000,
): Promise<{ promise: Promise<T>; blocked: boolean }> {
  const state = { settled: false };
  const promise = operation().finally(() => {
    state.settled = true;
  });
  const deadline = Date.now() + timeoutMs;
  while (!state.settled && Date.now() < deadline) {
    if ((await blockedSessions(prisma)) > blockedBefore) return { promise, blocked: true };
    await sleep(25);
  }
  return { promise, blocked: false };
}

/**
 * Retiene `FOR UPDATE` sobre una variante en una transacción propia hasta llamar a `release()`;
 * entonces ejecuta `work` (si se indica) dentro de esa misma transacción y confirma. Simula una
 * operación de stock en curso que ya tomó el bloqueo de la variante.
 */
export function holdVariantLock<T = void>(
  prisma: PrismaClient,
  variantId: string,
  work?: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  const finished = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${variantId}::uuid FOR UPDATE`;
    markReady();
    await gate;
    return work ? await work(tx) : undefined;
  });
  return {
    /** Resuelve cuando el bloqueo ya está tomado (o rechaza si la transacción falló antes). */
    ready: Promise.race([ready, finished.then(() => undefined)]),
    release,
    finished,
  };
}
