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
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';
import { PAGE_SIZE, useListQuery, type Paged } from '../../lib/paging.ts';

const key = ['products'] as const;
const detailKey = (id: string) => [...key, 'detail', id] as const;
type ProductList = Paged<Product>;
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
  return useListQuery([...key, filters], () =>
    api.get<ProductList>(`/products?${filterQuery(filters, PAGE_SIZE)}`),
  );
}

/** Busca un producto ya descargado en algún listado en caché (con la hora de esa descarga). */
function findInCachedLists(client: QueryClient, id: string) {
  for (const [queryKey, cached] of client.getQueriesData<Partial<ProductList>>({ queryKey: key })) {
    const product = Array.isArray(cached?.data)
      ? cached.data.find((item) => item.id === id)
      : undefined;
    if (product) {
      return { product, updatedAt: client.getQueryState(queryKey)?.dataUpdatedAt };
    }
  }
  return undefined;
}

/**
 * Ficha completa de un producto (página de detalle). Si el producto ya está en un listado en
 * caché, se muestra al instante mientras se confirma con la API (los listados traen la misma
 * ficha); si el listado ya no es reciente, igualmente se vuelve a pedir.
 */
export function useProduct(id: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => api.get<{ data: Product }>(`/products/${id}`),
    select: (response) => response.data,
    initialData: () => {
      const cached = findInCachedLists(client, id);
      return cached ? { data: cached.product } : undefined;
    },
    initialDataUpdatedAt: () => findInCachedLists(client, id)?.updatedAt,
    enabled: id !== '',
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

/**
 * Tras un cambio: la ficha que devolvió la API pasa directo a la caché del detalle (sin volver
 * a pedirla) y el resto de consultas de productos (listados, búsquedas) se marcan como viejas.
 */
function useRefreshProducts() {
  const client = useQueryClient();
  return (result?: { data: Product }) => {
    if (result) client.setQueryData(detailKey(result.data.id), { data: result.data });
    return client.invalidateQueries({
      queryKey: key,
      predicate: (query) =>
        !(result && query.queryKey[1] === 'detail' && query.queryKey[2] === result.data.id),
    });
  };
}

export function useCreateProduct() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: (input: CreateProductInput) => api.post<ProductResult>('/products', input),
    onSuccess: (result) => refresh(result),
  });
}

export function useUpdateProduct() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) =>
      api.patch<{ data: Product }>(`/products/${id}`, input),
    onSuccess: (result) => refresh(result),
  });
}

/** B11: eliminación física (solo Administrador, solo sin movimientos). */
export function useDeleteProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ data: { id: string } }>(`/products/${id}`),
    onSuccess: async (_result, id) => {
      // La ficha eliminada deja de existir: se quita de la caché (no se vuelve a pedir, daría 404).
      client.removeQueries({ queryKey: detailKey(id) });
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
    onSuccess: (result) => refresh(result),
  });
}

/** B10: stock mínimo por variante (0 = sin alerta). */
export function useUpdateVariant() {
  const client = useQueryClient();
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: UpdateVariantInput }) =>
      api.patch<{ data: Product }>(`/products/variants/${variantId}`, input),
    onSuccess: async (result) => {
      await refresh(result);
      await client.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useAssignBarcode() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: AssignBarcodeInput }) =>
      api.patch<ProductResult>(`/products/variants/${variantId}/barcode`, input),
    onSuccess: (result) => refresh(result),
  });
}

export function useGenerateBarcode() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: (variantId: string) =>
      api.post<{ data: Product }>(`/products/variants/${variantId}/barcode/generate`),
    onSuccess: (result) => refresh(result),
  });
}

export function useConfigureAxes() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: ({ productId, input }: { productId: string; input: ConfigureAxesInput }) =>
      api.post<{ data: Product }>(`/products/${productId}/axes`, input),
    onSuccess: (result) => refresh(result),
  });
}

export function useCreateVariant() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: ({ productId, input }: { productId: string; input: CreateVariantInput }) =>
      api.post<ProductResult>(`/products/${productId}/variants`, input),
    onSuccess: (result) => refresh(result),
  });
}
