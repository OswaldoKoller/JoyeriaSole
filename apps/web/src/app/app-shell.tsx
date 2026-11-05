import { PERMISSIONS, type Permission } from '@joyeria/shared';
import {
  ArrowLeftRight,
  Boxes,
  ClipboardCheck,
  FilePlus2,
  PackagePlus,
  Receipt,
  RotateCcw,
  ShoppingCart,
  Wrench,
  FolderTree,
  Gem,
  LayoutDashboard,
  ListPlus,
  LogOut,
  Menu,
  Package,
  SlidersHorizontal,
  Tag,
  Truck,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useCurrentUser, useLogout } from '../features/auth/use-auth.ts';

type Item = {
  label: string;
  icon: LucideIcon;
  /** Sin `to`: función planificada, se muestra deshabilitada como «Próximamente». */
  to?: string;
  /** Parámetro de búsqueda que distingue entradas que comparten ruta (p. ej. ?accion=inicial). */
  query?: string;
  permission?: Permission;
  /** Visible con AL MENOS UNO de estos permisos (alternativa a `permission`). */
  anyOf?: Permission[];
  end?: boolean;
};
type Group = { label: string; items: Item[] };

/**
 * Páginas implementadas (con `to`) y funciones planificadas (sin `to`). Cada entrada se muestra
 * solo si el usuario tiene el permiso. Las planificadas no son enlaces ni se implementan aquí.
 */
const GROUPS: Group[] = [
  { label: 'General', items: [{ label: 'Inicio', to: '/', icon: LayoutDashboard, end: true }] },
  {
    label: 'Catálogo',
    items: [
      { label: 'Productos', to: '/productos', icon: Package, permission: PERMISSIONS.CATALOG_READ },
      {
        label: 'Precios',
        to: '/precios',
        icon: Tag,
        anyOf: [PERMISSIONS.PRICES_PROPOSE, PERMISSIONS.PRICES_APPROVE],
      },
      {
        label: 'Categorías',
        to: '/categorias',
        icon: FolderTree,
        permission: PERMISSIONS.CATALOG_READ,
      },
      {
        label: 'Atributos',
        to: '/atributos',
        icon: SlidersHorizontal,
        permission: PERMISSIONS.CATALOG_READ,
      },
      {
        label: 'Etiquetas',
        to: '/catalogo/etiquetas',
        icon: Tag,
        permission: PERMISSIONS.CATALOG_READ,
      },
    ],
  },
  {
    label: 'Inventario',
    items: [
      {
        label: 'Saldos y alertas',
        to: '/inventario',
        icon: Boxes,
        permission: PERMISSIONS.INVENTORY_READ,
        end: true,
      },
      {
        label: 'Movimientos',
        to: '/inventario/movimientos',
        icon: ArrowLeftRight,
        permission: PERMISSIONS.INVENTORY_READ,
      },
      {
        label: 'Stock inicial',
        to: '/inventario',
        query: 'accion=inicial',
        icon: PackagePlus,
        permission: PERMISSIONS.INVENTORY_ADJUST,
      },
      {
        label: 'Ajustes',
        to: '/inventario/ajustes',
        icon: Wrench,
        permission: PERMISSIONS.INVENTORY_ADJUST,
      },
      {
        label: 'Conteo físico',
        icon: ClipboardCheck,
        permission: PERMISSIONS.INVENTORY_COUNTS_READ,
      },
    ],
  },
  {
    label: 'Compras',
    items: [
      {
        label: 'Proveedores',
        to: '/proveedores',
        icon: Truck,
        permission: PERMISSIONS.SUPPLIERS_READ,
      },
      {
        label: 'Ingresos de mercadería',
        to: '/ingresos',
        icon: FilePlus2,
        permission: PERMISSIONS.STOCK_ENTRIES_READ,
      },
      {
        label: 'Tipos de costo',
        to: '/configuracion/tipos-de-costo',
        icon: ListPlus,
        permission: PERMISSIONS.SETTINGS_MANAGE,
      },
    ],
  },
  {
    label: 'Acceso',
    items: [
      { label: 'Usuarios', to: '/usuarios', icon: Users, permission: PERMISSIONS.USERS_READ },
      { label: 'Mi cuenta', to: '/mi-cuenta', icon: UserRound },
    ],
  },
  {
    label: 'Ventas',
    items: [
      { label: 'Punto de venta', icon: ShoppingCart },
      { label: 'Historial de ventas', icon: Receipt },
      { label: 'Devoluciones', icon: RotateCcw },
    ],
  },
];

const BASE_LINK =
  'group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98]';

