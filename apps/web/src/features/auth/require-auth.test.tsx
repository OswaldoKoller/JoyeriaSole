import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../test/render.tsx';
import { RequireAuth } from './require-auth.tsx';

function mockUser(mustChangePassword: boolean) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(
      jsonResponse(200, {
        data: {
          id: 'u',
          name: 'Ana',
          email: 'ana@test.local',
          roles: [],
          permissions: ['catalog:read'],
          mustChangePassword,
        },
      }),
    ),
  );
}

describe('RequireAuth con clave temporal (F2)', () => {
  it('muestra solo el cambio de contraseña obligatorio, sin el contenido protegido', async () => {
    mockUser(true);
    renderWithProviders(
      <RequireAuth permissions={['catalog:read']}>
        <p>Contenido protegido</p>
      </RequireAuth>,
    );

    expect(await screen.findByText(/le asignó una contraseña temporal/)).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña temporal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument();
  });

  it('con clave normal muestra el contenido protegido', async () => {
    mockUser(false);
    renderWithProviders(
      <RequireAuth permissions={['catalog:read']}>
        <p>Contenido protegido</p>
      </RequireAuth>,
    );

    expect(await screen.findByText('Contenido protegido')).toBeInTheDocument();
    expect(screen.queryByText(/contraseña temporal/)).not.toBeInTheDocument();
  });
});
