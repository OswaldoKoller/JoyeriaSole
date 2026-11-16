import {
  LOGO_FIELD_NAME,
  type BusinessSettings,
  type UpdateBusinessSettingsInput,
} from '@joyeria/shared';
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

/** Sube el logo del negocio (multipart, campo «file»); el servidor lo valida y lo reduce. */
export function useUploadBusinessLogo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append(LOGO_FIELD_NAME, file);
      return (await api.put<{ data: BusinessSettings }>('/settings/business/logo', form)).data;
    },
    onSuccess: (settings) => {
      client.setQueryData(businessSettingsKey, settings);
      void client.invalidateQueries({ queryKey: ['sales', 'receipt'] });
      void client.invalidateQueries({ queryKey: ['sale-exchanges', 'receipt'] });
    },
  });
}

/** Quita el logo del negocio: los comprobantes salen sin imagen. */
export function useRemoveBusinessLogo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await api.delete<{ data: BusinessSettings }>('/settings/business/logo')).data,
    onSuccess: (settings) => {
      client.setQueryData(businessSettingsKey, settings);
      void client.invalidateQueries({ queryKey: ['sales', 'receipt'] });
      void client.invalidateQueries({ queryKey: ['sale-exchanges', 'receipt'] });
    },
  });
}
