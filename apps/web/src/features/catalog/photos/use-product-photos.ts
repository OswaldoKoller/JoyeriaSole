import type { ProductPhoto } from '@joyeria/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api-client.ts';

type PhotoList = { data: ProductPhoto[] };

/** Las fotos viajan dentro del producto: al cambiarlas se refrescan los productos. */
function useRefreshProducts() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['products'] });
}

/**
 * Sube una foto a un producto que YA existe. Sirve igual para la ficha del producto y para el
 * alta rápida de una pieza dentro de un ingreso: primero se crea el producto y luego se llama
 * a `mutateAsync({ productId, file })` con el id devuelto.
 */
export function useUploadProductPhoto() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: ({ productId, file }: { productId: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return api.post<{ data: ProductPhoto }>(`/products/${productId}/photos`, form);
    },
    onSuccess: refresh,
  });
}

export function useSetCoverPhoto() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: ({ productId, photoId }: { productId: string; photoId: string }) =>
      api.put<PhotoList>(`/products/${productId}/photos/${photoId}/cover`),
    onSuccess: refresh,
  });
}

export function useReorderPhotos() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: ({ productId, photoIds }: { productId: string; photoIds: string[] }) =>
      api.put<PhotoList>(`/products/${productId}/photos/order`, { photoIds }),
    onSuccess: refresh,
  });
}

export function useDeletePhoto() {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: ({ productId, photoId }: { productId: string; photoId: string }) =>
      api.delete<PhotoList>(`/products/${productId}/photos/${photoId}`),
    onSuccess: refresh,
  });
}
