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

export function useAllInventoryMovements(page: number) {
  return useListQuery(['inventory-movements', 'all', page], () =>
    api.get<Paged<GlobalInventoryMovement>>(
      `/inventory/movements?page=${page}&pageSize=${PAGE_SIZE}`,
    ),
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
