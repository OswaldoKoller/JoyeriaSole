import type {
  CashCorrection,
  CashCorrectionResult,
  CashSessionDetail,
  CashSessionSummary,
  CashStatus,
  CloseCashSessionInput,
  CreateCashCorrectionInput,
  OpenCashSessionInput,
} from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api-client.ts';
import { useAttemptKeys } from '../../lib/idempotency.ts';
import { PAGE_SIZE, useListQuery, type Paged } from '../../lib/paging.ts';

/**
 * Caja única (E3, plan 11 §4.4). Abrir, cerrar y corregir exigen `Idempotency-Key`: una clave por
 * intento, la MISMA en los reintentos (doble clic, corte de red, 503) y una nueva si cambian los
 * datos (otro contado u otra observación). No existen reapertura, gastos ni retiros (B6, B7).
 */
export const cashKeys = {
  all: ['cash'] as const,
  status: ['cash', 'status'] as const,
  current: ['cash', 'current'] as const,
  list: (page: number, status: string, from: string, to: string) =>
    ['cash', 'list', page, status, from, to] as const,
  detail: (id: string) => ['cash', 'detail', id] as const,
  corrections: (id: string) => ['cash', 'corrections', id] as const,
};

/** C1 · ¿Hay caja abierta? Sin cifras: lo usan el punto de venta y quien solo vende. */
export function useCashStatus() {
  return useQuery({
    queryKey: cashKeys.status,
    queryFn: async () => (await api.get<{ data: CashStatus }>('/cash/status')).data,
    // El estado de la caja lo cambia otra persona: se revisa al volver a la pestaña.
    refetchOnWindowFocus: true,
  });
}

/** C3 · Sesión abierta con cifras en vivo (`cash:read`); `null` si no hay caja abierta. */
export function useCurrentCashSession(enabled = true) {
  return useQuery({
    queryKey: cashKeys.current,
    enabled,
    queryFn: async () => {
      try {
        return (await api.get<{ data: CashSessionDetail }>('/cash/sessions/current')).data;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    refetchOnWindowFocus: true,
  });
}

export function useCashSessions(page: number, status: string, from: string, to: string) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), status });
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  return useListQuery(cashKeys.list(page, status, from, to), () =>
    api.get<Paged<CashSessionSummary>>(`/cash/sessions?${query}`),
  );
}

export function useCashSession(id: string) {
  return useQuery({
    queryKey: cashKeys.detail(id),
    queryFn: async () => (await api.get<{ data: CashSessionDetail }>(`/cash/sessions/${id}`)).data,
  });
}

export function useCashCorrections(id: string) {
  return useQuery({
    queryKey: cashKeys.corrections(id),
    queryFn: async () =>
      (await api.get<{ data: CashCorrection[] }>(`/cash/sessions/${id}/corrections`)).data,
  });
}

function useRefreshCash() {
  const client = useQueryClient();
  return (session?: CashSessionDetail) => {
    if (session) client.setQueryData(cashKeys.detail(session.id), session);
    return client.invalidateQueries({ queryKey: cashKeys.all });
  };
}

/** C2 · Abrir la caja con el fondo inicial. */
export function useOpenCash() {
  const refresh = useRefreshCash();
  const attempt = useAttemptKeys();
  return useMutation({
    mutationFn: async (input: OpenCashSessionInput) =>
      (
        await api.post<{ data: CashSessionDetail }>('/cash/sessions', input, {
          idempotencyKey: attempt.keyFor(input),
        })
      ).data,
    onSettled: (_data, error) => {
      attempt.settle(error);
    },
    onSuccess: (session) => refresh(session),
  });
}

/** C6 · Cerrar la caja con el arqueo. La clave depende de la sesión, el contado y la observación. */
export function useCloseCash(sessionId: string) {
  const refresh = useRefreshCash();
  const attempt = useAttemptKeys();
  return useMutation({
    mutationFn: async (input: CloseCashSessionInput) =>
      (
        await api.post<{ data: CashSessionDetail }>(`/cash/sessions/${sessionId}/close`, input, {
          idempotencyKey: attempt.keyFor({ sessionId, ...input }),
        })
      ).data,
    onSettled: (_data, error) => {
      attempt.settle(error);
    },
    onSuccess: (session) => refresh(session),
  });
}

/** C7 · Corrección append-only de un cierre (solo `cash:correct`). */
export function useCorrectCash(sessionId: string) {
  const refresh = useRefreshCash();
  const attempt = useAttemptKeys();
  return useMutation({
    mutationFn: async (input: CreateCashCorrectionInput) =>
      (
        await api.post<{ data: CashCorrectionResult }>(
          `/cash/sessions/${sessionId}/corrections`,
          input,
          { idempotencyKey: attempt.keyFor({ sessionId, ...input }) },
        )
      ).data,
    onSettled: (_data, error) => {
      attempt.settle(error);
    },
    onSuccess: (result) => refresh(result.session),
  });
}
