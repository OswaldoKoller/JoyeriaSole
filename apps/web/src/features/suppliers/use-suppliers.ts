import type { CreateSupplierInput, Supplier, UpdateSupplierInput } from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';

type SupplierList = {
  data: Supplier[];
  meta: { page: number; pageSize: number; total: number };
};

const keys = { all: ['suppliers'] as const };

export function useSuppliers(page: number, q: string, status: string, type = 'all') {
  const query = new URLSearchParams({ page: String(page), pageSize: '25', q, status, type });
  return useQuery({
    queryKey: [...keys.all, page, q, status, type],
    queryFn: () => api.get<SupplierList>(`/suppliers?${query}`),
  });
}

export function useCreateSupplier() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierInput) => api.post<{ data: Supplier }>('/suppliers', input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useUpdateSupplier() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSupplierInput }) =>
      api.patch<{ data: Supplier }>(`/suppliers/${id}`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  });
}
