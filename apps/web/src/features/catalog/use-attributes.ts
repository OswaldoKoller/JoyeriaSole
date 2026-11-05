import type {
  Attribute,
  AttributeOption,
  CreateAttributeInput,
  CreateAttributeOptionInput,
  UpdateAttributeInput,
  UpdateAttributeOptionInput,
} from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';

const key = ['attributes'] as const;

/** Atributos activos (para formularios). `includeInactive` es para la pantalla de gestión. */
export function useAttributes(includeInactive = false) {
  return useQuery({
    queryKey: [...key, { includeInactive }],
    queryFn: () =>
      api.get<{ data: Attribute[] }>(
        `/attributes${includeInactive ? '?includeInactive=true' : ''}`,
      ),
  });
}

function useRefreshAttributes() {
  const client = useQueryClient();
  // Los productos muestran valores y etiquetas derivadas de los atributos.
  return async () => {
    await client.invalidateQueries({ queryKey: key });
    await client.invalidateQueries({ queryKey: ['products'] });
  };
}

export function useCreateAttribute() {
  const refresh = useRefreshAttributes();
  return useMutation({
    mutationFn: (input: CreateAttributeInput) =>
      api.post<{ data: Attribute }>('/attributes', input),
    onSuccess: refresh,
  });
}

export function useUpdateAttribute() {
  const refresh = useRefreshAttributes();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAttributeInput }) =>
      api.patch<{ data: Attribute }>(`/attributes/${id}`, input),
    onSuccess: refresh,
  });
}

export function useAddAttributeOption() {
  const refresh = useRefreshAttributes();
  return useMutation({
    mutationFn: ({
      attributeId,
      input,
    }: {
      attributeId: string;
      input: CreateAttributeOptionInput;
    }) => api.post<{ data: AttributeOption }>(`/attributes/${attributeId}/options`, input),
    onSuccess: refresh,
  });
}

export function useUpdateAttributeOption() {
  const refresh = useRefreshAttributes();
  return useMutation({
    mutationFn: ({
      attributeId,
      optionId,
      input,
    }: {
      attributeId: string;
      optionId: string;
      input: UpdateAttributeOptionInput;
    }) =>
      api.patch<{ data: AttributeOption }>(`/attributes/${attributeId}/options/${optionId}`, input),
    onSuccess: refresh,
  });
}
