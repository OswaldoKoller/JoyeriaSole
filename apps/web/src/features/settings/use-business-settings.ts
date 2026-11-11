import type { BusinessSettings, UpdateBusinessSettingsInput } from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';

/** Datos comerciales del comprobante interno (C1, C2; solo `settings:manage`). */
export const businessSettingsKey = ['settings', 'business'] as const;

export function useBusinessSettings() {
  return useQuery({
    queryKey: businessSettingsKey,
    queryFn: async () => (await api.get<{ data: BusinessSettings }>('/settings/business')).data,
  });
}

export function useUpdateBusinessSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateBusinessSettingsInput) =>
      (await api.put<{ data: BusinessSettings }>('/settings/business', input)).data,
    onSuccess: (settings) => {
      client.setQueryData(businessSettingsKey, settings);
      // Los comprobantes muestran los datos VIGENTES (D-08): se vuelven a pedir.
      void client.invalidateQueries({ queryKey: ['sales', 'receipt'] });
    },
  });
}
