import type { Category, CreateCategoryInput, UpdateCategoryInput } from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';

const key = ['categories'] as const;

export function useCategories() {
  return useQuery({ queryKey: key, queryFn: () => api.get<{ data: Category[] }>('/categories') });
}

export function useCreateCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCategoryInput) => api.post<{ data: Category }>('/categories', input),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
}

export function useUpdateCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) =>
      api.patch<{ data: Category }>(`/categories/${id}`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
}
