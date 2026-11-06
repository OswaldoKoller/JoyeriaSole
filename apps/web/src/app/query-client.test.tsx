import type { AuthUser } from '@joyeria/shared';
import { MutationObserver, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { authKeys } from '../features/auth/use-auth.ts';
import { RequireAuth } from '../features/auth/require-auth.tsx';
import { ApiError } from '../lib/api-client.ts';
import { createQueryClient } from './query-client.ts';

const user: AuthUser = {
  id: 'u',
  name: 'Ana',
  email: 'ana@test.local',
  roles: [],
  permissions: ['catalog:read'],
  mustChangePassword: false,
};

const unauthenticated = () =>
  new ApiError(401, { code: 'UNAUTHENTICATED', message: 'Sesión vencida' });

describe('valores por defecto del cliente de consultas', () => {
  it('datos frescos 30 s y en memoria 10 min', () => {
    const queries = createQueryClient().getDefaultOptions().queries;
    expect(queries?.staleTime).toBe(30_000);
    expect(queries?.gcTime).toBe(10 * 60_000);
  });

  it('los datos de referencia se consideran frescos 5 minutos', () => {
    const client = createQueryClient();
    for (const key of [
      ['categories'],
      ['attributes', { includeInactive: false }],
      ['suppliers', 'active-picker'],
      ['stock-entry-cost-types'],
      ['adjustments', 'reasons'],
    ]) {
      expect(client.getQueryDefaults(key).staleTime).toBe(5 * 60_000);
    }
    // Los listados no heredan ese tiempo largo.
    expect(client.getQueryDefaults(['products', { page: 1 }]).staleTime).toBeUndefined();
    expect(client.getQueryDefaults(['suppliers', 1, '', 'all', 'all']).staleTime).toBeUndefined();
  });
});

describe('sesión vencida (401 en cualquier petición)', () => {
  it('una consulta con 401 descarta al usuario y limpia los datos en caché', async () => {
    const client = createQueryClient();
    client.setQueryData(authKeys.me, user);
    client.setQueryData(['products', 'lista'], { data: [] });

    await client
      .query({ queryKey: ['inventory'], queryFn: () => Promise.reject(unauthenticated()) })
      .catch(() => undefined);

    expect(client.getQueryData(authKeys.me)).toBeNull();
    expect(client.getQueryData(['products', 'lista'])).toBeUndefined();
  });

  it('una mutación con 401 hace lo mismo', async () => {
    const client = createQueryClient();
    client.setQueryData(authKeys.me, user);

    await new MutationObserver(client, {
      mutationFn: () => Promise.reject(unauthenticated()),
    })
      .mutate()
      .catch(() => undefined);

    expect(client.getQueryData(authKeys.me)).toBeNull();
  });

  it('credenciales incorrectas en el login (sin usuario previo) no tocan la sesión', async () => {
    const client = createQueryClient();
    client.setQueryData(authKeys.me, null);

    await new MutationObserver(client, {
      mutationFn: () => Promise.reject(unauthenticated()),
    })
      .mutate()
      .catch(() => undefined);

    expect(client.getQueryData(authKeys.me)).toBeNull();
  });

  it('un 403 (falta de permiso) no cierra la sesión', async () => {
    const client = createQueryClient();
    client.setQueryData(authKeys.me, user);

    await client
      .query({
        queryKey: ['users'],
        queryFn: () =>
          Promise.reject(new ApiError(403, { code: 'FORBIDDEN', message: 'Sin permiso' })),
      })
      .catch(() => undefined);

    expect(client.getQueryData(authKeys.me)).toEqual(user);
  });

  it('RequireAuth redirige al login cuando una petición responde 401', async () => {
    const client = createQueryClient();
    client.setDefaultOptions({
      ...client.getDefaultOptions(),
      queries: { ...client.getDefaultOptions().queries, retry: false },
    });
    client.setQueryData(authKeys.me, user);

    function Secret() {
      useQuery({ queryKey: ['inventory'], queryFn: () => Promise.reject(unauthenticated()) });
      return <p>Contenido protegido</p>;
    }

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/inventario']}>
          <Routes>
            <Route path="/login" element={<p>Pantalla de ingreso</p>} />
            <Route
              path="/inventario"
              element={
                <RequireAuth>
                  <Secret />
                </RequireAuth>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Pantalla de ingreso')).toBeInTheDocument();
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument();
  });
});
