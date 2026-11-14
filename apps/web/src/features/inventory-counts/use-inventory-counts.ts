import type {
  CountFinding,
  CountScanResult,
  InventoryCountDetail,
  InventoryCountSummary,
} from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';
import { useAttemptKeys, useRetryKeys } from '../../lib/idempotency.ts';
import { PAGE_SIZE, useListQuery, type Paged } from '../../lib/paging.ts';

const key = ['inventory-counts'] as const;
type Page<T> = Paged<T>;
const base = '/inventory/counts';

export function useInventoryCounts(filters: { page: number; status: string }) {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(PAGE_SIZE),
    status: filters.status,
  });
  return useListQuery([...key, 'list', filters], () =>
    api.get<Page<InventoryCountSummary>>(`${base}?${query}`),
  );
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

export function useCreateInventoryCount() {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async (input: { categoryId: string; notes?: string }) =>
      (await api.post<{ data: InventoryCountDetail }>(base, input)).data,
    onSuccess: (detail) => after(detail),
  });
}

type Transition = 'start' | 'take' | 'close' | 'approve';

/** Transiciones idempotentes en la API: cerrar la ronda y aprobar (aplica diferencias al stock). */
const IDEMPOTENT_TRANSITIONS: ReadonlySet<Transition> = new Set(['close', 'approve']);

export function useCountTransition(id: string, transition: Transition) {
  const after = useAfterChange();
  const attempt = useAttemptKeys();
  return useMutation({
    mutationFn: async () =>
      (
        await api.post<{ data: InventoryCountDetail }>(
          `${base}/${id}/${transition}`,
          undefined,
          IDEMPOTENT_TRANSITIONS.has(transition)
            ? { idempotencyKey: attempt.keyFor([id, transition]) }
            : undefined,
        )
      ).data,
    onSettled: (_data, error) => {
      attempt.settle(error);
    },
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
  // Cada lectura del lector es una operación distinta (dos piezas iguales = dos lecturas, dos claves,
  // incluso si se disparan en paralelo). La clave solo se reutiliza al repetir la lectura que falló.
  const reads = useRetryKeys();
  const scan = useMutation({
    mutationFn: async (code: string) => {
      const attempt = reads.begin(code);
      try {
        const result = (
          await api.post<{ data: CountScanResult }>(
            `${base}/${id}/scan`,
            { code },
            { idempotencyKey: attempt.key },
          )
        ).data;
        attempt.done(null);
        return result;
      } catch (failure) {
        attempt.done(failure);
        throw failure;
      }
    },
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
