import { PERMISSIONS } from '@joyeria/shared';
import { Link } from 'react-router';
import { useCurrentUser, useHasPermission } from '../features/auth/use-auth.ts';

/** Inicio con acceso a los módulos disponibles según los permisos del usuario. */
export function HomePage() {
  const { data: user } = useCurrentUser();
  const canReadSuppliers = useHasPermission(PERMISSIONS.SUPPLIERS_READ);
  const canReadUsers = useHasPermission(PERMISSIONS.USERS_READ);
  const canReadCatalog = useHasPermission(PERMISSIONS.CATALOG_READ);
  const canReadInventory = useHasPermission(PERMISSIONS.INVENTORY_READ);
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Bienvenido/a, {user?.name}</h1>
        <p className="text-sm text-stone-600">Accede a las páginas disponibles para tu cuenta.</p>
      </div>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Páginas disponibles</h2>
        {canReadSuppliers ? (
          <Link
            to="/proveedores"
            className="block max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-xs transition-colors hover:border-brand-500 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <span className="block font-semibold text-brand-700">Proveedores →</span>
            <span className="mt-1 block text-sm text-stone-600">
              Consulta, registra y actualiza proveedores según tus permisos.
            </span>
          </Link>
        ) : (
          !canReadUsers && (
            <p className="text-sm text-stone-600">
              No hay módulos adicionales disponibles para tu cuenta.
            </p>
          )
        )}
        {canReadUsers && (
          <Link
            to="/usuarios"
            className="block max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-xs transition-colors hover:border-brand-500 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <span className="block font-semibold text-brand-700">Usuarios →</span>
            <span className="mt-1 block text-sm text-stone-600">
              Consulta las cuentas y los roles del equipo.
            </span>
          </Link>
        )}
        {canReadCatalog && (
          <Link
            to="/categorias"
            className="block max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-xs transition-colors hover:border-brand-500 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <span className="block font-semibold text-brand-700">Categorías →</span>
            <span className="mt-1 block text-sm text-stone-600">
              Consulta categorías y subcategorías de productos.
            </span>
          </Link>
        )}
        {canReadCatalog && (
          <Link
            to="/atributos"
            className="block max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-xs transition-colors hover:border-brand-500 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <span className="block font-semibold text-brand-700">Atributos →</span>
            <span className="mt-1 block text-sm text-stone-600">
              Consulta características y valores de las piezas.
            </span>
          </Link>
        )}
        {canReadCatalog && (
          <Link
            to="/productos"
            className="block max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-xs transition-colors hover:border-brand-500 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <span className="block font-semibold text-brand-700">Productos →</span>
            <span className="mt-1 block text-sm text-stone-600">
              Consulta piezas, SKU y códigos de barras.
            </span>
          </Link>
        )}
        {canReadInventory && (
          <Link
            to="/inventario"
            className="block max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-xs transition-colors hover:border-brand-500 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <span className="block font-semibold text-brand-700">Inventario →</span>
            <span className="mt-1 block text-sm text-stone-600">
              Consulta saldos, alertas e historial por variante.
            </span>
          </Link>
        )}
        <Link
          to="/mi-cuenta"
          className="block max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-xs transition-colors hover:border-brand-500 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <span className="block font-semibold text-brand-700">Mi cuenta →</span>
          <span className="mt-1 block text-sm text-stone-600">
            Consulta tu cuenta y cambia tu contraseña.
          </span>
        </Link>
      </div>
    </section>
  );
}
