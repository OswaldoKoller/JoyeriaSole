import {
  PERMISSIONS,
  formatExchangeNumber,
  formatSaleNumber,
  todayInLaPaz,
  type SaleExchangeSummary,
} from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { ButtonLink } from '../../components/ui/button-link.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Pagination } from '../../components/ui/pagination.tsx';
import { formatBs, formatDateTime } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { useHasPermission } from '../auth/use-auth.ts';
import { pieceName } from '../sales/cart.ts';
import { useExchanges, type ExchangeFilters } from './use-sale-exchanges.ts';

function ExchangeRow({ exchange }: { exchange: SaleExchangeSummary }) {
  const label = formatExchangeNumber(exchange.number);
  return (
    <tr className="border-b border-stone-100">
      <td className="py-3 pr-4 font-medium">
        <Link
          to={`/cambios/${exchange.id}`}
          aria-label={`Abrir el cambio ${label}`}
          className="inline-flex min-h-10 items-center text-brand-700 underline"
        >
          {label}
        </Link>
      </td>
      <td data-label="Fecha y hora" className="py-3 pr-4">
        {formatDateTime(exchange.createdAt)}
      </td>
      <td data-label="Venta" className="py-3 pr-4">
        <Link to={`/ventas/${exchange.saleId}`} className="text-brand-700 underline">
          {formatSaleNumber(exchange.saleNumber)}
        </Link>
      </td>
      <td data-label="Devolvió" className="py-3 pr-4">
        {pieceName(exchange.returned)}
      </td>
      <td data-label="Se llevó" className="py-3 pr-4">
        {pieceName(exchange.delivered)}
        {exchange.quantity > 1 && ` (×${String(exchange.quantity)})`}
      </td>
      <td data-label="Diferencia" className="py-3 pr-4 font-medium tabular-nums">
        {formatBs(exchange.difference)}
      </td>
      <td data-label="Atendió" className="py-3">
        {exchange.sellerName}
      </td>
    </tr>
  );
}

/**
 * Historial de cambios de pieza (`/cambios`). Por defecto, los de hoy (La Paz). Quien no tiene
 * `sales:read-all` solo ve los que registró o los de sus ventas (lo garantiza la API). Solo lectura.
 */
export function ExchangesPage() {
  useDocumentTitle('Historial de cambios');
  const canExchange = useHasPermission(PERMISSIONS.SALES_EXCHANGE);
  const today = todayInLaPaz();
  const [filters, setFilters] = useState<ExchangeFilters>({
    page: 1,
    from: today,
    to: today,
    number: '',
  });
  const [numberDraft, setNumberDraft] = useState('');
  const [numberError, setNumberError] = useState('');
  const list = useExchanges(filters);
  const rows = list.data?.data ?? [];

  function update(patch: Partial<ExchangeFilters>) {
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  }

  function applyNumber(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!numberDraft.trim()) {
      setNumberError('');
      update({ number: '' });
      return;
    }
    const digits = /^\s*(?:cmb[\s-]*)?0*(\d{1,9})\s*$/i.exec(numberDraft)?.[1];
    if (!digits || Number(digits) < 1) {
      setNumberError('Escriba el número del cambio, por ejemplo CMB-000012 o 12.');
      return;
    }
    setNumberError('');
    // Buscar por número ignora las fechas: el cambio puede ser de otro día.
    update({ number: digits, from: '', to: '' });
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Historial de cambios</h1>
          <p className="text-sm text-stone-600">
            Cambios de pieza registrados. No hay devoluciones: solo cambios por una pieza de igual o
            mayor precio.
          </p>
        </div>
        {canExchange && <ButtonLink to="/cambios/nuevo">Nuevo cambio</ButtonLink>}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label="Desde"
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => {
              update({ from: event.target.value });
            }}
          />
          <Input
            label="Hasta"
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => {
              update({ to: event.target.value });
            }}
          />
          <form onSubmit={applyNumber} noValidate className="flex items-end gap-2">
            <Input
              label="N.º de cambio"
              value={numberDraft}
              autoComplete="off"
              onChange={(event) => {
                setNumberDraft(event.target.value);
              }}
              error={numberError}
            />
            <Button type="submit" variant="secondary">
              Buscar
            </Button>
          </form>
        </div>
      </div>

      <div
        className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
        aria-busy={list.isPlaceholderData}
      >
        {list.isPending && (
          <p role="status" className="text-sm">
            Cargando cambios…
          </p>
        )}
        {list.isError && (
          <p role="alert" className="text-sm text-red-700">
            No se pudo cargar el historial de cambios.
          </p>
        )}
        {list.isSuccess && rows.length === 0 && (
          <p role="status" className="text-sm text-stone-700">
            No hay cambios con esos filtros.
          </p>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="table-cards w-full text-left text-sm">
              <caption className="sr-only">Cambios de pieza</caption>
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    N.º
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Fecha y hora
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Venta
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Devolvió
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Se llevó
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Diferencia
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Atendió
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((exchange) => (
                  <ExchangeRow key={exchange.id} exchange={exchange} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && (
          <Pagination
            page={filters.page}
            pageSize={list.data.meta.pageSize}
            total={list.data.meta.total}
            noun="cambios"
            onPageChange={(page) => {
              update({ page });
            }}
          />
        )}
      </div>
    </section>
  );
}