/** Activa la entrada que coincide con la ruta y, si comparte ruta, con su parámetro de búsqueda. */
function isActive(item: Item, pathname: string, search: string) {
  if (!item.to) return false;
  const sameRoute = item.end ? pathname === item.to : pathname.startsWith(item.to);
  if (!sameRoute) return false;
  const params = new URLSearchParams(search);
  if (item.query) {
    const [key = '', value = ''] = item.query.split('=');
    return params.get(key) === value;
  }
  // La entrada «base» deja de estar activa cuando otra entrada hermana usa un parámetro.
  return item.to !== '/inventario' || !params.has('accion');
}

function initials(name: string | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return (
    ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() ||
    '?'
  );
}

/**
 * Estructura de las páginas autenticadas: panel lateral fijo desde `lg` y cajón deslizable en
 * móvil. Mantiene un único `<nav aria-label="Navegación principal">`.
 */
export function AppShell() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const permissions = user?.permissions ?? [];
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="min-h-full lg:flex">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md"
      >
        Saltar al contenido
      </a>

      {/* Barra superior móvil */}
      <div className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-stone-200 bg-white/95 px-4 backdrop-blur lg:hidden">
        <span className="flex items-center gap-2 font-semibold text-brand-700">
          <Gem className="size-5" aria-hidden="true" /> Joyería Sole
        </span>
        <button
          type="button"
          aria-controls="panel-lateral"
          aria-expanded={open}
          onClick={() => {
            setOpen(true);
          }}
          className="flex size-10 items-center justify-center rounded-lg text-stone-700 transition-all duration-200 ease-out hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none active:scale-95"
        >
          <Menu className="size-5" aria-hidden="true" />
          <span className="sr-only">Abrir menú</span>
        </button>
      </div>

      {open && (
        <button
          type="button"
          aria-label="Cerrar menú"
          tabIndex={-1}
          onClick={() => {
            setOpen(false);
          }}
          className="fixed inset-0 z-30 bg-stone-900/40 lg:hidden"
        />
      )}

      <aside
        id="panel-lateral"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-stone-200 bg-white shadow-xl shadow-black/10 transition-[transform,visibility] duration-200 ease-out lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:translate-x-0 lg:shadow-none ${
          open ? 'translate-x-0' : '-translate-x-full max-lg:invisible'
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-4 lg:h-16 lg:px-5">
          <span className="flex items-center gap-2 text-base font-semibold text-brand-700">
            <Gem className="size-5" aria-hidden="true" /> Joyería Sole
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={() => {
              setOpen(false);
            }}
            className="flex size-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none lg:hidden"
          >
            <X className="size-5" aria-hidden="true" />
            <span className="sr-only">Cerrar menú</span>
          </button>
        </div>

        <nav
          aria-label="Navegación principal"
          className="flex-1 space-y-5 overflow-y-auto px-3 py-3"
        >
          {GROUPS.map((group) => {
            const visible = group.items.filter(
              (item) =>
                (!item.permission || permissions.includes(item.permission)) &&
                (!item.anyOf || item.anyOf.some((permission) => permissions.includes(permission))),
            );
            if (visible.length === 0) return null;
            return (
              <div key={group.label} className="space-y-1">
                <p className="px-3 text-[11px] font-semibold tracking-wider text-stone-400 uppercase">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {visible.map((item) => {
                    const active = isActive(item, pathname, search);
                    return (
                      <li key={item.label}>
                        {item.to ? (
                          <Link
                            to={item.query ? `${item.to}?${item.query}` : item.to}
                            aria-current={active ? 'page' : undefined}
                            className={`${BASE_LINK} ${
                              active
                                ? 'bg-brand-50 text-brand-700'
                                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                            }`}
                            onClick={() => {
                              setOpen(false);
                            }}
                          >
                            {active && (
                              <span
                                aria-hidden="true"
                                className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-600"
                              />
                            )}
                            <item.icon className="size-[18px] shrink-0" aria-hidden="true" />
                            {item.label}
                          </Link>
                        ) : (
                          <span
                            aria-disabled="true"
                            className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-stone-400"
                          >
                            <item.icon className="size-[18px] shrink-0" aria-hidden="true" />
                            <span className="flex-1">{item.label}</span>
                            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">
                              Próximamente
                            </span>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-stone-200 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700"
            >
              {initials(user?.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-stone-900">{user?.name}</p>
              <p className="truncate text-xs text-stone-500">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                logout.mutate();
              }}
              disabled={logout.isPending}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-stone-500 transition-all duration-200 ease-out hover:bg-stone-100 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none active:scale-95 disabled:opacity-60"
            >
              <LogOut className="size-[18px]" aria-hidden="true" />
              <span className="sr-only">Salir</span>
            </button>
          </div>
        </div>
      </aside>

      <main id="contenido" className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
        <div className="@container mx-auto w-full max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
