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
import { InventoryPage } from '../features/inventory/inventory-page.tsx';
import { HomePage } from '../pages/home-page.tsx';
import { NotFoundPage } from '../pages/not-found-page.tsx';
import { AppLayout } from './layout.tsx';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    // Las rutas de los módulos de Fase 1 se agregan aquí, cada una con sus permisos:
    //   { path: 'productos', element: <RequireAuth permissions={['catalog:read']}>...</RequireAuth> }
    children: [
      { index: true, element: <HomePage /> },
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
        path: 'inventario',
        element: (
          <RequireAuth permissions={[PERMISSIONS.INVENTORY_READ]}>
            <InventoryPage />
          </RequireAuth>
        ),
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
