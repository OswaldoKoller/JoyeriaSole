import { PERMISSIONS } from '@joyeria/shared';
import { createBrowserRouter } from 'react-router';
import { LoginPage } from '../features/auth/login-page.tsx';
import { AccountPage } from '../features/auth/account-page.tsx';
import { RequireAuth } from '../features/auth/require-auth.tsx';
import { SuppliersPage } from '../features/suppliers/suppliers-page.tsx';
import { UsersPage } from '../features/users/users-page.tsx';
import { CategoriesPage } from '../features/catalog/categories-page.tsx';
import { AttributesPage } from '../features/catalog/attributes-page.tsx';
import { ProductsPage } from '../features/catalog/products-page.tsx';
import { LabelsPage } from '../features/catalog/labels-page.tsx';
import { InventoryPage } from '../features/inventory/inventory-page.tsx';
import { MovementsPage } from '../features/inventory/movements-page.tsx';
import { AdjustmentPage } from '../features/adjustments/adjustment-page.tsx';
import { AdjustmentNewPage } from '../features/adjustments/adjustment-new-page.tsx';
import { AdjustmentsPage } from '../features/adjustments/adjustments-page.tsx';
import { StockEntriesPage } from '../features/stock-entries/stock-entries-page.tsx';
import { StockEntryNewPage } from '../features/stock-entries/stock-entry-new-page.tsx';
import { StockEntryPage } from '../features/stock-entries/stock-entry-page.tsx';
import { DashboardPage } from '../features/dashboard/dashboard-page.tsx';
import { NotFoundPage } from '../pages/not-found-page.tsx';
import { AppShell } from './app-shell.tsx';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    // Las rutas de los módulos de Fase 1 se agregan aquí, cada una con sus permisos:
    //   { path: 'productos', element: <RequireAuth permissions={['catalog:read']}>...</RequireAuth> }
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'mi-cuenta', element: <AccountPage /> },
      {
        path: 'proveedores',
        element: (
          <RequireAuth permissions={[PERMISSIONS.SUPPLIERS_READ]}>
            <SuppliersPage />
          </RequireAuth>
        ),
      },
      {
        path: 'usuarios',
        element: (
          <RequireAuth permissions={[PERMISSIONS.USERS_READ]}>
            <UsersPage />
          </RequireAuth>
        ),
      },
      {
        path: 'categorias',
        element: (
          <RequireAuth permissions={[PERMISSIONS.CATALOG_READ]}>
            <CategoriesPage />
          </RequireAuth>
        ),
      },
      {
        path: 'atributos',
        element: (
          <RequireAuth permissions={[PERMISSIONS.CATALOG_READ]}>
            <AttributesPage />
          </RequireAuth>
        ),
      },
      {
        path: 'productos',
        element: (
          <RequireAuth permissions={[PERMISSIONS.CATALOG_READ]}>
            <ProductsPage />
          </RequireAuth>
        ),
      },
      {
        path: 'catalogo/etiquetas',
        element: (
          <RequireAuth permissions={[PERMISSIONS.CATALOG_READ]}>
            <LabelsPage />
          </RequireAuth>
        ),
      },
      {
        path: 'inventario',
        element: (
          <RequireAuth permissions={[PERMISSIONS.INVENTORY_READ]}>
            <InventoryPage />
          </RequireAuth>
        ),
      },
      {
        path: 'inventario/movimientos',
        element: (
          <RequireAuth permissions={[PERMISSIONS.INVENTORY_READ]}>
            <MovementsPage />
          </RequireAuth>
        ),
      },
      {
        path: 'inventario/ajustes',
        element: (
          <RequireAuth permissions={[PERMISSIONS.INVENTORY_ADJUST]}>
            <AdjustmentsPage />
          </RequireAuth>
        ),
      },
      {
        path: 'inventario/ajustes/nuevo',
        element: (
          <RequireAuth permissions={[PERMISSIONS.INVENTORY_ADJUST, PERMISSIONS.INVENTORY_READ]}>
            <AdjustmentNewPage />
          </RequireAuth>
        ),
      },
      {
        path: 'inventario/ajustes/:id',
        element: (
          <RequireAuth permissions={[PERMISSIONS.INVENTORY_ADJUST]}>
            <AdjustmentPage />
          </RequireAuth>
        ),
      },
      {
        path: 'ingresos',
        element: (
          <RequireAuth permissions={[PERMISSIONS.STOCK_ENTRIES_READ]}>
            <StockEntriesPage />
          </RequireAuth>
        ),
      },
      {
        path: 'ingresos/nuevo',
        element: (
          <RequireAuth permissions={[PERMISSIONS.STOCK_ENTRIES_MANAGE]}>
            <StockEntryNewPage />
          </RequireAuth>
        ),
      },
      {
        path: 'ingresos/:id',
        element: (
          <RequireAuth permissions={[PERMISSIONS.STOCK_ENTRIES_READ]}>
            <StockEntryPage />
          </RequireAuth>
        ),
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
