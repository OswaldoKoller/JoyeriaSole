import type {
  CostHistoryEntry,
  CreateStockEntryCostTypeInput,
  CreateStockEntryInput,
  Product,
  QuickCreateStockEntryItemInput,
  ReplaceStockEntryCostsInput,
  ReplaceStockEntryItemsInput,
  StockEntryCostType,
  StockEntryDetail,
  StockEntrySummary,
  Supplier,
  UpdateStockEntryCostTypeInput,
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

export function useReplaceStockEntryCosts(id: string) {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async (input: ReplaceStockEntryCostsInput) =>
      (await api.put<{ data: StockEntryDetail }>(`/stock-entries/${id}/costs`, input)).data,
    onSuccess: (detail) => after(detail),
  });
}

/** Alta rápida de una pieza nueva dentro del borrador (C1/P-24). Devuelve avisos, p. ej. código repetido. */
export function useQuickCreateItem(id: string) {
  const client = useQueryClient();
  const after = useAfterChange();
  return useMutation({
    mutationFn: (input: QuickCreateStockEntryItemInput) =>
      api.post<{
        data: StockEntryDetail;
        meta: { variantId: string; productId: string; warnings: string[] };
      }>(`/stock-entries/${id}/items/quick`, input),
    // La pieza nueva aparece también en el catálogo.
    onSuccess: async (result) => {
      await after(result.data);
      await client.invalidateQueries({ queryKey: ['products'] });
    },
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

const costTypesKey = ['stock-entry-cost-types'] as const;

/** Tipos de costo adicional (Q-08), activos e inactivos. */
export function useCostTypes() {
  return useQuery({
    queryKey: costTypesKey,
    queryFn: async () =>
      (await api.get<{ data: StockEntryCostType[] }>('/stock-entry-cost-types')).data,
  });
}

export function useCreateCostType() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateStockEntryCostTypeInput) =>
      (await api.post<{ data: StockEntryCostType }>('/stock-entry-cost-types', input)).data,
    onSuccess: () => client.invalidateQueries({ queryKey: costTypesKey }),
  });
}

export function useUpdateCostType() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateStockEntryCostTypeInput }) =>
      (await api.patch<{ data: StockEntryCostType }>(`/stock-entry-cost-types/${id}`, input)).data,
    onSuccess: () => client.invalidateQueries({ queryKey: costTypesKey }),
  });
}

/** Historial de costos de una variante (C10); requiere costs:read. */
export function useCostHistory(variantId: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: ['cost-history', variantId, page],
    queryFn: () =>
      api.get<Page<CostHistoryEntry>>(
        `/products/variants/${variantId}/cost-history?page=${page}&pageSize=10`,
      ),
    enabled,
  });
}
