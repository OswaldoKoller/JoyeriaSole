import type {
  AssignBarcodeInput,
  ConfigureAxesInput,
  CreateProductInput,
  CreateVariantInput,
  Product,
  UpdateProductInput,
  UpdateVariantStatusInput,
} from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';

const key = ['products'] as const;
type ProductList = { data: Product[]; meta: { page: number; pageSize: number; total: number } };

export function useProducts(page: number, q: string) {
  const query = new URLSearchParams({ page: String(page), pageSize: '25', q });
  return useQuery({
    queryKey: [...key, page, q],
    queryFn: () => api.get<ProductList>(`/products?${query}`),
  });
}

function useRefreshProducts() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: key });
}

export function useCreateProduct() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: (input: CreateProductInput) => api.post<{ data: Product }>('/products', input),
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

export function useUpdateVariantStatus() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: UpdateVariantStatusInput }) =>
      api.patch<{ data: Product }>(`/products/variants/${variantId}/status`, input),
    onSuccess: refresh,
  });
}

export function useAssignBarcode() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: AssignBarcodeInput }) =>
      api.patch<{ data: Product }>(`/products/variants/${variantId}/barcode`, input),
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
      api.post<{ data: Product }>(`/products/${productId}/variants`, input),
    onSuccess: refresh,
  });
}
