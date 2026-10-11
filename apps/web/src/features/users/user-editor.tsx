import { assignUserRolesSchema, updateUserSchema, type UserSummary } from '@joyeria/shared';
import { useId, useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useAssignUserRoles, useAvailableRoles, useUpdateUser } from './use-users.ts';

export function UserEditor({
  user,
  canManageRoles,
  onClose,
}: {
  user: UserSummary;
  canManageRoles: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [selectedRoles, setSelectedRoles] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const roleIdPrefix = useId();
  const update = useUpdateUser();
  const assign = useAssignUserRoles();
  const roles = useAvailableRoles(canManageRoles);
  const assignedRoleCodes = new Set(user.roles.map((role) => role.code));
  const roleIds =
    selectedRoles ??
    roles.data?.data.filter((role) => assignedRoleCodes.has(role.code)).map((role) => role.id) ??
    [];

  async function saveName(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = updateUserSchema.safeParse({ name });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Nombre inválido');
      return;
    }
    setError('');
    try {
      await update.mutateAsync({ id: user.id, input: result.data });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el usuario');
    }
  }

  async function saveRoles() {
    const result = assignUserRolesSchema.safeParse({ roleIds });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Seleccione al menos un rol');
      return;
    }
    setError('');
    try {
      await assign.mutateAsync({ id: user.id, input: result.data });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron asignar los roles');
    }
  }

  function toggleRole(id: string) {
    setSelectedRoles((current) => {
      const existing = current ?? roleIds;
      return existing.includes(id) ? existing.filter((item) => item !== id) : [...existing, id];
    });
  }

  return (
    <section
      aria-label={`Editar ${user.name}`}
      className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Editar {user.name}</h2>
        <Button
          variant="secondary"
          onClick={onClose}
          disabled={update.isPending || assign.isPending}
        >
          Cerrar
        </Button>
      </div>
      <p className="text-sm text-stone-600">{user.email}</p>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <form onSubmit={(event) => void saveName(event)} className="flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <Input
            label="Nombre del usuario"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            maxLength={120}
            required
          />
        </div>
        <Button type="submit" disabled={update.isPending}>
          Guardar nombre
        </Button>
      </form>
      {canManageRoles && (
        <div className="space-y-3 border-t border-stone-200 pt-4">
          <h3 className="font-medium">Roles</h3>
          {roles.isPending && (
            <p role="status" className="text-sm">
              Cargando roles…
            </p>
          )}
          {roles.isError && (
            <p role="alert" className="text-sm text-red-700">
              No se pudieron cargar los roles.
            </p>
          )}
          {roles.isSuccess && (
            <div className="flex flex-wrap gap-4">
              {roles.data.data.map((role) => (
                <label
                  key={role.id}
                  htmlFor={`${roleIdPrefix}-${role.id}`}
                  className="inline-flex min-h-10 items-center gap-2 pr-3 text-sm"
                >
                  <input
                    id={`${roleIdPrefix}-${role.id}`}
                    type="checkbox"
                    checked={roleIds.includes(role.id)}
                    onChange={() => {
                      toggleRole(role.id);
                    }}
                    className="size-4 accent-brand-600"
                  />
                  {role.name}
                </label>
              ))}
            </div>
          )}
          <Button disabled={!roles.isSuccess || assign.isPending} onClick={() => void saveRoles()}>
            Guardar roles
          </Button>
        </div>
      )}
    </section>
  );
}
