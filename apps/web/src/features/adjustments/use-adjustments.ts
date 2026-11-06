import type {
  AdjustmentDetail,
  AdjustmentReason,
  AdjustmentSummary,
  CreateAdjustmentInput,
  InventoryItem,
  RejectAdjustmentInput,
} from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';
import { PAGE_SIZE, useListQuery, type Paged } from '../../lib/paging.ts';

const key = ['adjustments'] as const;
type Page<T> = Paged<T>;

export interface AdjustmentFilters {
  page: number;
  status: string;
  variantId: string;
  from: string;
  to: string;
}

export function useAdjustments(filters: AdjustmentFilters) {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(PAGE_SIZE),
    status: filters.status,
  });
  if (filters.variantId) query.set('variantId', filters.variantId);
  if (filters.from) query.set('from', filters.from);
  if (filters.to) query.set('to', filters.to);
  return useListQuery([...key, 'list', filters], () =>
    api.get<Page<AdjustmentSummary>>(`/inventory/adjustments?${query}`),
  );
}

export function useAdjustment(id: string) {
  return useQuery({
    queryKey: [...key, 'detail', id],
    queryFn: async () =>
      (await api.get<{ data: AdjustmentDetail }>(`/inventory/adjustments/${id}`)).data,
  });
}

export function useAdjustmentReasons() {
  return useQuery({
    queryKey: [...key, 'reasons'],
    queryFn: async () =>
      (await api.get<{ data: AdjustmentReason[] }>('/inventory/adjustments/reasons')).data,
    staleTime: 5 * 60 * 1000,
  });
}

/** Contador de pendientes para el Administrador (Q-14). Solo se consulta si puede aprobar. */
export function usePendingAdjustmentsCount(enabled: boolean) {
  return useQuery({
    queryKey: [...key, 'pending-count'],
    queryFn: async () =>
      (await api.get<{ data: { count: number } }>('/inventory/adjustments/pending-count')).data
        .count,
    enabled,
  });
}

/** Tras un cambio: detalle actualizado, listas y contador refrescados; si hubo stock, el inventario. */
function useAfterChange() {
  const client = useQueryClient();
  return async (detail: AdjustmentDetail, affectsStock = false) => {
    client.setQueryData([...key, 'detail', detail.id], detail);
    await client.invalidateQueries({ queryKey: [...key, 'list'] });
    await client.invalidateQueries({ queryKey: [...key, 'pending-count'] });
    // La bandeja «Pendientes de aprobación» del Inicio también cambia (Q-06).
    await client.invalidateQueries({ queryKey: ['approvals'] });
    if (affectsStock) {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['inventory'] }),
        client.invalidateQueries({ queryKey: ['inventory-movements'] }),
        client.invalidateQueries({ queryKey: ['products'] }),
      ]);
    }
  };
}

export function useCreateAdjustment() {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async (input: CreateAdjustmentInput) =>
      (await api.post<{ data: AdjustmentDetail }>('/inventory/adjustments', input)).data,
    onSuccess: (detail) => after(detail),
  });
}

export function useCancelAdjustment(id: string) {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async () =>
      (await api.post<{ data: AdjustmentDetail }>(`/inventory/adjustments/${id}/cancel`)).data,
    onSuccess: (detail) => after(detail),
  });
}

export function useApproveAdjustment(id: string) {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async () =>
      (await api.post<{ data: AdjustmentDetail }>(`/inventory/adjustments/${id}/approve`)).data,
    onSuccess: (detail) => after(detail, true),
  });
}

export function useRejectAdjustment(id: string) {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async (input: RejectAdjustmentInput) =>
      (await api.post<{ data: AdjustmentDetail }>(`/inventory/adjustments/${id}/reject`, input))
        .data,
    onSuccess: (detail) => after(detail),
  });
}

/** Busca variantes activas con su saldo, por SKU, código de barras o nombre (requiere inventory:read). */
export async function searchInventory(term: string): Promise<InventoryItem[]> {
  const query = new URLSearchParams({
    page: '1',
    pageSize: '10',
    q: term,
    level: 'all',
    initialOnly: 'false',
  });
  return (await api.get<Page<InventoryItem>>(`/inventory?${query}`)).data;
}

export const inventorySearchKey = (term: string) =>
  ['inventory', 'adjustment-picker', term] as const;

export function useInventorySearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: inventorySearchKey(term),
    queryFn: () => searchInventory(term),
    enabled: term.length >= 2,
  });
}
