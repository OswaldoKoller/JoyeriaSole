import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../test/render.tsx';
import { AdjustmentNewPage } from './adjustment-new-page.tsx';
import { AdjustmentsPage } from './adjustments-page.tsx';

/**
 * Desde la regla del 2026-11-05 los ajustes los aprueba quien tiene `inventory:adjust-approve`
 * (por defecto Administrador y Responsable de inventario): ningún texto debe decir que solo los
 * aprueba el Administrador.
 */
function mockApi() {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith('/auth/me')) {
      return Promise.resolve(
        jsonResponse(200, {
          data: {
            id: '01900000-0000-7000-8000-000000000001',
            name: 'Responsable',
            email: 'r@test.local',
            roles: [],
            permissions: ['inventory:read', 'inventory:adjust'],
          },
        }),
      );
    }
    if (url.endsWith('/inventory/adjustments/reasons')) {
      return Promise.resolve(jsonResponse(200, { data: [] }));
    }
    return Promise.resolve(
      jsonResponse(200, { data: [], meta: { page: 1, pageSize: 25, total: 0 } }),
    );
  });
}

const ADMIN_ONLY = /(hasta que el|el|cuando el)\s+Administrador\s+(la\s+)?(apruebe|aprueba|revisa)/;

describe('textos de quién aprueba los ajustes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('el formulario de nuevo ajuste nombra a quien autoriza ajustes, no solo al Administrador', async () => {
    mockApi();
    renderWithProviders(<AdjustmentNewPage />, { route: '/inventario/ajustes/nuevo' });
    expect(await screen.findByRole('heading', { name: 'Solicitar ajuste' })).toBeInTheDocument();
    expect(
      screen.getByText(/queda pendiente hasta que la apruebe quien autoriza ajustes/),
    ).toHaveTextContent('(por defecto, el Administrador o el Responsable de inventario)');
    expect(screen.getByText(/Quien autoriza ajustes .* revisa y aprueba/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(ADMIN_ONLY);
  });

  it('la lista de ajustes tampoco dice que solo aprueba el Administrador', async () => {
    mockApi();
    renderWithProviders(<AdjustmentsPage />, { route: '/inventario/ajustes' });
    expect(
      await screen.findByText(/el stock solo cambia cuando las aprueba quien autoriza ajustes/),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(ADMIN_ONLY);
  });
});
