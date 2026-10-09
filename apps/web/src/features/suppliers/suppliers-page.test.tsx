import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../test/render.tsx';
import { SuppliersPage } from './suppliers-page.tsx';

describe('pantalla de proveedores', () => {
  it('permite consultar proveedores sin mostrar acciones a quien solo puede leer', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.endsWith('/auth/me')) {
        return jsonResponse(200, {
          data: {
            id: 'user',
            name: 'Vendedor',
            email: 'vendedor@test.local',
            roles: [],
            permissions: ['suppliers:read'],
          },
        });
      }
      if (url.startsWith('/api/v1/suppliers?')) {
        return jsonResponse(200, {
          data: [
            {
              id: '1',
              name: 'Taller Luna',
              taxId: null,
              contactName: null,
              phone: null,
              isActive: true,
            },
          ],
          meta: { page: 1, pageSize: 25, total: 1 },
        });
      }
      throw new Error(`Petición inesperada: ${url}`);
    });

    renderWithProviders(<SuppliersPage />);
    expect(await screen.findByText('Taller Luna')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo proveedor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar Taller Luna/ })).not.toBeInTheDocument();
  });
});
