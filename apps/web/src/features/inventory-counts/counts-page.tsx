import { PERMISSIONS, countLabel, type InventoryCountSummary } from '@joyeria/shared';
import { useMemo, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { useCategories } from '../catalog/use-categories.ts';
import { categoryOptions } from './category-options.ts';
import { useHasPermission } from '../auth/use-auth.ts';
import { CountStatusBadge } from './status-badge.tsx';
import { useCreateInventoryCount, useInventoryCounts } from './use-inventory-counts.ts';

const dateTime = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  dateStyle: 'short',
  timeStyle: 'short',
});

function progressOf(count: InventoryCountSummary) {
  if (count.status === 'DRAFT') return 'Sin iniciar';
  if (count.status === 'RECOUNT') {
    return `${count.scannedVariants} de ${count.recountTotal} variantes recontadas`;
  }
  return `${count.scannedVariants} de ${count.totalVariants} variantes · ${count.piecesCounted} piezas`;
}

function NewCountForm() {
  const categories = useCategories();
  const create = useCreateInventoryCount();
  const navigate = useNavigate();
  const [categoryId, setCategoryId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const options = useMemo(() => categoryOptions(categories.data?.data ?? []), [categories.data]);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!categoryId) {
      setError('Elija la categoría a contar.');
      return;
    }
    try {
      const created = await create.mutateAsync({
        categoryId,
        ...(notes.trim() && { notes: notes.trim() }),
      });
      await navigate(`/inventario/conteos/${created.id}`);
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : 'No se pudo crear el conteo. Intente de nuevo.',
      );
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      aria-label="Nuevo conteo"
      className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
    >
      <h2 className="text-lg font-semibold">Nuevo conteo</h2>
      <p className="text-sm text-stone-600">
        Se cuenta por categoría; una categoría incluye a sus subcategorías. Para contar todo el
        inventario, elija la categoría raíz. Dos conteos simultáneos no pueden compartir variantes.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="count-category" className="block text-sm font-medium text-stone-700">
            Categoría a contar
          </label>
          <select
            id="count-category"
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
            }}
            className="block min-h-10 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          >
            <option value="">Elegir categoría…</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="count-notes" className="block text-sm font-medium text-stone-700">
            Observación (opcional)
          </label>
          <input
            id="count-notes"
            value={notes}
            maxLength={2000}
            onChange={(event) => {
              setNotes(event.target.value);
            }}
            className="block min-h-10 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? 'Creando…' : 'Crear conteo'}
      </Button>
    </form>
  );
}

export function CountsPage() {
  const canManage = useHasPermission(PERMISSIONS.INVENTORY_COUNTS_MANAGE);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const list = useInventoryCounts({ page, status });
  const rows = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Conteos físicos</h1>
        <p className="text-sm text-stone-600">
          Conteo a ciegas por categoría, con lector de códigos y segundo recuento obligatorio si hay
          diferencias. El stock solo cambia cuando se aprueba el conteo.
        </p>
      </div>

      {canManage && <NewCountForm />}

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        <div className="space-y-1">
          <label htmlFor="count-status" className="block text-sm font-medium text-stone-700">
            Estado
          </label>
          <select
            id="count-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="min-h-10 rounded-lg border border-stone-300 px-3 py-2 text-sm"
          >
            <option value="all">Todos</option>
            <option value="open">En curso (sin terminar)</option>
            <option value="DRAFT">Borradores</option>
            <option value="IN_PROGRESS">En captura</option>
            <option value="RECOUNT">En segundo recuento</option>
            <option value="IN_REVIEW">En revisión</option>
            <option value="APPROVED">Aprobados</option>
            <option value="CANCELLED">Cancelados</option>
          </select>
        </div>

        {list.isPending && (
          <p role="status" className="py-6 text-sm">
            Cargando conteos…
          </p>
        )}
        {list.isError && (
          <p role="alert" className="py-6 text-sm text-red-700">
            No se pudieron cargar los conteos.{' '}
            <button className="underline" onClick={() => void list.refetch()}>
              Reintentar
            </button>
          </p>
        )}
        {list.isSuccess && rows.length === 0 && (
          <p className="py-6 text-sm text-stone-600">No se encontraron conteos.</p>
        )}
        {list.isSuccess && rows.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="table-cards w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th className="py-2 pr-4">Conteo</th>
                  <th className="py-2 pr-4">Categoría</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4">Progreso</th>
                  <th className="py-2 pr-4">Operador</th>
                  <th className="py-2">Creado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((count) => (
                  <tr key={count.id} className="border-b border-stone-100">
                    <td className="py-3 pr-4 font-medium">
                      <Link
                        to={`/inventario/conteos/${count.id}`}
                        aria-label={`Abrir conteo ${countLabel(count.number)}`}
                        className="inline-flex min-h-10 items-center text-brand-700 underline"
                      >
                        {countLabel(count.number)}
                      </Link>
                    </td>
                    <td data-label="Categoría" className="py-3 pr-4">
                      {count.scope ?? '—'}
                    </td>
                    <td data-label="Estado" className="py-3 pr-4">
                      <CountStatusBadge status={count.status} />
                    </td>
                    <td data-label="Progreso" className="py-3 pr-4">
                      {progressOf(count)}
                      {count.findingsCount > 0 && (
                        <span className="block text-xs text-amber-700">
                          {count.findingsCount} hallazgo{count.findingsCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </td>
                    <td data-label="Operador" className="py-3 pr-4">
                      {count.operatorName ?? '—'}
                    </td>
                    <td data-label="Creado" className="py-3">
                      {dateTime.format(new Date(count.createdAt))}
                    </td>
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
              Página {page} · {total} conteos
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
