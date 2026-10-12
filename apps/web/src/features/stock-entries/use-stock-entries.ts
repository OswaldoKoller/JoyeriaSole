import type {
  CreateStockEntryInput,
  Product,
  ReplaceStockEntryItemsInput,
  StockEntryDetail,
  StockEntrySummary,
  Supplier,
  UpdateStockEntryInput,
} from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';

const key = ['stock-entries'] as const;
type Page<T> = { data: T[]; meta: { page: number; pageSize: number; total: number } };

export function useStockEntries(page: number, q: string, status: string) {
  const query = new URLSearchParams({ page: String(page), pageSize: '25', q, status });
  return useQuery({
    queryKey: [...key, 'list', page, q, status],
    queryFn: () => api.get<Page<StockEntrySummary>>(`/stock-entries?${query}`),
  });
}

export function useStockEntry(id: string) {
  return useQuery({
    queryKey: [...key, 'detail', id],
    queryFn: async () => (await api.get<{ data: StockEntryDetail }>(`/stock-entries/${id}`)).data,
  });
}

/** Tras cualquier cambio: el detalle queda actualizado y las listas se refrescan. */
function useAfterChange() {
  const client = useQueryClient();
  return async (detail: StockEntryDetail, affectsStock = false) => {
    client.setQueryData([...key, 'detail', detail.id], detail);
    await client.invalidateQueries({ queryKey: [...key, 'list'] });
    if (affectsStock) {
      // Saldos, alertas, historial, catálogo y dashboard dependen del stock confirmado.
      await Promise.all([
        client.invalidateQueries({ queryKey: ['inventory'] }),
        client.invalidateQueries({ queryKey: ['inventory-movements'] }),
        client.invalidateQueries({ queryKey: ['products'] }),
      ]);
    }
  };
}

export function useCreateStockEntry() {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async (input: CreateStockEntryInput) =>
      (await api.post<{ data: StockEntryDetail }>('/stock-entries', input)).data,
    onSuccess: (detail) => after(detail),
  });
}

export function useUpdateStockEntry(id: string) {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async (input: UpdateStockEntryInput) =>
      (await api.patch<{ data: StockEntryDetail }>(`/stock-entries/${id}`, input)).data,
    onSuccess: (detail) => after(detail),
  });
}

export function useReplaceStockEntryItems(id: string) {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async (input: ReplaceStockEntryItemsInput) =>
      (await api.put<{ data: StockEntryDetail }>(`/stock-entries/${id}/items`, input)).data,
    onSuccess: (detail) => after(detail),
  });
}

export function useConfirmStockEntry(id: string) {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async () =>
      (await api.post<{ data: StockEntryDetail }>(`/stock-entries/${id}/confirm`)).data,
    onSuccess: (detail) => after(detail, true),
  });
}

export function useCancelStockEntry(id: string) {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async () =>
      (await api.post<{ data: StockEntryDetail }>(`/stock-entries/${id}/cancel`)).data,
    onSuccess: (detail) => after(detail),
  });
}

/** Proveedores activos para elegir en la cabecera (requiere suppliers:read). */
export function useActiveSuppliers(enabled: boolean) {
  return useQuery({
    queryKey: ['suppliers', 'active-picker'],
    queryFn: () => api.get<Page<Supplier>>('/suppliers?page=1&pageSize=100&q=&status=active'),
    select: (page) => page.data,
    enabled,
  });
}

export interface VariantOption {
  variantId: string;
  sku: string;
  barcode: string | null;
  productName: string;
  variantLabel: string | null;
}

/** Busca variantes activas por SKU, código de barras o nombre. */
export async function searchVariants(term: string): Promise<VariantOption[]> {
  const page = await api.get<Page<Product>>(
    `/products?page=1&pageSize=10&status=ACTIVE&q=${encodeURIComponent(term)}`,
  );
  return page.data.flatMap((product) =>
    product.variants
      .filter((variant) => variant.status === 'ACTIVE')
      .map((variant) => ({
        variantId: variant.id,
        sku: variant.sku,
        barcode: variant.barcode,
        productName: product.name,
        variantLabel: variant.label,
      })),
  );
}

export const variantSearchKey = (term: string) => ['products', 'picker', term] as const;

export function useVariantSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: variantSearchKey(term),
    queryFn: () => searchVariants(term),
    enabled: term.length >= 2,
  });
}
