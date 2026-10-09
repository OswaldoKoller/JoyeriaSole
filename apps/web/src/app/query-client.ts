import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../lib/api-client.ts';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // No reintentar errores del cliente (401/403/404/validación): no se arreglan solos.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 2,
        refetchOnWindowFocus: false,
      },
    },
  });
}
