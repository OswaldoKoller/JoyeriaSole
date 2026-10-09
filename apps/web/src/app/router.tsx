import { createBrowserRouter } from 'react-router';
import { LoginPage } from '../features/auth/login-page.tsx';
import { RequireAuth } from '../features/auth/require-auth.tsx';
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
    children: [{ index: true, element: <HomePage /> }],
  },
  { path: '*', element: <NotFoundPage /> },
]);
