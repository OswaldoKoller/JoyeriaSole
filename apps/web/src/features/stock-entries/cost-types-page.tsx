import { createStockEntryCostTypeSchema } from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { useCostTypes, useCreateCostType, useUpdateCostType } from './use-stock-entries.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';

/**
 * Tipos de costo adicional de un ingreso (Q-08). Solo el Administrador (`settings:manage`) agrega
 * o desactiva tipos; los del sistema no se pueden cambiar. Un tipo desactivado deja de ofrecerse en
 * ingresos nuevos pero se conserva en los que ya lo usan.
 */
export function CostTypesPage() {
  useDocumentTitle('Tipos de costo');
  const types = useCostTypes();
  const create = useCreateCostType();
  const update = useUpdateCostType();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  async function add(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const parsed = createStockEntryCostTypeSchema.safeParse({ name });
    if (!parsed.success) {
      setError('El nombre debe tener entre 2 y 100 caracteres.');
      return;
    }
    try {
      await create.mutateAsync(parsed.data);
      setName('');
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'No se pudo agregar el tipo.');
    }
  }

  async function toggle(id: string, isActive: boolean) {
    setError('');
    try {
      await update.mutateAsync({ id, input: { isActive } });
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'No se pudo cambiar el estado.');
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tipos de costo de ingreso</h1>
        <p className="text-sm text-stone-600">
          Catálogo para la lista de costos adicionales de cada ingreso (transporte, aduanización,
          comisiones…).
        </p>
      </div>

      <form
        onSubmit={(event) => void add(event)}
        noValidate
        aria-label="Nuevo tipo de costo"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
      >
        <div className="min-w-52 flex-1">
          <Input
            label="Nombre del nuevo tipo de costo"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            maxLength={100}
          />
        </div>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Agregando…' : 'Agregar tipo'}
        </Button>
      </form>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        {types.isPending && (
          <p role="status" className="py-4 text-sm">
            Cargando tipos…
          </p>
        )}
        {types.isError && (
          <p role="alert" className="py-4 text-sm text-red-700">
            No se pudieron cargar los tipos de costo.
          </p>
        )}
        {types.isSuccess && (
          <div className="overflow-x-auto">
            <table className="table-cards w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Origen</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {types.data.map((type) => (
                  <tr key={type.id} className="border-b border-stone-100">
                    <td className="py-3 pr-4 font-medium">{type.name}</td>
                    <td data-label="Origen" className="py-3 pr-4">
                      {type.isSystem ? 'Del sistema' : 'Agregado'}
                    </td>
                    <td data-label="Estado" className="py-3 pr-4">
                      {type.isActive ? 'Activo' : 'Inactivo'}
                    </td>
                    <td className="py-2">
                      {type.isSystem ? (
                        <span className="text-xs text-stone-500">No se puede cambiar</span>
                      ) : (
                        <Button
                          variant="secondary"
                          disabled={update.isPending}
                          aria-label={`${type.isActive ? 'Desactivar' : 'Activar'} ${type.name}`}
                          onClick={() => void toggle(type.id, !type.isActive)}
                        >
                          {type.isActive ? 'Desactivar' : 'Activar'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
