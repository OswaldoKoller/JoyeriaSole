import type {
  PriceChange,
  PriceChangesInput,
  PricingVariant,
  PriceChangeStatus,
} from '@joyeria/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';
import { PAGE_SIZE, SMALL_PAGE_SIZE, useListQuery, type Paged } from '../../lib/paging.ts';

const key = ['pricing'] as const;
type Page<T> = Paged<T>;

export interface VariantFilters {
  page: number;
  q: string;
  categoryId: string;
  noPrice: boolean;
  withPending: boolean;
}

export function usePricingVariants(filters: VariantFilters) {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(PAGE_SIZE),
    q: filters.q,
  });
  if (filters.categoryId) query.set('categoryId', filters.categoryId);
  if (filters.noPrice) query.set('noPrice', 'true');
  if (filters.withPending) query.set('withPending', 'true');
  return useListQuery([...key, 'variants', filters], () =>
    api.get<Page<PricingVariant>>(`/pricing/variants?${query}`),
  );
}

export function usePriceChanges(page: number, status: PriceChangeStatus | '', q = '') {
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), q });
  if (status) query.set('status', status);
  return useListQuery([...key, 'changes', page, status, q], () =>
    api.get<Page<PriceChange>>(`/pricing/changes?${query}`),
  );
}

/** Todas las pendientes (hasta 100) para decidirlas en masa. */
export function usePendingChanges() {
  return useQuery({
    queryKey: [...key, 'pending'],
    queryFn: () => api.get<Page<PriceChange>>('/pricing/changes?status=PENDING&pageSize=100'),
  });
}

export function useVariantPriceHistory(variantId: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: [...key, 'history', variantId, page],
    queryFn: () =>
      api.get<Page<PriceChange>>(
        `/pricing/variants/${variantId}/history?page=${page}&pageSize=${SMALL_PAGE_SIZE}`,
      ),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePendingCount(enabled: boolean) {
  return useQuery({
    queryKey: [...key, 'pending-count'],
    queryFn: async () =>
      (await api.get<{ data: { count: number } }>('/pricing/pending-count')).data.count,
    enabled,
  });
}

/** Un cambio de precio afecta al panel, al historial, al catálogo y a los contadores. */
function useAfterChange() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({ queryKey: ['products'] }),
      // La bandeja «Pendientes de aprobación» del Inicio también cambia (Q-06).
      client.invalidateQueries({ queryKey: ['approvals'] }),
    ]);
}

export function useRequestPrices() {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async (input: PriceChangesInput) =>
      (await api.post<{ data: PriceChange[] }>('/pricing/requests', input)).data,
    onSuccess: after,
  });
}

export function useApplyPrices() {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async (input: PriceChangesInput) =>
      (await api.post<{ data: PriceChange[] }>('/pricing/apply', input)).data,
    onSuccess: after,
  });
}

export function useApproveChanges() {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async (ids: string[]) =>
      (await api.post<{ data: PriceChange[] }>('/pricing/changes/approve', { ids })).data,
    onSuccess: after,
  });
}

export function useRejectChanges() {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async (input: { ids: string[]; comment: string }) =>
      (await api.post<{ data: PriceChange[] }>('/pricing/changes/reject', input)).data,
    onSuccess: after,
  });
}

export function useCancelChange() {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<{ data: PriceChange }>(`/pricing/changes/${id}/cancel`)).data,
    onSuccess: after,
  });
}
