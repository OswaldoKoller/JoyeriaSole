import {
  SALE_INCIDENT_TEXT_MAX_LENGTH,
  SALE_INCIDENT_TEXT_MIN_LENGTH,
  closeSaleIncidentSchema,
  formatIncidentNumber,
  formatSaleNumber,
  type SaleIncident,
} from '@joyeria/shared';
import { useId, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Dialog } from '../../components/ui/dialog.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Pagination } from '../../components/ui/pagination.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { formatDateTime } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import {
  INCIDENT_KIND_LABELS,
  INCIDENT_NO_EFFECT_NOTICE,
  INCIDENT_STATUS_LABELS,
} from './sale-labels.ts';
import { useCloseIncident, useIncidents } from './use-sales.ts';

function StatusBadge({ status }: { status: SaleIncident['status'] }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        status === 'OPEN' ? 'bg-amber-50 text-amber-900' : 'bg-stone-100 text-stone-700'
      }`}
    >
      {INCIDENT_STATUS_LABELS[status]}
    </span>
  );
}

/** Detalle y cierre de una incidencia: la resolución describe lo hecho FUERA del sistema. */
function IncidentDialog({ incident, onClose }: { incident: SaleIncident; onClose: () => void }) {
  const close = useCloseIncident(incident.id);
  const [resolution, setResolution] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [closed, setClosed] = useState<SaleIncident | null>(null);
  const resolutionId = useId();
  const shown = closed ?? incident;

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const parsed = closeSaleIncidentSchema.safeParse({ resolution });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Revise la resolución');
      return;
    }
    setFieldError('');
    try {
      setClosed(await close.mutateAsync(parsed.data));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No se pudo cerrar la incidencia.');
    }
  }

  return (
    <Dialog
      title={`Incidencia ${formatIncidentNumber(incident.number)}`}
      onClose={onClose}
      busy={close.isPending}
      widthClassName="max-w-2xl"
    >
      <div className="space-y-4 text-sm">
        <p className="rounded-lg bg-stone-50 p-3 text-stone-800">{INCIDENT_NO_EFFECT_NOTICE}</p>
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-stone-600">Tipo</dt>
            <dd className="font-medium">{INCIDENT_KIND_LABELS[shown.kind]}</dd>
          </div>
          <div>
            <dt className="text-stone-600">Estado</dt>
            <dd>
              <StatusBadge status={shown.status} />
            </dd>
          </div>
          <div>
            <dt className="text-stone-600">Venta</dt>
            <dd>
              {shown.sale ? (
                <Link to={`/ventas/${shown.sale.id}`} className="text-brand-700 underline">
                  {formatSaleNumber(shown.sale.number)}
                </Link>
              ) : (
                'Sin venta asociada'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-stone-600">Reportó</dt>
            <dd>
              {shown.reportedBy.name} · {formatDateTime(shown.reportedAt)}
            </dd>
          </div>
        </dl>
        <div>
          <h3 className="font-medium">Descripción</h3>
          <p className="whitespace-pre-line">{shown.description}</p>
        </div>
        {shown.status === 'CLOSED' ? (
          <div role={closed ? 'status' : undefined}>
            <h3 className="font-medium">Resolución</h3>
            <p className="whitespace-pre-line">{shown.resolution}</p>
            <p className="text-stone-600">
              Cerrada por {shown.resolvedBy?.name ?? '—'} · {formatDateTime(shown.resolvedAt)}
            </p>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} noValidate className="space-y-2">
            <label htmlFor={resolutionId} className="block font-medium text-stone-700">
              Resolución (qué se hizo fuera del sistema)
            </label>
            <textarea
              id={resolutionId}
              value={resolution}
              rows={4}
              maxLength={SALE_INCIDENT_TEXT_MAX_LENGTH}
              aria-invalid={!!fieldError}
              aria-describedby={`${resolutionId}-help${fieldError ? ` ${resolutionId}-error` : ''}`}
              onChange={(event) => {
                setResolution(event.target.value);
              }}
              className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none aria-invalid:border-red-500"
            />
            <p id={`${resolutionId}-help`} className="text-xs text-stone-600">
              Obligatoria, al menos {SALE_INCIDENT_TEXT_MIN_LENGTH} caracteres.
            </p>
            {fieldError && (
              <p id={`${resolutionId}-error`} className="text-xs text-red-600">
                {fieldError}
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={close.isPending}>
                {close.isPending ? 'Cerrando…' : 'Cerrar incidencia'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}

/**
 * Incidencias de venta (`/ventas/incidencias`, solo `sales-incidents:manage`). Son registros de
 * trazabilidad (D-10): no tienen importes ni cantidades y nada en el sistema actúa sobre ellas.
 */
export function IncidentsPage() {
  useDocumentTitle('Incidencias de venta');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('OPEN');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<SaleIncident | null>(null);
  const list = useIncidents(page, status, from, to);
  const rows = list.data?.data ?? [];

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Incidencias de venta</h1>
        <p className="text-sm text-stone-600">
          Errores reportados por el personal. {INCIDENT_NO_EFFECT_NOTICE} Lo que corresponda se
          resuelve fuera del sistema y se describe al cerrar la incidencia.
        </p>
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="incident-status" className="block text-sm font-medium text-stone-700">
              Estado
            </label>
            <select
              id="incident-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="min-h-10 rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="OPEN">Abiertas</option>
              <option value="CLOSED">Cerradas</option>
              <option value="all">Todas</option>
            </select>
          </div>
          <Input
            label="Reportada desde"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
          />
          <Input
            label="Reportada hasta"
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
            Cargando incidencias…
          </p>
        )}
        {list.isError && (
          <p role="alert" className="py-6 text-sm text-red-700">
            No se pudieron cargar las incidencias.{' '}
            <button className="underline" onClick={() => void list.refetch()}>
              Reintentar
            </button>
          </p>
        )}
        {list.isSuccess && rows.length === 0 && (
          <p className="py-6 text-sm text-stone-600">No hay incidencias con estos filtros.</p>
        )}
        {list.isSuccess && rows.length > 0 && (
          <div aria-busy={list.isPlaceholderData} className="mt-4 overflow-x-auto">
            <table className="table-cards w-full text-left text-sm">
              <caption className="sr-only">Incidencias de venta</caption>
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th className="py-2 pr-4">Incidencia</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4">Venta</th>
                  <th className="py-2 pr-4">Reportó</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((incident) => (
                  <tr key={incident.id} className="border-b border-stone-100">
                    <td className="py-3 pr-4 font-medium">
                      {formatIncidentNumber(incident.number)}
                    </td>
                    <td data-label="Tipo" className="py-3 pr-4">
                      {INCIDENT_KIND_LABELS[incident.kind]}
                    </td>
                    <td data-label="Venta" className="py-3 pr-4">
                      {incident.sale ? formatSaleNumber(incident.sale.number) : '—'}
                    </td>
                    <td data-label="Reportó" className="py-3 pr-4">
                      {incident.reportedBy.name}
                      <span className="block text-xs text-stone-600">
                        {formatDateTime(incident.reportedAt)}
                      </span>
                    </td>
                    <td data-label="Estado" className="py-3 pr-4">
                      <StatusBadge status={incident.status} />
                    </td>
                    <td className="py-3">
                      <Button
                        variant="secondary"
                        aria-label={`Ver la incidencia ${formatIncidentNumber(incident.number)}`}
                        onClick={() => {
                          setSelected(incident);
                        }}
                      >
                        Ver
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          total={list.data?.meta.total ?? 0}
          noun="incidencias"
          onPageChange={setPage}
        />
      </div>
      {selected && (
        <IncidentDialog
          incident={selected}
          onClose={() => {
            setSelected(null);
          }}
        />
      )}
    </section>
  );
}
