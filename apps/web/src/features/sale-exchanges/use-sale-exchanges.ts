import type {
  CreateSaleExchangeInput,
  SaleExchangeDetail,
  SaleExchangeLookup,
  SaleExchangeReceipt,
  SaleExchangeSummary,
} from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';
import { PAGE_SIZE, useListQuery, type Paged } from '../../lib/paging.ts';
import { cashKeys } from '../cash/use-cash.ts';
import { salesKeys } from '../sales/use-sales.ts';

/**
 * Cambio de pieza de una venta (ADR-026). No es una devolución: la venta original no se toca. Un
 * cambio registrado no se edita ni se borra; aquí solo hay consulta, alta y comprobante.
 */
export const exchangeKeys = {
  all: ['sale-exchanges'] as const,
  lookup: (number: number | null) => ['sale-exchanges', 'lookup', number] as const,
  receipt: (id: string) => ['sale-exchanges', 'receipt', id] as const,
  list: (filters: ExchangeFilters) => ['sale-exchanges', 'list', filters] as const,
  ofSale: (saleId: string) => ['sale-exchanges', 'of-sale', saleId] as const,
};

export interface ExchangeFilters {
  page: number;
  from: string;
  to: string;
  number: string;
}

/** C1 · Qué se puede cambiar de la venta con ese número. Sin número no consulta. */
export function useExchangeLookup(number: number | null) {
  return useQuery({
    queryKey: exchangeKeys.lookup(number),
    enabled: number !== null,
    // Un 404 (la venta no existe) no mejora al reintentar.
    retry: false,
    queryFn: async () =>
      (await api.get<{ data: SaleExchangeLookup }>(`/sale-exchanges/lookup?number=${number ?? 0}`))
        .data,
  });
}

/**
 * C2 · Registrar el cambio. La `Idempotency-Key` la decide la pantalla (una por intento, la misma en
 * los reintentos con los mismos datos): por eso viaja como argumento.
 */
export function useCreateExchange() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, key }: { body: CreateSaleExchangeInput; key: string }) =>
      (
        await api.post<{ data: SaleExchangeDetail }>('/sale-exchanges', body, {
          idempotencyKey: key,
        })
      ).data,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: exchangeKeys.all });
      // La caja (arqueo) y el stock cambiaron.
      void client.invalidateQueries({ queryKey: cashKeys.all });
      void client.invalidateQueries({ queryKey: salesKeys.all });
      void client.invalidateQueries({ queryKey: ['inventory'] });
      void client.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

/** C3 · Historial de cambios (la API limita a los propios si no hay `sales:read-all`). */
export function useExchanges(filters: ExchangeFilters) {
  const query = new URLSearchParams({ page: String(filters.page), pageSize: String(PAGE_SIZE) });
  for (const key of ['from', 'to', 'number'] as const) {
    if (filters[key]) query.set(key, filters[key]);
  }
  return useListQuery(exchangeKeys.list(filters), () =>
    api.get<Paged<SaleExchangeSummary>>(`/sale-exchanges?${query}`),
  );
}

/** Cambios ya registrados de una venta (para su detalle). */
export function useExchangesOfSale(saleId: string, enabled: boolean) {
  return useQuery({
    queryKey: exchangeKeys.ofSale(saleId),
    enabled,
    queryFn: async () =>
      (
        await api.get<Paged<SaleExchangeSummary>>(
          `/sale-exchanges?saleId=${saleId}&page=1&pageSize=100`,
        )
      ).data,
  });
}

/** C5 · Comprobante del cambio. */
export function useExchangeReceipt(id: string) {
  return useQuery({
    queryKey: exchangeKeys.receipt(id),
    queryFn: async () =>
      (await api.get<{ data: SaleExchangeReceipt }>(`/sale-exchanges/${id}/receipt`)).data,
  });
}
