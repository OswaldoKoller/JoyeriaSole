import type { GlobalInventoryMovement, InitialStockInput, InventoryItem } from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';

type InventoryList = {
  data: InventoryItem[];
  meta: { page: number; pageSize: number; total: number };
};
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
    pageSize: '25',
    q,
    level,
    initialOnly: String(initialOnly),
  });
  return useQuery({
    queryKey: ['inventory', page, q, level, initialOnly],
    queryFn: () => api.get<InventoryList>(`/inventory?${params}`),
  });
}

export function useAllInventoryMovements(page: number) {
  return useQuery({
    queryKey: ['inventory-movements', 'all', page],
    queryFn: () =>
      api.get<{
        data: GlobalInventoryMovement[];
        meta: { page: number; pageSize: number; total: number };
      }>(`/inventory/movements?page=${page}&pageSize=25`),
  });
}

export function useInventoryMovements(variantId: string | null) {
  return useQuery({
    queryKey: ['inventory-movements', variantId],
    queryFn: () => api.get<MovementList>(`/inventory/${variantId}/movements`),
    enabled: !!variantId,
  });
}

export function useInitialStock() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: InitialStockInput }) =>
      api.post(`/inventory/${variantId}/initial`, input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['inventory'] });
      await client.invalidateQueries({ queryKey: ['inventory-movements'] });
      await client.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
