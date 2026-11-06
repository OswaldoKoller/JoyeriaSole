import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { authKeys } from '../features/auth/use-auth.ts';
import { ApiError } from '../lib/api-client.ts';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/**
 * Datos de referencia que casi no cambian durante una jornada (listas para los selectores): se
 * consideran frescos 5 minutos. Los formularios que los modifican invalidan su clave y se
 * refrescan al instante, así que el tiempo solo evita peticiones repetidas al navegar.
 */
const REFERENCE_DATA_KEYS: readonly (readonly string[])[] = [
  ['categories'],
  ['attributes'],
  ['suppliers', 'active-picker'],
  ['stock-entry-cost-types'],
  ['adjustments', 'reasons'],
];

export function createQueryClient() {
  // Sesión vencida o revocada en cualquier petición: se descarta al usuario y `RequireAuth`
  // redirige al login. Si ya no había usuario (p. ej. credenciales incorrectas) no hace nada.
  const handleError = (error: unknown) => {
    if (!(error instanceof ApiError) || error.status !== 401) return;
    if (!client.getQueryData(authKeys.me)) return;
    client.setQueryData(authKeys.me, null);
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
  };

  const client = new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: {
      queries: {
        // No reintentar errores del cliente (401/403/404/validación): no se arreglan solos.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 2,
        refetchOnWindowFocus: false,
        staleTime: 30 * SECOND,
        gcTime: 10 * MINUTE,
      },
    },
  });
  for (const queryKey of REFERENCE_DATA_KEYS) {
    client.setQueryDefaults(queryKey, { staleTime: 5 * MINUTE });
  }
  return client;
}
