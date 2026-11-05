import type {
  CountFinding,
  CountScanResult,
  InventoryCountDetail,
  InventoryCountSummary,
} from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';

const key = ['inventory-counts'] as const;
type Page<T> = { data: T[]; meta: { page: number; pageSize: number; total: number } };
const base = '/inventory/counts';

export function useInventoryCounts(filters: { page: number; status: string }) {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: '25',
    status: filters.status,
  });
  return useQuery({
    queryKey: [...key, 'list', filters],
    queryFn: () => api.get<Page<InventoryCountSummary>>(`${base}?${query}`),
  });
}

export function useInventoryCount(id: string) {
  return useQuery({
    queryKey: [...key, 'detail', id],
    queryFn: async () => (await api.get<{ data: InventoryCountDetail }>(`${base}/${id}`)).data,
  });
}

/** Tras un cambio de estado: detalle actualizado y listas refrescadas; si hubo stock, el inventario. */
function useAfterChange() {
  const client = useQueryClient();
  return async (detail: InventoryCountDetail, affectsStock = false) => {
    client.setQueryData([...key, 'detail', detail.id], detail);
    await client.invalidateQueries({ queryKey: [...key, 'list'] });
    if (affectsStock) {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['inventory'] }),
        client.invalidateQueries({ queryKey: ['inventory-movements'] }),
        client.invalidateQueries({ queryKey: ['products'] }),
      ]);
    }
  };
}

export function useCreateInventoryCount() {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async (input: { categoryId: string; notes?: string }) =>
      (await api.post<{ data: InventoryCountDetail }>(base, input)).data,
    onSuccess: (detail) => after(detail),
  });
}

type Transition = 'start' | 'take' | 'close' | 'approve';

export function useCountTransition(id: string, transition: Transition) {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async () =>
      (await api.post<{ data: InventoryCountDetail }>(`${base}/${id}/${transition}`)).data,
    onSuccess: (detail) => after(detail, transition === 'approve'),
  });
}

export function useCancelInventoryCount(id: string) {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async (reason: string) =>
      (
        await api.post<{ data: InventoryCountDetail }>(`${base}/${id}/cancel`, {
          reason: reason || null,
        })
      ).data,
    onSuccess: (detail) => after(detail),
  });
}

/**
 * Captura: cada lectura viaja al servidor y se guarda al instante. Tras cada una se refresca el
 * detalle (lista de lo contado) para mostrar siempre lo que quedó guardado.
 */
export function useScanMutations(id: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: [...key, 'detail', id] });
  const scan = useMutation({
    mutationFn: async (code: string) =>
      (await api.post<{ data: CountScanResult }>(`${base}/${id}/scan`, { code })).data,
    onSuccess: refresh,
  });
  const undo = useMutation({
    mutationFn: async () => (await api.post<{ data: CountScanResult }>(`${base}/${id}/undo`)).data,
    onSuccess: refresh,
  });
  const setQuantity = useMutation({
    mutationFn: async (input: { variantId: string; quantity: number }) =>
      (
        await api.put<{ data: CountScanResult }>(`${base}/${id}/items/${input.variantId}`, {
          quantity: input.quantity,
        })
      ).data,
    onSuccess: refresh,
  });
  const noteFinding = useMutation({
    mutationFn: async (input: { findingId: string; note: string }) =>
      (
        await api.patch<{ data: CountFinding }>(`${base}/${id}/findings/${input.findingId}`, {
          note: input.note,
        })
      ).data,
    onSuccess: refresh,
  });
  return { scan, undo, setQuantity, noteFinding };
}

export function useRegularizeFinding(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { findingId: string; note: string }) =>
      (
        await api.post<{ data: CountFinding }>(
          `${base}/${id}/findings/${input.findingId}/regularize`,
          { note: input.note },
        )
      ).data,
    onSuccess: () => client.invalidateQueries({ queryKey: [...key, 'detail', id] }),
  });
}
