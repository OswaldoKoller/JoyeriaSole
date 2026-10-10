import type { Attribute, CreateAttributeOptionInput } from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';

const key = ['attributes'] as const;

export function useAttributes() {
  return useQuery({ queryKey: key, queryFn: () => api.get<{ data: Attribute[] }>('/attributes') });
}

export function useAddAttributeOption() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      attributeId,
      input,
    }: {
      attributeId: string;
      input: CreateAttributeOptionInput;
    }) => api.post(`/attributes/${attributeId}/options`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
}
