import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageLoading } from '../components/ui/page-loading.tsx';
import { RouteError } from './route-error.tsx';

function renderFailingRoute() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <p>Inicio</p>,
        loader: () => {
          throw new Error('Failed to fetch dynamically imported module');
        },
        errorElement: <RouteError />,
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('RouteError y PageLoading', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('el aviso de carga es un estado anunciado con el texto en español', () => {
    render(<PageLoading />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Cargando…');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('«Recargar la página» vuelve a pedir la aplicación (por ejemplo tras un despliegue nuevo)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    renderFailingRoute();

    await userEvent.click(await screen.findByRole('button', { name: 'Recargar la página' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
