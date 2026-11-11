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

  it('Precios aparece solo con prices:propose o prices:approve', async () => {
    mockUser(['catalog:read', 'inventory:read']);
    const { unmount } = renderWithProviders(<AppShell />);
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    await within(nav).findByRole('link', { name: 'Productos' });
    expect(within(nav).queryByRole('link', { name: 'Precios' })).not.toBeInTheDocument();
    unmount();

    vi.restoreAllMocks();
    mockUser(['catalog:read', 'prices:approve']);
    renderWithProviders(<AppShell />);
    expect(await screen.findByRole('link', { name: 'Precios' })).toHaveAttribute(
      'href',
      '/precios',
    );
  });

  it('Auditoría aparece solo con audit:read', async () => {
    mockUser(['catalog:read', 'inventory:read', 'inventory:adjust', 'prices:propose']);
    const { unmount } = renderWithProviders(<AppShell />);
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    await within(nav).findByRole('link', { name: 'Productos' });
    expect(within(nav).queryByRole('link', { name: 'Auditoría' })).not.toBeInTheDocument();
    unmount();

    vi.restoreAllMocks();
    mockUser(['catalog:read', 'audit:read']);
    renderWithProviders(<AppShell />);
    expect(await screen.findByRole('link', { name: 'Auditoría' })).toHaveAttribute(
      'href',
      '/auditoria',
    );
  });

  it('Roles aparece solo con roles:read (P-46)', async () => {
    mockUser(['users:read', 'catalog:read']);
    const { unmount } = renderWithProviders(<AppShell />);
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    await within(nav).findByRole('link', { name: 'Usuarios' });
    expect(within(nav).queryByRole('link', { name: 'Roles' })).not.toBeInTheDocument();
    unmount();

    vi.restoreAllMocks();
    mockUser(['roles:read']);
    renderWithProviders(<AppShell />);
    expect(await screen.findByRole('link', { name: 'Roles' })).toHaveAttribute('href', '/roles');
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

  it('sin permisos de ventas no muestra el grupo Ventas', async () => {
    mockUser(['inventory:read', 'inventory:adjust']);
    renderWithProviders(<AppShell />);
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    await within(nav).findByRole('link', { name: 'Saldos y alertas' });
    expect(within(nav).queryByText('Ventas', { exact: true })).not.toBeInTheDocument();
    expect(within(nav).queryByText('Punto de venta')).not.toBeInTheDocument();
    expect(within(nav).queryByText('Próximamente')).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Ajustes' })).toHaveAttribute(
      'href',
      '/inventario/ajustes',
    );
  });

  it('el Vendedor ve punto de venta e historial, pero no caja ni incidencias', async () => {
    mockUser(['catalog:read', 'inventory:read', 'sales:create', 'sales:read']);
    renderWithProviders(<AppShell />, { route: '/ventas/nueva' });
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(await within(nav).findByRole('link', { name: 'Punto de venta' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // /ventas/nueva no marca también el historial.
    expect(within(nav).getByRole('link', { name: 'Historial de ventas' })).not.toHaveAttribute(
      'aria-current',
    );
    for (const name of ['Caja', 'Incidencias', 'Datos del negocio']) {
      expect(within(nav).queryByRole('link', { name })).not.toBeInTheDocument();
    }
    // Nunca se ofrece «Devoluciones» ni nada que revierta una venta (DEC-V07).
    expect(within(nav).queryByText(/Devoluci|Anula/)).not.toBeInTheDocument();
  });

  it('el Administrador ve caja, incidencias y datos del negocio', async () => {
    mockUser([
      'sales:create',
      'sales:read',
      'sales:read-all',
      'cash:read',
      'sales-incidents:manage',
      'settings:manage',
    ]);
    renderWithProviders(<AppShell />, { route: '/ventas/abc' });
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(await within(nav).findByRole('link', { name: 'Historial de ventas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Caja' })).toHaveAttribute('href', '/caja');
    expect(within(nav).getByRole('link', { name: 'Incidencias' })).toHaveAttribute(
      'href',
      '/ventas/incidencias',
    );
    expect(within(nav).getByRole('link', { name: 'Datos del negocio' })).toHaveAttribute(
      'href',
      '/configuracion/negocio',
    );
  });

  it('marca solo una entrada cuando dos comparten ruta (Saldos y Stock inicial)', async () => {
    mockUser(['inventory:read', 'inventory:adjust', 'inventory:initial-stock']);
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
