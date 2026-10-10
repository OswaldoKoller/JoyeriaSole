import { PERMISSIONS, createAttributeOptionSchema } from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useHasPermission } from '../auth/use-auth.ts';
import { useAddAttributeOption, useAttributes } from './use-attributes.ts';

const dataTypeLabels = {
  OPTION: 'Lista de valores',
  TEXT: 'Texto',
  NUMBER: 'Número',
  BOOLEAN: 'Sí o no',
};

export function AttributesPage() {
  const canManage = useHasPermission(PERMISSIONS.CATALOG_MANAGE);
  const list = useAttributes();
  const addOption = useAddAttributeOption();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    const parsed = createAttributeOptionSchema.safeParse({ value });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Valor inválido');
      return;
    }
    setError('');
    try {
      await addOption.mutateAsync({ attributeId: editingId, input: parsed.data });
      setValue('');
      setEditingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo agregar el valor');
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Atributos</h1>
        <p className="text-sm text-stone-600">
          Materiales, tallas, colores y otras características de las piezas.
        </p>
      </div>
      {list.isPending && <p role="status">Cargando atributos…</p>}
      {list.isError && (
        <p role="alert" className="text-red-700">
          No se pudieron cargar los atributos.{' '}
          <button className="underline" onClick={() => void list.refetch()}>
            Reintentar
          </button>
        </p>
      )}
      {list.isSuccess && list.data.data.length === 0 && (
        <p className="text-sm text-stone-600">No hay atributos definidos.</p>
      )}
      {list.isSuccess && (
        <div className="grid gap-4 md:grid-cols-2">
          {list.data.data.map((attribute) => (
            <section
              key={attribute.id}
              className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{attribute.name}</h2>
                  <p className="text-sm text-stone-600">
                    {dataTypeLabels[attribute.dataType]}
                    {attribute.unit ? ` · ${attribute.unit}` : ''}
                  </p>
                </div>
                {canManage && attribute.dataType === 'OPTION' && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditingId(attribute.id);
                      setValue('');
                      setError('');
                    }}
                  >
                    Agregar valor a {attribute.name}
                  </Button>
                )}
              </div>
              {attribute.dataType === 'OPTION' &&
                (attribute.options.length > 0 ? (
                  <ul className="flex flex-wrap gap-2">
                    {attribute.options
                      .filter((option) => option.isActive)
                      .map((option) => (
                        <li key={option.id} className="rounded-full bg-stone-100 px-3 py-1 text-sm">
                          {option.value}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-sm text-stone-500">Sin valores cargados.</p>
                ))}
              {editingId === attribute.id && (
                <form
                  onSubmit={(event) => void submit(event)}
                  className="space-y-2 border-t border-stone-100 pt-3"
                >
                  <Input
                    label={`Nuevo valor de ${attribute.name}`}
                    value={value}
                    onChange={(event) => {
                      setValue(event.target.value);
                    }}
                    maxLength={100}
                    required
                  />
                  {error && (
                    <p role="alert" className="text-sm text-red-700">
                      {error}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button type="submit" disabled={addOption.isPending}>
                      Guardar valor
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditingId(null);
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </form>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
