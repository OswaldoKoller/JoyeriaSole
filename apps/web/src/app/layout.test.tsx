import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../test/render.tsx';
import { AppLayout } from './layout.tsx';

describe('navegación principal', () => {
  it('muestra Inicio y oculta Proveedores sin permiso de lectura', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        data: {
          id: 'usuario',
          name: 'Vendedor',
          email: 'vendedor@test.local',
          roles: [],
          permissions: [],
        },
      }),
    );

    renderWithProviders(<AppLayout />);
    const menu = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(within(menu).getByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(menu).queryByRole('link', { name: 'Proveedores' })).not.toBeInTheDocument();
    expect(await screen.findByText('Vendedor')).toBeInTheDocument();
  });
});
