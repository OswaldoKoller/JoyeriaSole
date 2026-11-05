import type {
  Category,
  CreateCategoryInput,
  SetCategoryAttributesInput,
  UpdateCategoryInput,
} from '@joyeria/shared';
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

/** Reemplaza los atributos asignados a una categoría (obligatorio / eje sugerido). */
export function useSetCategoryAttributes() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SetCategoryAttributesInput }) =>
      api.put<{ data: Category }>(`/categories/${id}/attributes`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
}

/** Etiqueta «Principal › Sub» para los selectores. */
export function categoryPath(category: Category, all: Category[]) {
  const parent = category.parentId ? all.find((item) => item.id === category.parentId) : undefined;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

/**
 * Atributos asignados que aplican a una categoría: los propios o, si no tiene, los de su
 * categoría principal (una subcategoría hereda la plantilla de su principal).
 */
export function effectiveCategoryAttributes(category: Category | undefined, all: Category[]) {
  if (!category) return [];
  if (category.attributes.length > 0) return category.attributes;
  const parent = category.parentId ? all.find((item) => item.id === category.parentId) : undefined;
  return parent?.attributes ?? [];
}
