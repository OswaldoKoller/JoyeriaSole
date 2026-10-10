import { PERMISSIONS } from '@joyeria/shared';
import { Link, NavLink, Outlet } from 'react-router';
import { Button } from '../components/ui/button.tsx';
import { useCurrentUser, useHasPermission, useLogout } from '../features/auth/use-auth.ts';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 items-center rounded-t-md border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
    isActive
      ? 'border-brand-600 text-brand-700'
      : 'border-transparent text-stone-600 hover:border-stone-300 hover:text-stone-900'
  }`;

/** Menú de las páginas disponibles para el usuario autenticado. */
export function AppLayout() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const canReadSuppliers = useHasPermission(PERMISSIONS.SUPPLIERS_READ);
  const canReadUsers = useHasPermission(PERMISSIONS.USERS_READ);
  const canReadCatalog = useHasPermission(PERMISSIONS.CATALOG_READ);
  const canReadInventory = useHasPermission(PERMISSIONS.INVENTORY_READ);

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex min-h-16 items-center justify-between gap-4">
            <Link
              to="/"
              className="font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              Joyería Sole
            </Link>
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
          <nav aria-label="Navegación principal" className="flex gap-1 overflow-x-auto">
            <NavLink to="/" end className={navLinkClass}>
              Inicio
            </NavLink>
            {canReadSuppliers && (
              <NavLink to="/proveedores" className={navLinkClass}>
                Proveedores
              </NavLink>
            )}
            {canReadUsers && (
              <NavLink to="/usuarios" className={navLinkClass}>
                Usuarios
              </NavLink>
            )}
            {canReadCatalog && (
              <NavLink to="/categorias" className={navLinkClass}>
                Categorías
              </NavLink>
            )}
            {canReadCatalog && (
              <NavLink to="/atributos" className={navLinkClass}>
                Atributos
              </NavLink>
            )}
            {canReadCatalog && (
              <NavLink to="/productos" className={navLinkClass}>
                Productos
              </NavLink>
            )}
            {canReadInventory && (
              <NavLink to="/inventario" className={navLinkClass}>
                Inventario
              </NavLink>
            )}
            <NavLink to="/mi-cuenta" className={navLinkClass}>
              Mi cuenta
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
