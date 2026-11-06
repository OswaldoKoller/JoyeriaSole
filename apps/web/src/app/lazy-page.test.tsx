import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '../test/render.tsx';
import { createQueryClient } from './query-client.ts';
import { lazyPage } from './lazy-page.tsx';
import { RouteError } from './route-error.tsx';

function mockUser(permissions: string[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(
      jsonResponse(200, {
        data: { id: 'u', name: 'Ana', email: 'ana@test.local', roles: [], permissions },
      }),
    ),
  );
}

function renderRoute(element: React.ReactNode) {
  const router = createMemoryRouter([{ path: '/', element, errorElement: <RouteError /> }], {
    initialEntries: ['/'],
  });
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('lazyPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('descarga la sección y muestra un aviso de carga accesible mientras tanto', async () => {
    mockUser(['catalog:read']);
    let release: (module: { default: () => React.ReactNode }) => void = () => undefined;
    const loader = vi.fn(
      () =>
        new Promise<{ default: () => React.ReactNode }>((resolve) => {
          release = resolve;
        }),
    );
    renderRoute(lazyPage(loader, { permissions: ['catalog:read'] }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Cargando…');
    release({ default: () => <p>Sección cargada</p> });
    expect(await screen.findByText('Sección cargada')).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('sin permiso no descarga la sección', async () => {
    mockUser(['inventory:read']);
    const loader = vi.fn(() => Promise.resolve({ default: () => <p>Sección cargada</p> }));
    renderRoute(lazyPage(loader, { permissions: ['catalog:read'] }));

    expect(await screen.findByText('No tiene permiso para ver esta sección.')).toBeInTheDocument();
    expect(loader).not.toHaveBeenCalled();
  });

  it('si la descarga falla muestra el error en español con opción de recargar', async () => {
    mockUser(['catalog:read']);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const loader = vi.fn(() =>
      Promise.reject(new Error('Failed to fetch dynamically imported module')),
    );
    renderRoute(lazyPage(loader, { permissions: ['catalog:read'] }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Algo salió mal');
    expect(screen.getByRole('button', { name: 'Recargar la página' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/');
    expect(alert).not.toHaveTextContent('Failed to fetch');
  });
});
