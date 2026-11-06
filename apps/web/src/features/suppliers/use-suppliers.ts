import type { CreateSupplierInput, Supplier, UpdateSupplierInput } from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';
import { PAGE_SIZE, useListQuery, type Paged } from '../../lib/paging.ts';

type SupplierList = Paged<Supplier>;

const keys = { all: ['suppliers'] as const };

export function useSuppliers(page: number, q: string, status: string, type = 'all') {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
    q,
    status,
    type,
  });
  return useListQuery([...keys.all, page, q, status, type], () =>
    api.get<SupplierList>(`/suppliers?${query}`),
  );
}

/**
 * Proveedores activos para los selectores (hasta 100). Requiere `suppliers:read`: quien llama
 * pasa `enabled` solo cuando la persona tiene el permiso y el formulario está abierto, para no
 * pedir (ni fallar con 403) en cada fila o pantalla.
 */
export function useActiveSuppliers(enabled: boolean) {
  return useQuery({
    queryKey: [...keys.all, 'active-picker'],
    queryFn: () => api.get<SupplierList>('/suppliers?page=1&pageSize=100&q=&status=active'),
    select: (page) => page.data,
    enabled,
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
