import { PERMISSIONS, type RoleDetail } from '@joyeria/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { useHasPermission } from '../auth/use-auth.ts';
import { RoleForm } from './role-form.tsx';
import { useDeleteRole, usePermissionCatalog, useRoles } from './use-roles.ts';

type Editing = { mode: 'new' } | { mode: 'edit'; role: RoleDetail } | null;

/** Gestión de roles y sus permisos (P-46). Las salvaguardas las aplica la API. */
export function RolesPage() {
  useDocumentTitle('Roles');
  const canManage = useHasPermission(PERMISSIONS.ROLES_MANAGE);
  const roles = useRoles();
  const catalog = usePermissionCatalog();
  const remove = useDeleteRole();
  const [editing, setEditing] = useState<Editing>(null);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const list = roles.data?.data ?? [];

  async function deleteRole(role: RoleDetail) {
    if (!window.confirm(`¿Eliminar el rol ${role.name}? Esta acción no se puede deshacer.`)) return;
    setActionError('');
    setMessage('');
    try {
      await remove.mutateAsync(role.id);
      setEditing(null);
      setMessage(`Rol ${role.name} eliminado.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo eliminar el rol');
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Roles</h1>
        <p className="text-sm text-stone-600">
          Cada rol agrupa permisos; una persona puede tener varios roles. Los cambios rigen desde la
          siguiente acción de cada usuario, sin cerrar su sesión.
        </p>
        {canManage && (
          <Button
            className="mt-3"
            onClick={() => {
              setEditing({ mode: 'new' });
              setMessage('');
              setActionError('');
            }}
          >
            Nuevo rol
          </Button>
        )}
      </div>

      {editing && catalog.isSuccess && (
        <RoleForm
          key={editing.mode === 'edit' ? editing.role.id : 'new'}
          role={editing.mode === 'edit' ? editing.role : null}
          catalog={catalog.data.data}
          canManage={canManage}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
      {editing && catalog.isError && (
        <p role="alert" className="text-sm text-red-700">
          No se pudo cargar el catálogo de permisos.
        </p>
      )}
      {message && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {message}
        </p>
      )}
      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {actionError}
        </p>
      )}

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        {roles.isPending && (
          <p role="status" className="py-6 text-sm">
            Cargando roles…
          </p>
        )}
        {roles.isError && (
          <p role="alert" className="py-6 text-sm text-red-700">
            No se pudieron cargar los roles.{' '}
            <button className="underline" onClick={() => void roles.refetch()}>
              Reintentar
            </button>
          </p>
        )}
        {roles.isSuccess && list.length === 0 && (
          <p className="py-6 text-sm text-stone-600">No hay roles registrados.</p>
        )}
        {roles.isSuccess && list.length > 0 && (
          <div className="overflow-x-auto">
            <table className="table-cards w-full text-left text-sm">
              <caption className="sr-only">Roles y número de permisos y usuarios</caption>
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th className="py-2 pr-4">Rol</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4">Permisos</th>
                  <th className="py-2 pr-4">Usuarios</th>
                  <th className="py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {list.map((role) => {
                  const editable = canManage && role.code !== 'ADMIN';
                  return (
                    <tr key={role.id} className="border-b border-stone-100">
                      <td className="py-3 pr-4">
                        <span className="font-medium">{role.name}</span>
                        {role.description && (
                          <span className="block text-xs text-stone-600">{role.description}</span>
                        )}
                      </td>
                      <td data-label="Tipo" className="py-3 pr-4">
                        {role.isSystem ? 'Del sistema' : 'Personalizado'}
                      </td>
                      <td data-label="Permisos" className="py-3 pr-4">
                        {role.permissions.length}
                      </td>
                      <td data-label="Usuarios" className="py-3 pr-4">
                        {role.userCount}
                      </td>
                      <td className="flex flex-wrap gap-2 py-2">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditing({ mode: 'edit', role });
                            setMessage('');
                            setActionError('');
                          }}
                        >
                          {editable ? 'Editar' : 'Ver'} {role.name}
                        </Button>
                        {canManage && !role.isSystem && (
                          <Button
                            variant="danger"
                            disabled={remove.isPending || role.userCount > 0}
                            title={
                              role.userCount > 0
                                ? 'Quite el rol a sus usuarios antes de eliminarlo'
                                : undefined
                            }
                            onClick={() => void deleteRole(role)}
                          >
                            Eliminar {role.name}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
