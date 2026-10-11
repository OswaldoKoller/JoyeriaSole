import { PERMISSIONS, type UserSummary } from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useHasPermission } from '../auth/use-auth.ts';
import { UserCreateForm } from './user-create-form.tsx';
import { UserEditor } from './user-editor.tsx';
import { useUpdateUser, useUsers } from './use-users.ts';

export function UsersPage() {
  const canManage = useHasPermission(PERMISSIONS.USERS_MANAGE);
  const canManageRoles = useHasPermission(PERMISSIONS.ROLES_MANAGE);
  const [page, setPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<UserSummary | null>(null);
  const [actionError, setActionError] = useState('');
  const [creating, setCreating] = useState(false);
  const list = useUsers(page, search, status);
  const update = useUpdateUser();
  const users = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;

  function submitSearch(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
  }

  async function changeStatus(user: UserSummary) {
    const action = user.isActive ? 'desactivar' : 'activar';
    if (!window.confirm(`¿Desea ${action} a ${user.name}?`)) return;
    setActionError('');
    try {
      await update.mutateAsync({ id: user.id, input: { isActive: !user.isActive } });
      setEditing(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `No se pudo ${action} el usuario`);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <p className="text-sm text-stone-600">
          Consulta quién tiene acceso al sistema y sus roles.
        </p>
        {canManage && canManageRoles && (
          <Button
            className="mt-3"
            onClick={() => {
              setCreating(true);
              setEditing(null);
            }}
          >
            Nuevo usuario
          </Button>
        )}
      </div>
      {creating && (
        <UserCreateForm
          onClose={() => {
            setCreating(false);
          }}
        />
      )}
      {editing && canManage && (
        <UserEditor
          key={editing.id}
          user={editing}
          canManageRoles={canManageRoles}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {actionError}
        </p>
      )}
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        <form onSubmit={submitSearch} className="flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1">
            <Input
              label="Buscar por nombre o correo"
              value={draftSearch}
              onChange={(event) => {
                setDraftSearch(event.target.value);
              }}
              maxLength={100}
            />
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
          <div className="space-y-1">
            <label htmlFor="user-status" className="block text-sm font-medium text-stone-700">
              Estado
            </label>
            <select
              id="user-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>
        </form>

        {list.isPending && (
          <p role="status" className="py-6 text-sm">
            Cargando usuarios…
          </p>
        )}
        {list.isError && (
          <p role="alert" className="py-6 text-sm text-red-700">
            No se pudieron cargar los usuarios.{' '}
            <button className="underline" onClick={() => void list.refetch()}>
              Reintentar
            </button>
          </p>
        )}
        {list.isSuccess && users.length === 0 && (
          <p className="py-6 text-sm text-stone-600">No se encontraron usuarios.</p>
        )}
        {list.isSuccess && users.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="table-cards w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Correo</th>
                  <th className="py-2 pr-4">Roles</th>
                  <th className="py-2 pr-4">Estado</th>
                  {canManage && <th className="py-2">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-stone-100">
                    <td className="py-3 pr-4 font-medium">{user.name}</td>
                    <td data-label="Correo" className="py-3 pr-4">
                      {user.email}
                    </td>
                    <td data-label="Roles" className="py-3 pr-4">
                      {user.roles.map((role) => role.name).join(', ') || 'Sin rol'}
                    </td>
                    <td data-label="Estado" className="py-3 pr-4">
                      {user.isActive ? 'Activo' : 'Inactivo'}
                    </td>
                    {canManage && (
                      <td className="flex gap-2 py-2">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditing(user);
                            setActionError('');
                          }}
                        >
                          Editar {user.name}
                        </Button>
                        <Button
                          variant={user.isActive ? 'danger' : 'secondary'}
                          disabled={update.isPending}
                          onClick={() => void changeStatus(user)}
                        >
                          {user.isActive ? 'Desactivar' : 'Activar'} {user.name}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.isSuccess && total > 25 && (
          <div className="mt-4 flex items-center gap-3 text-sm">
            <Button
              variant="secondary"
              disabled={page === 1}
              onClick={() => {
                setPage(page - 1);
              }}
            >
              Anterior
            </Button>
            <span>
              Página {page} · {total} usuarios
            </span>
            <Button
              variant="secondary"
              disabled={page * 25 >= total}
              onClick={() => {
                setPage(page + 1);
              }}
            >
              Siguiente
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
