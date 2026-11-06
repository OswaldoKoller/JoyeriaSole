import type { Permission } from '@joyeria/shared';
import { lazy, Suspense, type ComponentType } from 'react';
import { PageLoading } from '../components/ui/page-loading.tsx';
import { RequireAuth } from '../features/auth/require-auth.tsx';

type Guard = { permissions?: Permission[]; anyPermissions?: Permission[] };

/**
 * Ruta cargada bajo demanda: la sección se descarga al visitarla (la carga inicial solo incluye
 * Login, el panel, Inicio y Mi cuenta). `guard` define los permisos de `RequireAuth`; mientras
 * se descarga se muestra un aviso accesible y, si falla la descarga, el `errorElement` de la ruta.
 * La sección no se descarga hasta que la sesión y los permisos lo permiten.
 */
export function lazyPage(loader: () => Promise<{ default: ComponentType }>, guard: Guard = {}) {
  const Page = lazy(loader);
  return (
    <RequireAuth {...guard}>
      <Suspense fallback={<PageLoading />}>
        <Page />
      </Suspense>
    </RequireAuth>
  );
}
