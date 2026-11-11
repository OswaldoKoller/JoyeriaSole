import { formatCashSessionNumber, type CashSessionSummary } from '@joyeria/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Input } from '../../components/ui/input.tsx';
import { Pagination } from '../../components/ui/pagination.tsx';
import { formatBs, formatDateTime, formatInt } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { CashStatusBadge, CorrectedBadge, DifferenceText } from './cash-figures.tsx';
import { useCashSessions } from './use-cash.ts';

function SessionRow({ session }: { session: CashSessionSummary }) {
  const label = formatCashSessionNumber(session.number);
  return (
    <tr className="border-b border-stone-100">
      <td className="py-3 pr-4 font-medium">
        <Link
          to={`/caja/sesiones/${session.id}`}
          aria-label={`Abrir la caja ${label}`}
          className="inline-flex min-h-10 items-center text-brand-700 underline"
        >
          {label}
        </Link>
      </td>
      <td data-label="Estado" className="py-3 pr-4">
        <span className="flex flex-wrap gap-1">
          <CashStatusBadge status={session.status} />
          <CorrectedBadge count={session.correctionsCount} />
        </span>
      </td>
      <td data-label="Apertura" className="py-3 pr-4">
        {formatDateTime(session.openedAt)}
        <span className="block text-xs text-stone-600">{session.openedByName}</span>
      </td>
      <td data-label="Cierre" className="py-3 pr-4">
        {session.closedAt ? formatDateTime(session.closedAt) : '—'}
        {session.closedByName && (
          <span className="block text-xs text-stone-600">{session.closedByName}</span>
        )}
      </td>
      <td data-label="Ventas" className="py-3 pr-4 tabular-nums">
        {formatInt(session.salesCount)} · {formatBs(session.salesTotal)}
      </td>
      <td data-label="Esperado" className="py-3 pr-4 tabular-nums">
        {session.status === 'CLOSED' ? formatBs(session.current.expectedCash) : '—'}
      </td>
      <td data-label="Contado" className="py-3 pr-4 tabular-nums">
        {formatBs(session.current.countedCash)}
      </td>
      <td data-label="Diferencia" className="py-3">
        <DifferenceText amount={session.current.difference} />
      </td>
    </tr>
  );
}

/** Historial de sesiones de caja (`cash:read`). Muestra las cifras VIGENTES (tras correcciones). */
export function CashHistoryPage() {
  useDocumentTitle('Historial de cajas');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const list = useCashSessions(page, status, from, to);
  const rows = list.data?.data ?? [];

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm">
          <Link to="/caja" className="text-brand-700 underline">
            Volver a la caja
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">Historial de cajas</h1>
        <p className="text-sm text-stone-600">
          Las cifras son las vigentes: si un cierre fue corregido, se marca «Corregida» y el detalle
          muestra los valores originales y las correcciones.
        </p>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="cash-status" className="block text-sm font-medium text-stone-700">
              Estado
            </label>
            <select
              id="cash-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="min-h-10 rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="all">Todas</option>
              <option value="OPEN">Abiertas</option>
              <option value="CLOSED">Cerradas</option>
            </select>
          </div>
          <Input
            label="Abierta desde"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
          />
          <Input
            label="Abierta hasta"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
          />
        </div>

        {list.isPending && (
          <p role="status" className="py-6 text-sm">
            Cargando cajas…
          </p>
        )}
        {list.isError && (
          <p role="alert" className="py-6 text-sm text-red-700">
            No se pudo cargar el historial.{' '}
            <button className="underline" onClick={() => void list.refetch()}>
              Reintentar
            </button>
          </p>
        )}
        {list.isSuccess && rows.length === 0 && (
          <p className="py-6 text-sm text-stone-600">No hay cajas con estos filtros.</p>
        )}
        {list.isSuccess && rows.length > 0 && (
          <div aria-busy={list.isPlaceholderData} className="mt-4 overflow-x-auto">
            <table className="table-cards w-full text-left text-sm">
              <caption className="sr-only">Sesiones de caja</caption>
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th className="py-2 pr-4">Caja</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4">Apertura</th>
                  <th className="py-2 pr-4">Cierre</th>
                  <th className="py-2 pr-4">Ventas</th>
                  <th className="py-2 pr-4">Esperado</th>
                  <th className="py-2 pr-4">Contado</th>
                  <th className="py-2">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <SessionRow key={row.id} session={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          total={list.data?.meta.total ?? 0}
          noun="cajas"
          onPageChange={setPage}
        />
      </div>
    </section>
  );
}
