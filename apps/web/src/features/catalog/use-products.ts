import type {
  AssignBarcodeInput,
  CatalogHealth,
  ConfigureAxesInput,
  CreateProductInput,
  CreateVariantInput,
  Product,
  UpdateProductInput,
  UpdateVariantInput,
  UpdateVariantStatusInput,
  VariantLookup,
} from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';

const key = ['products'] as const;
type ProductList = { data: Product[]; meta: { page: number; pageSize: number; total: number } };
/** Respuesta de las operaciones que pueden dejar avisos no bloqueantes (código repetido, Q-10). */
export type ProductResult = { data: Product; meta: { warnings: string[] } };

export type ProductFilters = {
  page: number;
  q: string;
  categoryId: string;
  incomplete: boolean;
  withoutPrice: boolean;
};

function filterQuery(filters: ProductFilters, pageSize: number) {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(pageSize),
    q: filters.q,
  });
  if (filters.categoryId) query.set('categoryId', filters.categoryId);
  if (filters.incomplete) query.set('incomplete', 'true');
  if (filters.withoutPrice) query.set('withoutPrice', 'true');
  return query;
}

export function useProducts(filters: ProductFilters) {
  return useQuery({
    queryKey: [...key, filters],
    queryFn: () => api.get<ProductList>(`/products?${filterQuery(filters, 25)}`),
  });
}

/** Contadores de fichas incompletas y sin precio para el Inicio (sin costos). */
export function useCatalogHealth(enabled: boolean) {
  return useQuery({
    queryKey: [...key, 'health'],
    queryFn: () => api.get<{ data: CatalogHealth }>('/products/health'),
    select: (response) => response.data,
    enabled,
    staleTime: 30_000,
  });
}

/** Búsqueda unificada por SKU, código de barras o código del proveedor. 404 si no existe. */
export function lookupVariant(code: string) {
  return api.get<{ data: VariantLookup }>(
    `/catalog/variants/lookup?code=${encodeURIComponent(code)}`,
  );
}

/** Búsqueda por texto (nombre, SKU o códigos) para elegir piezas a mano. */
export async function searchCatalog(term: string) {
  const query = new URLSearchParams({ page: '1', pageSize: '10', q: term });
  const page = await api.get<ProductList>(`/products?${query}`);
  return page.data;
}

function useRefreshProducts() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: key });
}

export function useCreateProduct() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: (input: CreateProductInput) => api.post<ProductResult>('/products', input),
    onSuccess: refresh,
  });
}

export function useUpdateProduct() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) =>
      api.patch<{ data: Product }>(`/products/${id}`, input),
    onSuccess: refresh,
  });
}

/** B11: eliminación física (solo Administrador, solo sin movimientos). */
export function useDeleteProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ data: { id: string } }>(`/products/${id}`),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: key });
      await client.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useUpdateVariantStatus() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: UpdateVariantStatusInput }) =>
      api.patch<{ data: Product }>(`/products/variants/${variantId}/status`, input),
    onSuccess: refresh,
  });
}

/** B10: stock mínimo por variante (0 = sin alerta). */
export function useUpdateVariant() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: UpdateVariantInput }) =>
      api.patch<{ data: Product }>(`/products/variants/${variantId}`, input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: key });
      await client.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useAssignBarcode() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: AssignBarcodeInput }) =>
      api.patch<ProductResult>(`/products/variants/${variantId}/barcode`, input),
    onSuccess: refresh,
  });
}

export function useGenerateBarcode() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: (variantId: string) =>
      api.post<{ data: Product }>(`/products/variants/${variantId}/barcode/generate`),
    onSuccess: refresh,
  });
}

export function useConfigureAxes() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: ({ productId, input }: { productId: string; input: ConfigureAxesInput }) =>
      api.post<{ data: Product }>(`/products/${productId}/axes`, input),
    onSuccess: refresh,
  });
}

export function useCreateVariant() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: ({ productId, input }: { productId: string; input: CreateVariantInput }) =>
      api.post<ProductResult>(`/products/${productId}/variants`, input),
    onSuccess: refresh,
  });
}
