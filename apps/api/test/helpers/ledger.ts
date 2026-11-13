import { expect } from 'vitest';
import type { PrismaClient } from '../../src/lib/prisma.ts';

interface Violation {
  variant_id: string;
  movement_id: string | null;
  problem: string;
}

export interface LedgerSummary {
  /** Variantes con al menos un movimiento (las que realmente se verificaron). */
  variantsWithMovements: number;
  movements: number;
}

/**
 * Invariante del libro de inventario (ADR-007). Para CADA variante:
 *   - saldo (`inventory_balances`, 0 si no hay fila) = Σ de sus movimientos;
 *   - saldo = `balance_after` del último movimiento (por `id`);
 *   - cadena continua: el primer `balance_before` es 0 y cada `balance_before` es el
 *     `balance_after` del movimiento anterior; además `balance_after = balance_before + quantity`;
 *   - ningún producto o variante INACTIVE conserva stock (P-22).
 * Falla con la lista de violaciones. Devuelve el resumen para que la prueba compruebe que no
 * verificó un libro vacío por error.
 */
export async function assertLedgerInvariant(prisma: PrismaClient): Promise<LedgerSummary> {
  const chain = await prisma.$queryRaw<Violation[]>`
    WITH ordered AS (
      SELECT id, variant_id, quantity, balance_before, balance_after,
             LAG(balance_after) OVER (PARTITION BY variant_id ORDER BY id) AS previous_after,
             ROW_NUMBER() OVER (PARTITION BY variant_id ORDER BY id) AS position
      FROM inventory_movements
    )
    SELECT variant_id::text AS variant_id, id::text AS movement_id,
           CASE
             WHEN position = 1 AND balance_before <> 0 THEN 'el primer movimiento no parte de cero'
             WHEN position > 1 AND balance_before <> previous_after
               THEN 'balance_before distinto del balance_after anterior'
             ELSE 'balance_after distinto de balance_before + quantity'
           END AS problem
    FROM ordered
    WHERE (position = 1 AND balance_before <> 0)
       OR (position > 1 AND balance_before <> previous_after)
       OR balance_after <> balance_before + quantity
    ORDER BY variant_id, id`;

  const balances = await prisma.$queryRaw<Violation[]>`
    WITH totals AS (
      SELECT variant_id, SUM(quantity)::int AS total,
             (array_agg(balance_after ORDER BY id DESC))[1] AS last_after
      FROM inventory_movements
      GROUP BY variant_id
    ),
    balance AS (
      SELECT v.id AS variant_id, COALESCE(b.quantity, 0) AS quantity
      FROM product_variants v LEFT JOIN inventory_balances b ON b.variant_id = v.id
    )
    SELECT balance.variant_id::text AS variant_id, NULL::text AS movement_id,
           CASE
             WHEN balance.quantity <> COALESCE(totals.total, 0)
               THEN 'saldo ' || balance.quantity || ' distinto de la suma de movimientos '
                    || COALESCE(totals.total, 0)
             ELSE 'saldo ' || balance.quantity || ' distinto del balance_after del último movimiento '
                  || COALESCE(totals.last_after, 0)
           END AS problem
    FROM balance LEFT JOIN totals ON totals.variant_id = balance.variant_id
    WHERE balance.quantity <> COALESCE(totals.total, 0)
       OR balance.quantity <> COALESCE(totals.last_after, 0)
    ORDER BY balance.variant_id`;

  const inactiveWithStock = await prisma.$queryRaw<Violation[]>`
    SELECT v.id::text AS variant_id, NULL::text AS movement_id,
           'variante o producto INACTIVE con saldo ' || b.quantity AS problem
    FROM inventory_balances b
    JOIN product_variants v ON v.id = b.variant_id
    JOIN products p ON p.id = v.product_id
    WHERE b.quantity > 0 AND (v.status = 'INACTIVE' OR p.status = 'INACTIVE')
    ORDER BY v.id`;

  expect({ chain, balances, inactiveWithStock }).toEqual({
    chain: [],
    balances: [],
    inactiveWithStock: [],
  });

  const [summary] = await prisma.$queryRaw<{ variants: number; movements: number }[]>`
    SELECT COUNT(DISTINCT variant_id)::int AS variants, COUNT(*)::int AS movements
    FROM inventory_movements`;
  return {
    variantsWithMovements: summary?.variants ?? 0,
    movements: summary?.movements ?? 0,
  };
}
