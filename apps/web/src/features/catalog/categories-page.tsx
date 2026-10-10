import {
  PERMISSIONS,
  createCategorySchema,
  updateCategorySchema,
  type Category,
} from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useHasPermission } from '../auth/use-auth.ts';
import { useCategories, useCreateCategory, useUpdateCategory } from './use-categories.ts';

function CategoryForm({
  roots,
  editing,
  onClose,
}: {
  roots: Category[];
  editing?: Category;
  onClose: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [parentId, setParentId] = useState(editing?.parentId ?? '');
  const [error, setError] = useState('');
  const create = useCreateCategory();
  const update = useUpdateCategory();

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { name, description: description || null };
    const result = editing
      ? updateCategorySchema.safeParse(payload)
      : createCategorySchema.safeParse({ ...payload, parentId: parentId || null });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setError('');
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input: updateCategorySchema.parse(payload) });
      } else {
        await create.mutateAsync(
          createCategorySchema.parse({ ...payload, parentId: parentId || null }),
        );
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la categoría');
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
    >
      <h2 className="text-lg font-semibold">{editing ? 'Editar categoría' : 'Nueva categoría'}</h2>
      <Input
        label="Nombre de categoría"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
        maxLength={120}
        required
      />
      {!editing && (
        <div className="space-y-1">
          <label htmlFor="category-parent" className="block text-sm font-medium text-stone-700">
            Categoría principal
          </label>
          <select
            id="category-parent"
            value={parentId}
            onChange={(event) => {
              setParentId(event.target.value);
            }}
            className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          >
            <option value="">Ninguna: categoría principal</option>
            {roots.map((root) => (
              <option key={root.id} value={root.id}>
                {root.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor="category-description" className="block text-sm font-medium text-stone-700">
          Descripción (opcional)
        </label>
        <textarea
          id="category-description"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
          maxLength={2000}
          className="block min-h-20 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-brand-500"
        />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending || update.isPending}>
          Guardar categoría
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function CategoriesPage() {
  const canManage = useHasPermission(PERMISSIONS.CATALOG_MANAGE);
  const list = useCategories();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const all = list.data?.data ?? [];
  const roots = all.filter((item) => item.parentId === null);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Categorías</h1>
          <p className="text-sm text-stone-600">
            Organiza productos en categorías y subcategorías.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setCreating(true);
              setEditing(null);
            }}
          >
            Nueva categoría
          </Button>
        )}
      </div>
      {creating && canManage && (
        <CategoryForm
          key="new"
          roots={roots}
          onClose={() => {
            setCreating(false);
          }}
        />
      )}
      {editing && canManage && (
        <CategoryForm
          key={editing.id}
          roots={roots}
          editing={editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
      {list.isPending && <p role="status">Cargando categorías…</p>}
      {list.isError && (
        <p role="alert" className="text-red-700">
          No se pudieron cargar las categorías.{' '}
          <button className="underline" onClick={() => void list.refetch()}>
            Reintentar
          </button>
        </p>
      )}
      {list.isSuccess && roots.length === 0 && (
        <p className="rounded-xl border border-stone-200 bg-white p-5 text-sm text-stone-600">
          Aún no hay categorías.
        </p>
      )}
      {list.isSuccess && roots.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {roots.map((root) => (
            <section
              key={root.id}
              className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{root.name}</h2>
                  {root.description && (
                    <p className="mt-1 text-sm text-stone-600">{root.description}</p>
                  )}
                </div>
                {canManage && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditing(root);
                      setCreating(false);
                    }}
                  >
                    Editar {root.name}
                  </Button>
                )}
              </div>
              <ul className="mt-4 space-y-2 border-t border-stone-100 pt-3">
                {all
                  .filter((item) => item.parentId === root.id)
                  .map((child) => (
                    <li key={child.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>{child.name}</span>
                      {canManage && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditing(child);
                            setCreating(false);
                          }}
                        >
                          Editar {child.name}
                        </Button>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
