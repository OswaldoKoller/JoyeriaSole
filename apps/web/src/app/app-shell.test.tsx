import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../test/render.tsx';
import { AppShell } from './app-shell.tsx';

function mockUser(permissions: string[]) {
  // Una Response nueva por llamada: su cuerpo solo puede leerse una vez.
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(
      jsonResponse(200, {
        data: { id: 'u', name: 'María Pérez', email: 'm@test.local', roles: [], permissions },
      }),
    ),
  );
}

describe('panel lateral', () => {
  it('muestra solo las secciones permitidas y marca la página actual', async () => {
    mockUser(['catalog:read', 'inventory:read']);
    renderWithProviders(<AppShell />);

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    await within(nav).findByRole('link', { name: 'Productos' });
    expect(within(nav).getByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    for (const name of ['Productos', 'Saldos y alertas', 'Movimientos', 'Mi cuenta']) {
      expect(within(nav).getByRole('link', { name })).toBeVisible();
    }
    for (const name of ['Proveedores', 'Usuarios']) {
      expect(within(nav).queryByRole('link', { name })).not.toBeInTheDocument();
    }
    expect(await screen.findByText('María Pérez')).toBeInTheDocument();
    expect(screen.getByText('MP')).toBeInTheDocument();
  });

  it('el administrador ve todos los grupos', async () => {
    mockUser(['catalog:read', 'inventory:read', 'suppliers:read', 'users:read']);
    renderWithProviders(<AppShell />);
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    await within(nav).findByRole('link', { name: 'Usuarios' });
    for (const name of ['Proveedores', 'Usuarios', 'Categorías', 'Atributos']) {
      expect(within(nav).getByRole('link', { name })).toBeVisible();
    }
  });

  it('abre y cierra el cajón móvil con teclado', async () => {
    mockUser([]);
    renderWithProviders(<AppShell />);
    const user = userEvent.setup();

    const opener = screen.getByRole('button', { name: 'Abrir menú' });
    expect(opener).toHaveAttribute('aria-expanded', 'false');
    await user.click(opener);
    expect(opener).toHaveAttribute('aria-expanded', 'true');
    // El foco pasa al botón de cierre del cajón.
    const drawer = document.getElementById('panel-lateral');
    if (!drawer) throw new Error('Falta el panel lateral');
    expect(within(drawer).getByRole('button', { name: 'Cerrar menú' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(opener).toHaveAttribute('aria-expanded', 'false');
  });

  it('ofrece un enlace para saltar al contenido', () => {
    mockUser([]);
    renderWithProviders(<AppShell />);
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute(
      'href',
      '#contenido',
    );
  });

  it('muestra los módulos futuros como «Próximamente», sin enlace', async () => {
    mockUser(['inventory:read', 'inventory:adjust']);
    renderWithProviders(<AppShell />);
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    await within(nav).findByRole('link', { name: 'Saldos y alertas' });

    for (const name of ['Punto de venta', 'Historial de ventas']) {
      expect(within(nav).getByText(name)).toBeVisible();
      expect(within(nav).queryByRole('link', { name })).not.toBeInTheDocument();
    }
    expect(within(nav).getAllByText('Próximamente').length).toBeGreaterThanOrEqual(3);
    // Los ajustes ya están implementados (ADR-017): es un enlace real, no «Próximamente».
    expect(within(nav).getByRole('link', { name: 'Ajustes' })).toHaveAttribute(
      'href',
      '/inventario/ajustes',
    );
  });

  it('marca solo una entrada cuando dos comparten ruta (Saldos y Stock inicial)', async () => {
    mockUser(['inventory:read', 'inventory:adjust']);
    const { unmount } = renderWithProviders(<AppShell />, { route: '/inventario' });
    let nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(await within(nav).findByRole('link', { name: 'Stock inicial' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(within(nav).getByRole('link', { name: 'Saldos y alertas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    unmount();

    renderWithProviders(<AppShell />, { route: '/inventario?accion=inicial' });
    nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(await within(nav).findByRole('link', { name: 'Stock inicial' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Saldos y alertas' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
