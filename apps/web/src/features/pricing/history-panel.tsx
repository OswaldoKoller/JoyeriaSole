import {
  PRICE_CHANGE_STATUS_LABELS,
  PRICE_CHANGE_STATUSES,
  type PriceChangeStatus,
} from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { ChangesTable } from './changes-table.tsx';
import { usePriceChanges } from './use-pricing.ts';
import { Pagination } from '../../components/ui/pagination.tsx';

/** Historial global de cambios de precio (D5), con filtro por estado y búsqueda por SKU o nombre. */
export function HistoryPanel() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<PriceChangeStatus | ''>('');
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const list = usePriceChanges(page, status, search);
  const rows = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <Input
            label="Buscar en el historial por SKU o nombre"
            value={draftSearch}
            onChange={(event) => {
              setDraftSearch(event.target.value);
            }}
            maxLength={100}
          />
        </div>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
        <div className="space-y-1">
          <label htmlFor="history-status" className="block text-sm font-medium text-stone-700">
            Estado
          </label>
          <select
            id="history-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as PriceChangeStatus | '');
              setPage(1);
            }}
            className="min-h-10 rounded-lg border border-stone-300 px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {PRICE_CHANGE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {PRICE_CHANGE_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </form>

      {list.isPending && (
        <p role="status" className="py-6 text-sm">
          Cargando historial…
        </p>
      )}
      {list.isError && (
        <p role="alert" className="py-6 text-sm text-red-700">
          No se pudo cargar el historial.
        </p>
      )}
      {list.isSuccess && rows.length === 0 && (
        <p className="py-6 text-sm text-stone-600">No hay cambios de precio registrados.</p>
      )}
      {list.isSuccess && rows.length > 0 && (
        <div aria-busy={list.isPlaceholderData} className="mt-4">
          <ChangesTable rows={rows} showProduct />
        </div>
      )}
      {list.isSuccess && (
        <Pagination page={page} total={total} noun="cambios" onPageChange={setPage} />
      )}
    </div>
  );
}
