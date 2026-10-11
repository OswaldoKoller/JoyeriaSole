import type { InventoryItem } from '@joyeria/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../../lib/api-client.ts';

type Level = 'all' | 'OUT' | 'LOW' | 'OK';
type InventoryPage = {
  data: InventoryItem[];
  meta: { page: number; pageSize: number; total: number };
};

const STALE_MS = 30_000;

function fetchLevel(level: Level, pageSize: number) {
  return api.get<InventoryPage>(`/inventory?page=1&pageSize=${pageSize}&level=${level}`);
}

/**
 * Cuenta variantes por nivel usando solo `meta.total` (pageSize 1): el número es exacto aunque
 * existan miles de piezas. La clave empieza con «inventory» para que una carga de stock inicial
 * refresque el dashboard automáticamente.
 */
function useLevelCount(level: Level, enabled: boolean) {
  return useQuery({
    queryKey: ['inventory', 'dashboard', 'count', level],
    queryFn: () => fetchLevel(level, 1),
    select: (page) => page.meta.total,
    enabled,
    staleTime: STALE_MS,
  });
}

export type StockSummary = {
  total: number;
  ok: number;
  /** Piezas con stock, pero en o por debajo de su mínimo. */
  low: number;
  out: number;
};

export function useStockSummary(enabled: boolean) {
  const all = useLevelCount('all', enabled);
  const out = useLevelCount('OUT', enabled);
  const ok = useLevelCount('OK', enabled);
  const queries = [all, out, ok];

  const summary: StockSummary | null =
    all.data !== undefined && out.data !== undefined && ok.data !== undefined
      ? {
          total: all.data,
          ok: ok.data,
          out: out.data,
          // El filtro «bajo mínimo» de la API también incluye piezas agotadas con mínimo; por eso
          // el tramo exclusivo se obtiene por diferencia, sin contar dos veces.
          low: Math.max(all.data - out.data - ok.data, 0),
        }
      : null;

  return {
    summary,
    isPending: enabled && queries.some((query) => query.isPending),
    isError: queries.some((query) => query.isError),
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
  };
}

/** Piezas que piden atención: sin stock y bajo mínimo (hasta 100 de cada tipo). */
export function useAttentionItems(enabled: boolean) {
  const out = useQuery({
    queryKey: ['inventory', 'dashboard', 'items', 'OUT'],
    queryFn: () => fetchLevel('OUT', 100),
    enabled,
    staleTime: STALE_MS,
  });
  const low = useQuery({
    queryKey: ['inventory', 'dashboard', 'items', 'LOW'],
    queryFn: () => fetchLevel('LOW', 100),
    enabled,
    staleTime: STALE_MS,
  });

  const items = useMemo(() => {
    const byVariant = new Map<string, InventoryItem>();
    for (const item of [...(out.data?.data ?? []), ...(low.data?.data ?? [])]) {
      byVariant.set(item.variantId, item);
    }
    return [...byVariant.values()];
  }, [out.data, low.data]);

  return {
    items,
    isPending: enabled && (out.isPending || low.isPending),
    isError: out.isError || low.isError,
    refetch: () => Promise.all([out.refetch(), low.refetch()]),
  };
}
