import {
  PERMISSIONS,
  createAttributeOptionSchema,
  createAttributeSchema,
  type Attribute,
  type AttributeOption,
  type AttributeUsage,
} from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useHasPermission } from '../auth/use-auth.ts';
import {
  useAddAttributeOption,
  useAttributes,
  useCreateAttribute,
  useUpdateAttribute,
  useUpdateAttributeOption,
} from './use-attributes.ts';

const dataTypeLabels = {
  OPTION: 'Lista de valores',
  TEXT: 'Texto',
  NUMBER: 'Número',
  BOOLEAN: 'Sí o no',
};

const usageLabels: Record<AttributeUsage, string> = {
  VARIANT_AXIS: 'Eje de variante',
  DESCRIPTIVE: 'Característica',
};

const selectClass =
  'block min-h-10 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none';

function NewAttributeForm({ onClose }: { onClose: () => void }) {
  const create = useCreateAttribute();
  const [name, setName] = useState('');
  const [dataType, setDataType] = useState<Attribute['dataType']>('OPTION');
  const [unit, setUnit] = useState('');
  const [suggestedUse, setSuggestedUse] = useState<AttributeUsage>('DESCRIPTIVE');
  const [error, setError] = useState('');

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createAttributeSchema.safeParse({
      name,
      dataType,
      unit: unit || null,
      suggestedUse: dataType === 'OPTION' ? suggestedUse : 'DESCRIPTIVE',
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setError('');
    try {
      await create.mutateAsync(parsed.data);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear el atributo');
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
    >
      <h2 className="text-lg font-semibold">Nuevo atributo</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Nombre del atributo"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          maxLength={100}
          required
        />
        <div className="space-y-1">
          <label htmlFor="new-attr-type" className="block text-sm font-medium text-stone-700">
            Tipo de dato
          </label>
          <select
            id="new-attr-type"
            value={dataType}
            onChange={(event) => {
              setDataType(event.target.value as Attribute['dataType']);
            }}
            className={`${selectClass} w-full`}
          >
            {Object.entries(dataTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {(dataType === 'OPTION' || dataType === 'NUMBER') && (
          <Input
            label="Unidad (opcional, p. ej. cm)"
            value={unit}
            onChange={(event) => {
              setUnit(event.target.value);
            }}
            maxLength={20}
          />
        )}
        {dataType === 'OPTION' && (
          <div className="space-y-1">
            <label htmlFor="new-attr-use" className="block text-sm font-medium text-stone-700">
              Uso sugerido
            </label>
            <select
              id="new-attr-use"
              value={suggestedUse}
              onChange={(event) => {
                setSuggestedUse(event.target.value as AttributeUsage);
              }}
              className={`${selectClass} w-full`}
            >
              <option value="DESCRIPTIVE">Característica (informativa)</option>
              <option value="VARIANT_AXIS">Eje de variante (genera SKU y stock propios)</option>
            </select>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending}>
          Guardar atributo
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function OptionItem({ attribute, option }: { attribute: Attribute; option: AttributeOption }) {
  const canManage = useHasPermission(PERMISSIONS.CATALOG_MANAGE);
  const update = useUpdateAttributeOption();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(option.value);
  const [code, setCode] = useState(option.code ?? '');
  const [error, setError] = useState('');

  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      await update.mutateAsync({
        attributeId: attribute.id,
        optionId: option.id,
        input: { value, code: code || null },
      });
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el valor');
    }
  }

  async function toggle() {
    setError('');
    try {
      await update.mutateAsync({
        attributeId: attribute.id,
        optionId: option.id,
        input: { isActive: !option.isActive },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado');
    }
  }

  return (
    <li className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-3 py-1 text-sm ${option.isActive ? 'bg-stone-100' : 'bg-stone-50 text-stone-500 line-through'}`}
        >
          {option.value}
          {option.code ? ` (${option.code})` : ''}
        </span>
        {!option.isActive && <span className="text-xs text-stone-500">Inactivo</span>}
        {canManage && (
          <>
            <Button
              variant="secondary"
              className="min-h-8 px-2 py-1 text-xs"
              aria-label={`Editar valor ${option.value} de ${attribute.name}`}
              onClick={() => {
                setEditing(true);
                setValue(option.value);
                setCode(option.code ?? '');
              }}
            >
              Editar
            </Button>
            <Button
              variant="secondary"
              className="min-h-8 px-2 py-1 text-xs"
              aria-label={`${option.isActive ? 'Desactivar' : 'Activar'} valor ${option.value} de ${attribute.name}`}
              disabled={update.isPending}
              onClick={() => void toggle()}
            >
              {option.isActive ? 'Desactivar' : 'Activar'}
            </Button>
          </>
        )}
      </div>
      {editing && (
        <form onSubmit={(event) => void save(event)} className="flex flex-wrap items-end gap-2">
          <div className="w-48">
            <Input
              label={`Valor (${option.value})`}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
              }}
              maxLength={100}
              required
            />
          </div>
          <div className="w-32">
            <Input
              label="Código corto"
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
              }}
              maxLength={20}
            />
          </div>
          <Button type="submit" disabled={update.isPending}>
            Guardar cambios
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setEditing(false);
            }}
          >
            Cancelar
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </li>
  );
}

function AttributeCard({ attribute }: { attribute: Attribute }) {
  const canManage = useHasPermission(PERMISSIONS.CATALOG_MANAGE);
  const update = useUpdateAttribute();
  const addOption = useAddAttributeOption();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function submitOption(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createAttributeOptionSchema.safeParse({ value, code: code || null });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Valor inválido');
      return;
    }
    setError('');
    try {
      await addOption.mutateAsync({ attributeId: attribute.id, input: parsed.data });
      setValue('');
      setCode('');
      setAdding(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo agregar el valor');
    }
  }

  async function patch(input: Parameters<typeof update.mutateAsync>[0]['input']) {
    setError('');
    try {
      await update.mutateAsync({ id: attribute.id, input });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el atributo');
    }
  }

  return (
    <section
      aria-label={attribute.name}
      className={`space-y-3 rounded-xl border border-stone-200 p-5 shadow-xs ${attribute.isActive ? 'bg-white' : 'bg-stone-50'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">
            {attribute.name}
            {attribute.isSystem && (
              <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
                Base
              </span>
            )}
            {!attribute.isActive && (
              <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700">
                Inactivo
              </span>
            )}
          </h3>
          <p className="text-sm text-stone-600">
            {dataTypeLabels[attribute.dataType]}
            {attribute.unit ? ` · ${attribute.unit}` : ''}
          </p>
        </div>
        {canManage && attribute.dataType === 'OPTION' && attribute.isActive && (
          <Button
            variant="secondary"
            onClick={() => {
              setAdding(true);
              setError('');
            }}
          >
            Agregar valor a {attribute.name}
          </Button>
        )}
      </div>
      {attribute.dataType === 'OPTION' && (
        <div className="flex items-center gap-2">
          <label htmlFor={`use-${attribute.id}`} className="text-sm text-stone-700">
            Uso sugerido
          </label>
          <select
            id={`use-${attribute.id}`}
            value={attribute.suggestedUse}
            disabled={!canManage || update.isPending}
            onChange={(event) => void patch({ suggestedUse: event.target.value as AttributeUsage })}
            className={selectClass}
            aria-label={`Uso sugerido de ${attribute.name}`}
          >
            {Object.entries(usageLabels).map(([usage, label]) => (
              <option key={usage} value={usage}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}
      {attribute.dataType === 'OPTION' &&
        (attribute.options.length > 0 ? (
          <ul className="space-y-2">
            {attribute.options.map((option) => (
              <OptionItem key={option.id} attribute={attribute} option={option} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">Sin valores cargados.</p>
        ))}
      {adding && (
        <form
          onSubmit={(event) => void submitOption(event)}
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
          <Input
            label="Código corto (opcional)"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
            }}
            maxLength={20}
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={addOption.isPending}>
              Guardar valor
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setAdding(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
      {canManage && !attribute.isSystem && (
        <Button
          variant="secondary"
          disabled={update.isPending}
          onClick={() => void patch({ isActive: !attribute.isActive })}
        >
          {attribute.isActive ? 'Desactivar' : 'Activar'} atributo {attribute.name}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}

export function AttributesPage() {
  const canManage = useHasPermission(PERMISSIONS.CATALOG_MANAGE);
  const list = useAttributes(true);
  const [creating, setCreating] = useState(false);
  const all = list.data?.data ?? [];
  const axes = all.filter((attribute) => attribute.suggestedUse === 'VARIANT_AXIS');
  const descriptive = all.filter((attribute) => attribute.suggestedUse !== 'VARIANT_AXIS');

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Atributos</h1>
          <p className="text-sm text-stone-600">
            Materiales, tallas, colores y otras características de las piezas. Los ejes de variante
            generan SKU y stock propios; las características son datos informativos de la ficha.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            Nuevo atributo
          </Button>
        )}
      </div>
      {creating && canManage && (
        <NewAttributeForm
          onClose={() => {
            setCreating(false);
          }}
        />
      )}
      {list.isPending && <p role="status">Cargando atributos…</p>}
      {list.isError && (
        <p role="alert" className="text-red-700">
          No se pudieron cargar los atributos.{' '}
          <button className="underline" onClick={() => void list.refetch()}>
            Reintentar
          </button>
        </p>
      )}
      {list.isSuccess && all.length === 0 && (
        <p className="text-sm text-stone-600">No hay atributos definidos.</p>
      )}
      {list.isSuccess && axes.length > 0 && (
        <section aria-labelledby="axes-title" className="space-y-3">
          <h2 id="axes-title" className="text-lg font-semibold">
            Ejes de variante sugeridos
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {axes.map((attribute) => (
              <AttributeCard key={attribute.id} attribute={attribute} />
            ))}
          </div>
        </section>
      )}
      {list.isSuccess && descriptive.length > 0 && (
        <section aria-labelledby="descriptive-title" className="space-y-3">
          <h2 id="descriptive-title" className="text-lg font-semibold">
            Características
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {descriptive.map((attribute) => (
              <AttributeCard key={attribute.id} attribute={attribute} />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
