import type { PendingApprovals } from '@joyeria/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';

/** Totales de la bandeja «Pendientes de aprobación» (Q-14). Solo para quien puede resolver alguno. */
export function usePendingApprovals(enabled: boolean) {
  return useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => api.get<{ data: PendingApprovals }>('/approvals/pending'),
    select: (response) => response.data,
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
