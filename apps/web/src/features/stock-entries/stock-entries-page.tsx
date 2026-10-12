import { PERMISSIONS } from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useHasPermission } from '../auth/use-auth.ts';
import { ingressLabel } from './lines.ts';
import { StatusBadge } from './status-badge.tsx';
import { useStockEntries } from './use-stock-entries.ts';

const currency = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' });
const date = new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short' });

export function StockEntriesPage() {
  const canManage = useHasPermission(PERMISSIONS.STOCK_ENTRIES_MANAGE);
  const [page, setPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const list = useStockEntries(page, search, status);
  const entries = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;

  function submitSearch(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ingresos de mercadería</h1>
          <p className="text-sm text-stone-600">
            Recepciones de proveedores. El stock solo aumenta cuando el ingreso se confirma.
          </p>
        </div>
        {canManage && (
          <Link
            to="/ingresos/nuevo"
            className="inline-flex min-h-10 items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            Nuevo ingreso
          </Link>
        )}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        <form onSubmit={submitSearch} className="flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1">
            <Input
              label="Buscar por número o documento"
              value={draftSearch}
              onChange={(event) => {
                setDraftSearch(event.target.value);
              }}
              maxLength={60}
            />
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
          <div className="space-y-1">
            <label htmlFor="entry-status" className="block text-sm font-medium text-stone-700">
              Estado
            </label>
            <select
              id="entry-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="min-h-10 rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="DRAFT">Borradores</option>
              <option value="CONFIRMED">Confirmados</option>
              <option value="CANCELLED">Cancelados</option>
            </select>
          </div>
        </form>

        {list.isPending && (
          <p role="status" className="py-6 text-sm">
            Cargando ingresos…
          </p>
        )}
        {list.isError && (
          <p role="alert" className="py-6 text-sm text-red-700">
            No se pudieron cargar los ingresos.{' '}
            <button className="underline" onClick={() => void list.refetch()}>
              Reintentar
            </button>
          </p>
        )}
        {list.isSuccess && entries.length === 0 && (
          <p className="py-6 text-sm text-stone-600">No se encontraron ingresos.</p>
        )}
        {list.isSuccess && entries.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="table-cards w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th className="py-2 pr-4">Ingreso</th>
                  <th className="py-2 pr-4">Proveedor</th>
                  <th className="py-2 pr-4">Documento</th>
                  <th className="py-2 pr-4">Ítems</th>
                  <th className="py-2 pr-4">Valor de compra</th>
                  <th className="py-2 pr-4">Costos adicionales</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-stone-100">
                    <td className="py-3 pr-4 font-medium">
                      <Link
                        to={`/ingresos/${entry.id}`}
                        aria-label={`Abrir ingreso ${ingressLabel(entry.number)}`}
                        className="inline-flex min-h-10 items-center text-brand-700 underline"
                      >
                        {ingressLabel(entry.number)}
                      </Link>
                    </td>
                    <td data-label="Proveedor" className="py-3 pr-4">
                      {entry.supplierName}
                    </td>
                    <td data-label="Documento" className="py-3 pr-4">
                      {[entry.documentType, entry.documentNumber].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td data-label="Ítems" className="py-3 pr-4">
                      {entry.itemsCount}
                    </td>
                    <td data-label="Valor de compra" className="py-3 pr-4">
                      {currency.format(Number(entry.purchaseTotal))}
                    </td>
                    <td data-label="Costos adicionales" className="py-3 pr-4">
                      {currency.format(Number(entry.extrasTotal))}
                    </td>
                    <td data-label="Estado" className="py-3 pr-4">
                      <StatusBadge status={entry.status} />
                    </td>
                    <td data-label="Fecha" className="py-3">
                      {date.format(new Date(entry.confirmedAt ?? entry.createdAt))}
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
              Página {page} · {total} ingresos
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
