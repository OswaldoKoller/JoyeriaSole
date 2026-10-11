import { createUserSchema } from '@joyeria/shared';
import { useId, useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useAvailableRoles, useCreateUser } from './use-users.ts';

export function UserCreateForm({ onClose }: { onClose: () => void }) {
  const roles = useAvailableRoles(true);
  const create = useCreateUser();
  const roleIdPrefix = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  function toggleRole(id: string) {
    setRoleIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== passwordConfirm) {
      setError('Las contraseñas no coinciden');
      return;
    }
    const result = createUserSchema.safeParse({ name, email, password, roleIds });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setError('');
    try {
      await create.mutateAsync(result.data);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear el usuario');
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Nuevo usuario</h2>
        <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
          Cerrar
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Nombre del nuevo usuario"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          maxLength={120}
          required
        />
        <Input
          label="Correo del nuevo usuario"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          maxLength={254}
          required
        />
        <Input
          label="Contraseña inicial"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          required
        />
        <Input
          label="Confirmar contraseña inicial"
          type="password"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(event) => {
            setPasswordConfirm(event.target.value);
          }}
          required
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="font-medium">Roles del usuario</legend>
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
      </fieldset>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending || !roles.isSuccess}>
          {create.isPending ? 'Creando…' : 'Crear usuario'}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
