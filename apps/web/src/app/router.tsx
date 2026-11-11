import { PERMISSIONS } from '@joyeria/shared';
import { createBrowserRouter } from 'react-router';
import { AccountPage } from '../features/auth/account-page.tsx';
import { LoginPage } from '../features/auth/login-page.tsx';
import { RequireAuth } from '../features/auth/require-auth.tsx';
import { DashboardPage } from '../features/dashboard/dashboard-page.tsx';
import { NotFoundPage } from '../pages/not-found-page.tsx';
import { AppShell } from './app-shell.tsx';
import { lazyPage } from './lazy-page.tsx';
import { RouteError } from './route-error.tsx';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [
      {
        // Ruta sin ruta propia: un error en una sección no tumba el panel lateral.
        errorElement: <RouteError />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'mi-cuenta', element: <AccountPage /> },
          {
            path: 'proveedores',
            element: lazyPage(
              () =>
                import('../features/suppliers/suppliers-page.tsx').then((m) => ({
                  default: m.SuppliersPage,
                })),
              { permissions: [PERMISSIONS.SUPPLIERS_READ] },
            ),
          },
          {
            path: 'usuarios',
            element: lazyPage(
              () =>
                import('../features/users/users-page.tsx').then((m) => ({ default: m.UsersPage })),
              { permissions: [PERMISSIONS.USERS_READ] },
            ),
          },
          {
            path: 'roles',
            element: lazyPage(
              () =>
                import('../features/roles/roles-page.tsx').then((m) => ({ default: m.RolesPage })),
              { permissions: [PERMISSIONS.ROLES_READ] },
            ),
          },
          {
            path: 'categorias',
            element: lazyPage(
              () =>
                import('../features/catalog/categories-page.tsx').then((m) => ({
                  default: m.CategoriesPage,
                })),
              { permissions: [PERMISSIONS.CATALOG_READ] },
            ),
          },
          {
            path: 'atributos',
            element: lazyPage(
              () =>
                import('../features/catalog/attributes-page.tsx').then((m) => ({
                  default: m.AttributesPage,
                })),
              { permissions: [PERMISSIONS.CATALOG_READ] },
            ),
          },
          {
            path: 'productos',
            element: lazyPage(
              () =>
                import('../features/catalog/products-page.tsx').then((m) => ({
                  default: m.ProductsPage,
                })),
              { permissions: [PERMISSIONS.CATALOG_READ] },
            ),
          },
          {
            path: 'productos/:id',
            element: lazyPage(
              () =>
                import('../features/catalog/product-detail-page.tsx').then((m) => ({
                  default: m.ProductDetailPage,
                })),
              { permissions: [PERMISSIONS.CATALOG_READ] },
            ),
          },
          {
            path: 'catalogo/etiquetas',
            element: lazyPage(
              () =>
                import('../features/catalog/labels-page.tsx').then((m) => ({
                  default: m.LabelsPage,
                })),
              { permissions: [PERMISSIONS.CATALOG_READ] },
            ),
          },
          {
            path: 'precios',
            element: lazyPage(
              () =>
                import('../features/pricing/pricing-page.tsx').then((m) => ({
                  default: m.PricingPage,
                })),
              { anyPermissions: [PERMISSIONS.PRICES_PROPOSE, PERMISSIONS.PRICES_APPROVE] },
            ),
          },
          {
            path: 'inventario',
            element: lazyPage(
              () =>
                import('../features/inventory/inventory-page.tsx').then((m) => ({
                  default: m.InventoryPage,
                })),
              { permissions: [PERMISSIONS.INVENTORY_READ] },
            ),
          },
          {
            path: 'inventario/movimientos',
            element: lazyPage(
              () =>
                import('../features/inventory/movements-page.tsx').then((m) => ({
                  default: m.MovementsPage,
                })),
              { permissions: [PERMISSIONS.INVENTORY_READ] },
            ),
          },
          {
            path: 'inventario/ajustes',
            element: lazyPage(
              () =>
                import('../features/adjustments/adjustments-page.tsx').then((m) => ({
                  default: m.AdjustmentsPage,
                })),
              { permissions: [PERMISSIONS.INVENTORY_ADJUST] },
            ),
          },
          {
            path: 'inventario/ajustes/nuevo',
            element: lazyPage(
              () =>
                import('../features/adjustments/adjustment-new-page.tsx').then((m) => ({
                  default: m.AdjustmentNewPage,
                })),
              { permissions: [PERMISSIONS.INVENTORY_ADJUST, PERMISSIONS.INVENTORY_READ] },
            ),
          },
          {
            path: 'inventario/ajustes/:id',
            element: lazyPage(
              () =>
                import('../features/adjustments/adjustment-page.tsx').then((m) => ({
                  default: m.AdjustmentPage,
                })),
              { permissions: [PERMISSIONS.INVENTORY_ADJUST] },
            ),
          },
          {
            path: 'inventario/conteos',
            element: lazyPage(
              () =>
                import('../features/inventory-counts/counts-page.tsx').then((m) => ({
                  default: m.CountsPage,
                })),
              { permissions: [PERMISSIONS.INVENTORY_COUNTS_READ] },
            ),
          },
          {
            path: 'inventario/conteos/:id',
            element: lazyPage(
              () =>
                import('../features/inventory-counts/count-page.tsx').then((m) => ({
                  default: m.CountPage,
                })),
              { permissions: [PERMISSIONS.INVENTORY_COUNTS_READ] },
            ),
          },
          {
            path: 'ingresos',
            element: lazyPage(
              () =>
                import('../features/stock-entries/stock-entries-page.tsx').then((m) => ({
                  default: m.StockEntriesPage,
                })),
              { permissions: [PERMISSIONS.STOCK_ENTRIES_READ] },
            ),
          },
          {
            path: 'ingresos/nuevo',
            element: lazyPage(
              () =>
                import('../features/stock-entries/stock-entry-new-page.tsx').then((m) => ({
                  default: m.StockEntryNewPage,
                })),
              { permissions: [PERMISSIONS.STOCK_ENTRIES_MANAGE] },
            ),
          },
          {
            path: 'configuracion/tipos-de-costo',
            element: lazyPage(
              () =>
                import('../features/stock-entries/cost-types-page.tsx').then((m) => ({
                  default: m.CostTypesPage,
                })),
              { permissions: [PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.STOCK_ENTRIES_READ] },
            ),
          },
          {
            path: 'auditoria',
            element: lazyPage(
              () =>
                import('../features/audit/audit-page.tsx').then((m) => ({ default: m.AuditPage })),
              { permissions: [PERMISSIONS.AUDIT_READ] },
            ),
          },
          {
            path: 'ingresos/:id',
            element: lazyPage(
              () =>
                import('../features/stock-entries/stock-entry-page.tsx').then((m) => ({
                  default: m.StockEntryPage,
                })),
              { permissions: [PERMISSIONS.STOCK_ENTRIES_READ] },
            ),
          },
          // Caja única (E3, plan 11 §5.1).
          {
            path: 'caja',
            element: lazyPage(
              () => import('../features/cash/cash-page.tsx').then((m) => ({ default: m.CashPage })),
              { anyPermissions: [PERMISSIONS.CASH_READ, PERMISSIONS.SALES_CREATE] },
            ),
          },
          {
            path: 'caja/cierre',
            element: lazyPage(
              () =>
                import('../features/cash/cash-close-page.tsx').then((m) => ({
                  default: m.CashClosePage,
                })),
              { permissions: [PERMISSIONS.CASH_CLOSE, PERMISSIONS.CASH_READ] },
            ),
          },
          {
            path: 'caja/historial',
            element: lazyPage(
              () =>
                import('../features/cash/cash-history-page.tsx').then((m) => ({
                  default: m.CashHistoryPage,
                })),
              { permissions: [PERMISSIONS.CASH_READ] },
            ),
          },
          {
            path: 'caja/sesiones/:id',
            element: lazyPage(
              () =>
                import('../features/cash/cash-session-page.tsx').then((m) => ({
                  default: m.CashSessionPage,
                })),
              { permissions: [PERMISSIONS.CASH_READ] },
            ),
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
