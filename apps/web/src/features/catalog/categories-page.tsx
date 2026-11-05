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
import { useAttributes } from './use-attributes.ts';
import {
  useCategories,
  useCreateCategory,
  useSetCategoryAttributes,
  useUpdateCategory,
} from './use-categories.ts';

function CategoryForm({
  roots,
  editing,
  presetParentId,
  onClose,
}: {
  roots: Category[];
  editing?: Category;
  presetParentId?: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [parentId, setParentId] = useState(editing?.parentId ?? presetParentId ?? '');
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
            aria-describedby="category-levels-hint"
            className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          >
            <option value="">Ninguna: categoría principal</option>
            {roots
              .filter((root) => root.isActive)
              .map((root) => (
                <option key={root.id} value={root.id}>
                  {root.name}
                </option>
              ))}
          </select>
          <p id="category-levels-hint" className="text-xs text-stone-600">
            Solo hay dos niveles: categoría y subcategoría. Una subcategoría no tiene subniveles.
          </p>
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

type Row = { isRequired: boolean; isVariantAxisDefault: boolean };

/** Asigna atributos a una categoría: cuáles pide la ficha (obligatorio) y cuáles sugiere como eje. */
function AttributesPanel({ category, onClose }: { category: Category; onClose: () => void }) {
  const attributes = useAttributes();
  const save = useSetCategoryAttributes();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      category.attributes.map((item) => [
        item.attributeId,
        { isRequired: item.isRequired, isVariantAxisDefault: item.isVariantAxisDefault },
      ]),
    ),
  );
  const [error, setError] = useState('');

  function patch(attributeId: string, change: Partial<Row> | null) {
    setRows((current) => {
      if (change === null) {
        return Object.fromEntries(Object.entries(current).filter(([key]) => key !== attributeId));
      }
      return {
        ...current,
        [attributeId]: {
          isRequired: false,
          isVariantAxisDefault: false,
          ...current[attributeId],
          ...change,
        },
      };
    });
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      await save.mutateAsync({
        id: category.id,
        input: {
          attributes: Object.entries(rows).map(([attributeId, row]) => ({ attributeId, ...row })),
        },
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron guardar los atributos');
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      aria-label={`Atributos de ${category.name}`}
      className="mt-3 space-y-3 rounded-lg border border-brand-100 bg-brand-50 p-4"
    >
      <h3 className="font-semibold">Atributos de {category.name}</h3>
      <p className="text-sm text-stone-600">
        Marque los atributos que usa esta categoría. «Obligatorio» los pide al crear la ficha y «Eje
        de variante» los propone como variantes. Es una guía: cada producto puede ajustarse.
      </p>
      {attributes.isPending && <p role="status">Cargando atributos…</p>}
      <ul className="space-y-2">
        {attributes.data?.data.map((attribute) => {
          const row = rows[attribute.id];
          return (
            <li key={attribute.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <label className="flex min-h-10 min-w-40 items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={row !== undefined}
                  onChange={(event) => {
                    patch(attribute.id, event.target.checked ? {} : null);
                  }}
                  className="size-4"
                />
                Usar {attribute.name}
              </label>
              {row && (
                <>
                  <label className="flex min-h-10 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={row.isRequired}
                      onChange={(event) => {
                        patch(attribute.id, { isRequired: event.target.checked });
                      }}
                      className="size-4"
                    />
                    {attribute.name} obligatorio
                  </label>
                  {attribute.dataType === 'OPTION' && (
                    <label className="flex min-h-10 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={row.isVariantAxisDefault}
                        onChange={(event) => {
                          patch(attribute.id, { isVariantAxisDefault: event.target.checked });
                        }}
                        className="size-4"
                      />
                      {attribute.name} como eje de variante
                    </label>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          Guardar atributos
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
  const update = useUpdateCategory();
  const [creating, setCreating] = useState<{ parentId?: string } | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState('');
  const all = list.data?.data ?? [];
  const roots = all.filter((item) => item.parentId === null);

  async function toggle(category: Category) {
    setError('');
    try {
      await update.mutateAsync({ id: category.id, input: { isActive: !category.isActive } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado');
    }
  }

  const actions = (category: Category, isRoot: boolean) =>
    canManage && (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setEditing(category);
            setCreating(null);
          }}
        >
          Editar {category.name}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setAssigning(assigning === category.id ? null : category.id);
          }}
        >
          Atributos de {category.name}
        </Button>
        {isRoot && category.isActive && (
          <Button
            variant="secondary"
            onClick={() => {
              setCreating({ parentId: category.id });
              setEditing(null);
            }}
          >
            Nueva subcategoría de {category.name}
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={update.isPending}
          onClick={() => void toggle(category)}
        >
          {category.isActive ? 'Desactivar' : 'Activar'} {category.name}
        </Button>
      </div>
    );

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Categorías</h1>
          <p className="text-sm text-stone-600">
            Organiza productos en categorías y subcategorías (dos niveles).
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setCreating({});
              setEditing(null);
            }}
          >
            Nueva categoría
          </Button>
        )}
      </div>
      {creating && canManage && (
        <CategoryForm
          key={`new-${creating.parentId ?? ''}`}
          roots={roots}
          {...(creating.parentId && { presetParentId: creating.parentId })}
          onClose={() => {
            setCreating(null);
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
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
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
              <div className="space-y-2">
                <div>
                  <h2 className="font-semibold">
                    {root.name}
                    {!root.isActive && (
                      <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700">
                        Inactiva
                      </span>
                    )}
                  </h2>
                  {root.description && (
                    <p className="mt-1 text-sm text-stone-600">{root.description}</p>
                  )}
                </div>
                {actions(root, true)}
              </div>
              {assigning === root.id && (
                <AttributesPanel
                  key={root.id}
                  category={root}
                  onClose={() => {
                    setAssigning(null);
                  }}
                />
              )}
              <ul className="mt-4 space-y-3 border-t border-stone-100 pt-3">
                {all
                  .filter((item) => item.parentId === root.id)
                  .map((child) => (
                    <li key={child.id} className="space-y-2 text-sm">
                      <span className="font-medium">
                        {child.name}
                        {!child.isActive && (
                          <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700">
                            Inactiva
                          </span>
                        )}
                      </span>
                      {actions(child, false)}
                      {assigning === child.id && (
                        <AttributesPanel
                          key={child.id}
                          category={child}
                          onClose={() => {
                            setAssigning(null);
                          }}
                        />
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
