import type { GlobalInventoryMovement, InitialStockInput, InventoryItem } from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';
import { useAttemptKeys } from '../../lib/idempotency.ts';
import { PAGE_SIZE, useListQuery, type Paged } from '../../lib/paging.ts';

type InventoryList = Paged<InventoryItem>;
type MovementList = {
  data: {
    id: string;
    type: string;
    quantity: number;
    balanceBefore: number;
    balanceAfter: number;
    reason: string | null;
    notes: string | null;
    createdAt: string;
  }[];
  meta: { page: number; pageSize: number; total: number };
};

/** Filtros del historial de movimientos tal como los edita la persona (vacío = sin filtro). */
export interface MovementFormFilters {
  type: string;
  from: string;
  to: string;
}

export const EMPTY_MOVEMENT_FILTERS: MovementFormFilters = { type: '', from: '', to: '' };

/** Parámetros de URL de los filtros no vacíos: los comparten el listado y la exportación CSV. */
export function movementFilterParams(filters: MovementFormFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.type) params.set('type', filters.type);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  return params;
}

/** Ruta de la exportación CSV de saldos con los filtros activos de la pantalla. */
export function balancesExportPath(q: string, level: string): string {
  const params = new URLSearchParams({ level });
  if (q) params.set('q', q);
  return `/inventory/export.csv?${params}`;
}

/** Ruta de la exportación CSV de movimientos con los filtros activos de la pantalla. */
export function movementsExportPath(filters: MovementFormFilters): string {
  const query = movementFilterParams(filters).toString();
  return `/inventory/movements/export.csv${query ? `?${query}` : ''}`;
}

export function useInventory(page: number, q: string, level: string, initialOnly = false) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
    q,
    level,
    initialOnly: String(initialOnly),
  });
  return useListQuery(['inventory', page, q, level, initialOnly], () =>
    api.get<InventoryList>(`/inventory?${params}`),
  );
}

export function useAllInventoryMovements(
  page: number,
  filters: MovementFormFilters = EMPTY_MOVEMENT_FILTERS,
) {
  const params = movementFilterParams(filters);
  params.set('page', String(page));
  params.set('pageSize', String(PAGE_SIZE));
  return useListQuery(
    ['inventory-movements', 'all', page, filters.type, filters.from, filters.to],
    () => api.get<Paged<GlobalInventoryMovement>>(`/inventory/movements?${params}`),
  );
}

export function useInventoryMovements(variantId: string | null) {
  return useQuery({
    queryKey: ['inventory-movements', variantId],
    queryFn: () => api.get<MovementList>(`/inventory/${variantId}/movements`),
    enabled: !!variantId,
  });
}

/** Stock inicial: idempotente con una clave por intento (la misma mientras no cambien los datos). */
export function useInitialStock() {
  const client = useQueryClient();
  const attempt = useAttemptKeys();
  return useMutation({
    mutationFn: (variables: { variantId: string; input: InitialStockInput }) =>
      api.post(`/inventory/${variables.variantId}/initial`, variables.input, {
        idempotencyKey: attempt.keyFor(variables),
      }),
    onSettled: (_data, error) => {
      attempt.settle(error);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['inventory'] });
      await client.invalidateQueries({ queryKey: ['inventory-movements'] });
      await client.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
