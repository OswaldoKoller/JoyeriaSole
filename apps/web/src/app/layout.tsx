import { PERMISSIONS } from '@joyeria/shared';
import { Link, Outlet } from 'react-router';
import { Button } from '../components/ui/button.tsx';
import { useCurrentUser, useHasPermission, useLogout } from '../features/auth/use-auth.ts';

/** Estructura común de las páginas autenticadas. El menú se completará con los módulos de Fase 1. */
export function AppLayout() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const canReadSuppliers = useHasPermission(PERMISSIONS.SUPPLIERS_READ);

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="font-semibold text-brand-700">
            Joyería Sole
          </Link>
          {canReadSuppliers && (
            <Link
              to="/proveedores"
              className="rounded px-2 py-1 text-sm text-stone-700 hover:bg-stone-100 focus-visible:outline-brand-500"
            >
              Proveedores
            </Link>
          )}
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-stone-600 sm:inline">{user?.name}</span>
            <Button
              variant="secondary"
              onClick={() => {
                logout.mutate();
              }}
              disabled={logout.isPending}
            >
              Salir
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
