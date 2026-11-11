import {
  ROLES,
  createRoleSchema,
  updateRoleSchema,
  type PermissionCatalog,
  type RoleDetail,
} from '@joyeria/shared';
import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useCreateRole, useUpdateRole } from './use-roles.ts';

/**
 * Alta, edición o consulta de un rol. Refleja las salvaguardas de la API (que es quien las aplica):
 * el Administrador es de solo lectura; los demás roles de sistema no cambian nombre ni descripción
 * y sus permisos base no se pueden desmarcar.
 */
export function RoleForm({
  role,
  catalog,
  canManage,
  onClose,
}: {
  role: RoleDetail | null;
  catalog: PermissionCatalog;
  canManage: boolean;
  onClose: () => void;
}) {
  const create = useCreateRole();
  const update = useUpdateRole();
  const idPrefix = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<string[]>(role?.permissions ?? []);
  const [error, setError] = useState('');

  const isAdmin = role?.code === ROLES.ADMIN;
  const readOnly = !canManage || isAdmin;
  const fixedIdentity = readOnly || !!role?.isSystem;
  const locked = new Set(role?.lockedPermissions ?? []);
  const pending = create.isPending || update.isPending;
  const title = role ? (readOnly ? `Rol ${role.name}` : `Editar rol ${role.name}`) : 'Nuevo rol';

  // Al abrir el formulario el foco va a su título: el lector de pantalla anuncia dónde está.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function toggle(code: string) {
    setSelected((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    // Validación con los mismos esquemas que la API. En un rol de sistema solo se envían permisos.
    const created = role
      ? null
      : createRoleSchema.safeParse({ name, description, permissions: selected });
    const updated = role
      ? updateRoleSchema.safeParse(
          role.isSystem ? { permissions: selected } : { name, description, permissions: selected },
        )
      : null;
    const failed =
      (created && !created.success && created.error) ||
      (updated && !updated.success && updated.error);
    if (failed) {
      setError(failed.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setError('');
    try {
      if (role && updated?.success) await update.mutateAsync({ id: role.id, input: updated.data });
      if (created?.success) await create.mutateAsync(created.data);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el rol');
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      aria-labelledby={`${idPrefix}-title`}
      className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id={`${idPrefix}-title`}
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          {title}
        </h2>
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Cerrar
        </Button>
      </div>
      {isAdmin && (
        <p className="rounded-lg bg-stone-100 p-3 text-sm text-stone-700">
          El rol Administrador es del sistema: conserva siempre todos los permisos y no se puede
          renombrar ni eliminar.
        </p>
      )}
      {!isAdmin && role?.isSystem && canManage && (
        <p className="rounded-lg bg-stone-100 p-3 text-sm text-stone-700">
          Rol del sistema: el nombre, la descripción y los permisos base (marcados como «base») no
          se pueden cambiar. Puede agregarle otros permisos.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Nombre del rol"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          maxLength={100}
          required
          readOnly={fixedIdentity}
        />
        <Input
          label="Descripción del rol"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
          maxLength={500}
          readOnly={fixedIdentity}
        />
      </div>
      <div className="space-y-4">
        <p className="text-sm text-stone-600" id={`${idPrefix}-count`} aria-live="polite">
          {selected.length} permiso(s) seleccionado(s)
        </p>
        {catalog.map((area) => (
          <fieldset key={area.code} className="space-y-2 rounded-lg border border-stone-200 p-3">
            <legend className="px-1 font-medium">{area.label}</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {area.permissions.map((permission) => {
                const id = `${idPrefix}-${permission.code}`;
                const isLocked = locked.has(permission.code);
                return (
                  <label
                    key={permission.code}
                    htmlFor={id}
                    className="flex min-h-10 items-start gap-2 rounded-md p-1 text-sm"
                  >
                    <input
                      id={id}
                      type="checkbox"
                      checked={selected.includes(permission.code)}
                      disabled={readOnly || isLocked}
                      onChange={() => {
                        toggle(permission.code);
                      }}
                      className="mt-0.5 size-4 accent-brand-600"
                    />
                    <span>
                      {permission.description}
                      <span className="block text-xs text-stone-500">
                        {permission.code}
                        {isLocked && !isAdmin && ' · base'}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {!readOnly && (
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Guardando…' : role ? 'Guardar rol' : 'Crear rol'}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
        </div>
      )}
    </form>
  );
}
