import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  groupPermissions,
  type RoleDetail,
} from '@joyeria/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../test/render.tsx';
import { RolesPage } from './roles-page.tsx';

const ADMIN: RoleDetail = {
  id: '01900000-0000-7000-8000-0000000000a1',
  code: 'ADMIN',
  name: 'Administrador',
  description: 'Acceso total al sistema',
  isSystem: true,
  permissions: [...ALL_PERMISSIONS],
  lockedPermissions: [...ALL_PERMISSIONS],
  userCount: 2,
};
const SELLER: RoleDetail = {
  id: '01900000-0000-7000-8000-0000000000a2',
  code: 'SELLER',
  name: 'Vendedor',
  description: 'Consulta de catálogo y stock',
  isSystem: true,
  permissions: [...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions],
  lockedPermissions: [...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions],
  userCount: 0,
};
const CUSTOM: RoleDetail = {
  id: '01900000-0000-7000-8000-0000000000a3',
  code: 'CUSTOM_CAJERO',
  name: 'Cajero',
  description: null,
  isSystem: false,
  permissions: ['catalog:read'],
  lockedPermissions: [],
  userCount: 1,
};
const EMPTY: RoleDetail = {
  ...CUSTOM,
  id: CUSTOM.id.replace('a3', 'a4'),
  name: 'Sin uso',
  userCount: 0,
};

type Call = { method: string; url: string; body: unknown };

function mockApi(permissions: string[]) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    if (url.endsWith('/auth/me')) {
      return jsonResponse(200, {
        data: { id: 'u', name: 'Ana', email: 'a@test.local', roles: [], permissions },
      });
    }
    if (url.endsWith('/roles/permissions')) {
      return jsonResponse(200, { data: groupPermissions() });
    }
    if (url.endsWith('/roles') && method === 'GET') {
      return jsonResponse(200, { data: [ADMIN, SELLER, CUSTOM, EMPTY] });
    }
    if (url.endsWith('/roles') && method === 'POST') {
      return jsonResponse(201, { data: { ...CUSTOM, id: CUSTOM.id.replace('a3', 'a9') } });
    }
    if (method === 'PATCH') return jsonResponse(200, { data: SELLER });
    if (method === 'DELETE') return jsonResponse(204);
    return Promise.reject(new Error(`Petición inesperada: ${method} ${url}`));
  });
  return calls;
}

afterEach(() => {
  vi.restoreAllMocks();
});

const row = (name: string) => screen.getByRole('row', { name: new RegExp(`^${name}`) });

describe('página de roles', () => {
  it('lista los roles con su tipo y usuarios; el Administrador solo se consulta', async () => {
    mockApi(['roles:read', 'roles:manage']);
    renderWithProviders(<RolesPage />);
    expect(await screen.findByRole('heading', { name: 'Roles' })).toBeInTheDocument();
    await screen.findByText('Cajero');

    expect(within(row('Administrador')).getByText('Del sistema')).toBeInTheDocument();
    expect(within(row('Administrador')).getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver Administrador' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Editar Administrador' })).toBeNull();
    expect(await screen.findByRole('button', { name: 'Eliminar Cajero' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Eliminar Sin uso' })).toBeEnabled();
    // Los roles de sistema no se eliminan; uno personalizado con usuarios tampoco.
    expect(screen.queryByRole('button', { name: 'Eliminar Vendedor' })).toBeNull();
  });

  it('crea un rol con casillas agrupadas por área y lleva el foco al formulario', async () => {
    const calls = mockApi(['roles:read', 'roles:manage']);
    const user = userEvent.setup();
    renderWithProviders(<RolesPage />);
    await user.click(await screen.findByRole('button', { name: 'Nuevo rol' }));

    const title = await screen.findByRole('heading', { name: 'Nuevo rol' });
    await waitFor(() => {
      expect(title).toHaveFocus();
    });
    const form = screen.getByRole('form', { name: 'Nuevo rol' });
    expect(within(form).getByRole('group', { name: 'Usuarios y roles' })).toBeInTheDocument();
    const purchases = within(form).getByRole('group', { name: 'Proveedores e ingresos' });

    // Sin permisos: valida con el esquema compartido y no llama a la API.
    await user.type(within(form).getByLabelText('Nombre del rol'), 'Compras');
    await user.click(within(form).getByRole('button', { name: 'Crear rol' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Seleccione al menos un permiso',
    );
    expect(calls.some((call) => call.method === 'POST')).toBe(false);

    await user.click(within(purchases).getByLabelText(/Ver proveedores/));
    await user.click(within(purchases).getByLabelText(/Ver ingresos de mercadería/));
    await user.click(within(form).getByRole('button', { name: 'Crear rol' }));
    await waitFor(() => {
      expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
        name: 'Compras',
        description: null,
        permissions: ['suppliers:read', 'stock-entries:read'],
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole('form', { name: 'Nuevo rol' })).toBeNull();
    });
  });

  it('en un rol de sistema bloquea nombre y permisos base y solo envía los permisos', async () => {
    const calls = mockApi(['roles:read', 'roles:manage']);
    const user = userEvent.setup();
    renderWithProviders(<RolesPage />);
    await user.click(await screen.findByRole('button', { name: 'Editar Vendedor' }));
    const form = await screen.findByRole('form', { name: 'Editar rol Vendedor' });

    expect(within(form).getByLabelText('Nombre del rol')).toHaveAttribute('readonly');
    expect(within(form).getByLabelText(/Ver catálogo/)).toBeDisabled();
    expect(within(form).getByLabelText(/Ver catálogo/)).toBeChecked();
    await user.click(within(form).getByLabelText(/Ver proveedores/));
    await user.click(within(form).getByRole('button', { name: 'Guardar rol' }));

    await waitFor(() => {
      expect(calls.find((call) => call.method === 'PATCH')).toMatchObject({
        url: expect.stringContaining(`/roles/${SELLER.id}`) as unknown,
        body: { permissions: [...SELLER.permissions, 'suppliers:read'] },
      });
    });
  });

  it('el Administrador se muestra de solo lectura', async () => {
    mockApi(['roles:read', 'roles:manage']);
    const user = userEvent.setup();
    renderWithProviders(<RolesPage />);
    await user.click(await screen.findByRole('button', { name: 'Ver Administrador' }));
    const form = await screen.findByRole('form', { name: 'Rol Administrador' });
    expect(within(form).getByText(/conserva siempre todos los permisos/)).toBeInTheDocument();
    for (const box of within(form).getAllByRole('checkbox')) expect(box).toBeDisabled();
    expect(within(form).queryByRole('button', { name: 'Guardar rol' })).toBeNull();
  });

  it('elimina un rol sin usuarios tras confirmar', async () => {
    const calls = mockApi(['roles:read', 'roles:manage']);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWithProviders(<RolesPage />);
    await user.click(await screen.findByRole('button', { name: 'Eliminar Sin uso' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Rol Sin uso eliminado.');
    expect(calls.find((call) => call.method === 'DELETE')?.url).toContain(`/roles/${EMPTY.id}`);
  });

  it('sin roles:manage solo permite consultar', async () => {
    mockApi(['roles:read']);
    renderWithProviders(<RolesPage />);
    await screen.findByText('Cajero');
    expect(screen.queryByRole('button', { name: 'Nuevo rol' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ver Vendedor' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Eliminar/ })).toBeNull();
  });
});
