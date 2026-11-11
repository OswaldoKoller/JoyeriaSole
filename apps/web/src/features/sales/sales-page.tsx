import {
  PAYMENT_METHOD_CODES,
  PERMISSIONS,
  formatCashSessionNumber,
  formatSaleNumber,
  todayInLaPaz,
  type SaleSummary,
} from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { ButtonLink } from '../../components/ui/button-link.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Pagination } from '../../components/ui/pagination.tsx';
import { formatBs, formatDateTime } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { useHasPermission } from '../auth/use-auth.ts';
import { METHOD_NAMES, parseSaleNumber } from './sale-labels.ts';
import { useSales, useSellerOptions, type SaleFilters } from './use-sales.ts';

function SaleRow({ sale, showSeller }: { sale: SaleSummary; showSeller: boolean }) {
  const label = formatSaleNumber(sale.number);
  return (
    <tr className="border-b border-stone-100">
      <td className="py-3 pr-4 font-medium">
        <Link
          to={`/ventas/${sale.id}`}
          aria-label={`Abrir la venta ${label}`}
          className="inline-flex min-h-10 items-center text-brand-700 underline"
        >
          {label}
        </Link>
      </td>
      <td data-label="Fecha y hora" className="py-3 pr-4">
        {formatDateTime(sale.soldAt)}
      </td>
      {showSeller && (
        <td data-label="Vendedor" className="py-3 pr-4">
          {sale.sellerName}
        </td>
      )}
      <td data-label="Líneas" className="py-3 pr-4 tabular-nums">
        {sale.itemsCount}
      </td>
      <td data-label="Total" className="py-3 pr-4 font-medium tabular-nums">
        {formatBs(sale.total)}
      </td>
      <td data-label="Medios" className="py-3 pr-4">
        {sale.paymentMethods.map((code) => METHOD_NAMES[code]).join(' + ')}
      </td>
      <td data-label="Caja" className="py-3">
        {formatCashSessionNumber(sale.cashSessionNumber)}
      </td>
    </tr>
  );
}

/**
 * Historial de ventas (`/ventas`, plan 11 §5.7). Por defecto, las de hoy (La Paz). Quien no tiene
 * `sales:read-all` solo ve sus propias ventas (D-02, lo garantiza la API). Solo lectura: no hay
 * ninguna acción de anular, editar, devolver ni eliminar (DEC-V07).
 */
export function SalesPage() {
  useDocumentTitle('Historial de ventas');
  const readAll = useHasPermission(PERMISSIONS.SALES_READ_ALL);
  const canListUsers = useHasPermission(PERMISSIONS.USERS_READ);
  const canSell = useHasPermission(PERMISSIONS.SALES_CREATE);
  const [params] = useSearchParams();
  const sessionFromUrl = params.get('caja') ?? '';
  const sessionNumber = Number(params.get('numeroCaja') ?? '');
  const today = todayInLaPaz();
  const [filters, setFilters] = useState<SaleFilters>({
    page: 1,
    // Ventas de una caja concreta: sin límite de fechas; si no, las de hoy.
    from: sessionFromUrl ? '' : today,
    to: sessionFromUrl ? '' : today,
    number: '',
    sellerId: '',
    methodCode: '',
    cashSessionId: sessionFromUrl,
  });
  const [numberDraft, setNumberDraft] = useState('');
  const [numberError, setNumberError] = useState('');
  const sellers = useSellerOptions(readAll && canListUsers);
  const list = useSales(filters);
  const rows = list.data?.data ?? [];

  function update(patch: Partial<SaleFilters>) {
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  }

  function applyNumber(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!numberDraft.trim()) {
      setNumberError('');
      update({ number: '' });
      return;
    }
    const value = parseSaleNumber(numberDraft);
    if (value === null) {
      setNumberError('Escriba el número de la venta, por ejemplo VTA-000123 o 123.');
      return;
    }
    setNumberError('');
    // Buscar por número ignora las fechas: la venta puede ser de otro día.
    update({ number: String(value), from: '', to: '' });
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Historial de ventas</h1>
          <p className="text-sm text-stone-600">
            {readAll ? 'Ventas registradas por todos los vendedores.' : 'Sus ventas registradas.'}{' '}
            Una venta confirmada no se modifica: si hubo un error, repórtelo como incidencia desde
            el detalle.
          </p>
        </div>
        {canSell && <ButtonLink to="/ventas/nueva">Nueva venta</ButtonLink>}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        {filters.cashSessionId && (
          <p className="mb-3 text-sm text-stone-700">
            Mostrando las ventas de la caja{' '}
            {Number.isInteger(sessionNumber) && sessionNumber > 0
              ? formatCashSessionNumber(sessionNumber)
              : 'seleccionada'}
            .{' '}
            <button
              type="button"
              className="underline"
              onClick={() => {
                update({ cashSessionId: '', from: today, to: today });
              }}
            >
              Ver todas las cajas
            </button>
          </p>
        )}
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
          <div className="space-y-1">
            <label htmlFor="sale-method" className="block text-sm font-medium text-stone-700">
              Medio de pago
            </label>
            <select
              id="sale-method"
              value={filters.methodCode}
              onChange={(event) => {
                update({ methodCode: event.target.value });
              }}
              className="min-h-10 rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              {PAYMENT_METHOD_CODES.map((code) => (
                <option key={code} value={code}>
                  {METHOD_NAMES[code]}
                </option>
              ))}
            </select>
          </div>
          {readAll && sellers.isSuccess && (
            <div className="space-y-1">
              <label htmlFor="sale-seller" className="block text-sm font-medium text-stone-700">
                Vendedor
              </label>
              <select
                id="sale-seller"
                value={filters.sellerId}
                onChange={(event) => {
                  update({ sellerId: event.target.value });
                }}
                className="min-h-10 rounded-lg border border-stone-300 px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                {sellers.data.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <form onSubmit={applyNumber} className="flex items-end gap-2">
            <Input
              label="Número de venta"
              value={numberDraft}
              onChange={(event) => {
                setNumberDraft(event.target.value);
              }}
              placeholder="VTA-000123"
              maxLength={20}
              autoComplete="off"
              error={numberError}
            />
            <Button type="submit" variant="secondary">
              Buscar
            </Button>
          </form>
        </div>

        {list.isPending && (
          <p role="status" className="py-6 text-sm">
            Cargando ventas…
          </p>
        )}
        {list.isError && (
          <p role="alert" className="py-6 text-sm text-red-700">
            No se pudieron cargar las ventas.{' '}
            <button className="underline" onClick={() => void list.refetch()}>
              Reintentar
            </button>
          </p>
        )}
        {list.isSuccess && rows.length === 0 && (
          <p className="py-6 text-sm text-stone-600">No hay ventas con estos filtros.</p>
        )}
        {list.isSuccess && rows.length > 0 && (
          <div aria-busy={list.isPlaceholderData} className="mt-4 overflow-x-auto">
            <table className="table-cards w-full text-left text-sm">
              <caption className="sr-only">Ventas</caption>
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th className="py-2 pr-4">Venta</th>
                  <th className="py-2 pr-4">Fecha y hora</th>
                  {readAll && <th className="py-2 pr-4">Vendedor</th>}
                  <th className="py-2 pr-4">Líneas</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-4">Medios</th>
                  <th className="py-2">Caja</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <SaleRow key={row.id} sale={row} showSeller={readAll} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={filters.page}
          total={list.data?.meta.total ?? 0}
          noun="ventas"
          onPageChange={(page) => {
            update({ page });
          }}
        />
      </div>
    </section>
  );
}
