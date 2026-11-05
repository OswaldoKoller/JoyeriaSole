import type { AuditDetail, AuditEntry, AuditFilters } from '@joyeria/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';

type Page<T> = { data: T[]; meta: { page: number; pageSize: number; total: number } };

/** Filtros ya normalizados (la fecha va como instante ISO; ver `audit-filters.ts`). */
export interface AuditQueryFilters {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  from: string;
  to: string;
  q: string;
}

export const AUDIT_PAGE_SIZE = 25;

const key = ['audit'] as const;

export function useAuditList(filters: AuditQueryFilters, page: number) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(AUDIT_PAGE_SIZE) });
  for (const name of Object.keys(filters) as (keyof AuditQueryFilters)[]) {
    if (filters[name]) query.set(name, filters[name]);
  }
  return useQuery({
    queryKey: [...key, 'list', filters, page],
    queryFn: () => api.get<Page<AuditEntry>>(`/audit?${query}`),
    placeholderData: keepPreviousData,
  });
}

export function useAuditDetail(id: string | null) {
  return useQuery({
    queryKey: [...key, 'detail', id],
    queryFn: async () => (await api.get<{ data: AuditDetail }>(`/audit/${id}`)).data,
    enabled: id !== null,
  });
}

/** Acciones, tipos de entidad y usuarios existentes, para poblar los selectores. */
export function useAuditFilters() {
  return useQuery({
    queryKey: [...key, 'filters'],
    queryFn: async () => (await api.get<{ data: AuditFilters }>('/audit/actions')).data,
    staleTime: 60_000,
  });
}
