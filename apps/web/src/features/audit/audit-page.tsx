import { type AuditEntry } from '@joyeria/shared';
import { useId, useState, type SyntheticEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { AuditDetailDialog } from './audit-detail.tsx';
import {
  EMPTY_FILTERS,
  countActiveFilters,
  filtersFromParams,
  filtersToParams,
  toQueryFilters,
  type AuditFormFilters,
} from './audit-filters.ts';
import { actionLabel, entityTypeLabel } from './audit-labels.ts';
import { useAuditFilters, useAuditList } from './use-audit.ts';
import { Pagination } from '../../components/ui/pagination.tsx';
import { formatDateTimeSeconds } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';

const SELECT =
  'block min-h-10 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none';

function Select({
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  // Si la URL trae un valor que aún no existe en la lista, se conserva como opción.
  const all =
    value && !options.some((option) => option.value === value)
      ? [...options, { value, label: value }]
      : options;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-stone-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className={SELECT}
      >
        <option value="">{allLabel}</option>
        {all.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function AuditRow({ entry, onOpen }: { entry: AuditEntry; onOpen: (id: string) => void }) {
  return (
    <tr className="border-b border-stone-100">
      <td className="py-3 pr-4 whitespace-nowrap tabular-nums">
        {formatDateTimeSeconds(entry.createdAt)}
      </td>
      <td data-label="Usuario" className="py-3 pr-4">
        {entry.user ? entry.user.name : <span className="text-stone-500">Sistema</span>}
      </td>
      <td data-label="Acción" className="py-3 pr-4">
        <span className="font-medium">{actionLabel(entry.action)}</span>
      </td>
      <td data-label="Entidad" className="py-3 pr-4">
        {entry.entityType ? entityTypeLabel(entry.entityType) : '—'}
        {entry.entityId && (
          <span className="ml-1 font-mono text-xs text-stone-500">
            {entry.entityId.length > 12 ? `${entry.entityId.slice(0, 8)}…` : entry.entityId}
          </span>
        )}
      </td>
      <td data-label="IP" className="py-3 pr-4 font-mono text-xs">
        {entry.ip ?? '—'}
      </td>
      <td className="py-3">
        <button
          type="button"
          onClick={() => {
            onOpen(entry.id);
          }}
          aria-label={`Ver detalle: ${actionLabel(entry.action)}, ${formatDateTimeSeconds(entry.createdAt)}`}
          className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          Ver detalle
        </button>
      </td>
    </tr>
  );
}

/**
 * Auditoría (solo Administrador, Q-15.3). Los filtros aplicados viven en la URL, de modo que otras
 * pantallas pueden enlazar aquí (`/auditoria?entityType=...&entityId=...`) y la búsqueda se puede
 * compartir o recargar. Solo lectura: no hay acciones que modifiquen registros.
 */
export function AuditPage() {
  useDocumentTitle('Auditoría');
  const [params, setParams] = useSearchParams();
  const applied = filtersFromParams(params);
  const selected = params.get('registro');
  const [draft, setDraft] = useState<AuditFormFilters>(applied);
  const [page, setPage] = useState(1);
  const options = useAuditFilters();
  const list = useAuditList(toQueryFilters(applied), page);
  const rows = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;
  const dateError =
    draft.from && draft.to && draft.from > draft.to
      ? 'La fecha «hasta» no puede ser anterior a «desde».'
      : '';

  function update<K extends keyof AuditFormFilters>(field: K, value: AuditFormFilters[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function apply(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dateError) return;
    setPage(1);
    setParams(filtersToParams({ ...draft, q: draft.q.trim(), entityId: draft.entityId.trim() }));
  }

  function clear() {
    setDraft(EMPTY_FILTERS);
    setPage(1);
    setParams({});
  }

  function openDetail(id: string) {
    const next = new URLSearchParams(params);
    next.set('registro', id);
    setParams(next);
  }

  function closeDetail() {
    const next = new URLSearchParams(params);
    next.delete('registro');
    setParams(next, { replace: true });
  }

  const activeCount = countActiveFilters(applied);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Auditoría</h1>
        <p className="text-sm text-stone-600">
          Registro de las acciones importantes del sistema: quién hizo qué y cuándo. Solo el
          Administrador puede verlo y nadie puede modificarlo.
        </p>
      </div>

      <form
        onSubmit={apply}
        aria-label="Filtros de auditoría"
        className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Usuario"
            value={draft.userId}
            onChange={(value) => {
              update('userId', value);
            }}
            allLabel="Todos los usuarios"
            options={(options.data?.users ?? []).map((user) => ({
              value: user.id,
              label: user.name,
            }))}
          />
          <Select
            label="Acción"
            value={draft.action}
            onChange={(value) => {
              update('action', value);
            }}
            allLabel="Todas las acciones"
            options={(options.data?.actions ?? []).map((action) => ({
              value: action,
              label: actionLabel(action),
            }))}
          />
          <Select
            label="Tipo de entidad"
            value={draft.entityType}
            onChange={(value) => {
              update('entityType', value);
            }}
            allLabel="Todos los tipos"
            options={(options.data?.entityTypes ?? []).map((type) => ({
              value: type,
              label: entityTypeLabel(type),
            }))}
          />
          <Input
            label="ID de la entidad"
            value={draft.entityId}
            onChange={(event) => {
              update('entityId', event.target.value);
            }}
            maxLength={64}
            autoComplete="off"
          />
          <Input
            label="Desde"
            type="date"
            value={draft.from}
            max={draft.to || undefined}
            onChange={(event) => {
              update('from', event.target.value);
            }}
          />
          <Input
            label="Hasta"
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(event) => {
              update('to', event.target.value);
            }}
            error={dateError}
          />
        </div>
        <Input
          label="Buscar (acción, entidad, ID o usuario)"
          value={draft.q}
          onChange={(event) => {
            update('q', event.target.value);
          }}
          maxLength={100}
          autoComplete="off"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!!dateError}>
            Aplicar filtros
          </Button>
          <Button variant="secondary" onClick={clear}>
            Limpiar filtros
          </Button>
        </div>
        {options.isError && (
          <p role="alert" className="text-sm text-red-700">
            No se pudieron cargar las listas de los filtros.{' '}
            <button type="button" className="underline" onClick={() => void options.refetch()}>
              Reintentar
            </button>
          </p>
        )}
      </form>

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        <p role="status" aria-live="polite" className="text-sm text-stone-600">
          {list.isSuccess
            ? `${total} ${total === 1 ? 'registro' : 'registros'}${
                activeCount > 0
                  ? ` con ${activeCount} ${activeCount === 1 ? 'filtro' : 'filtros'}`
                  : ''
              }`
            : ''}
        </p>

        {list.isPending && (
          <p role="status" className="py-6 text-sm">
            Cargando registros…
          </p>
        )}
        {list.isError && (
          <p role="alert" className="py-6 text-sm text-red-700">
            No se pudo cargar la auditoría.{' '}
            <button type="button" className="underline" onClick={() => void list.refetch()}>
              Reintentar
            </button>
          </p>
        )}
        {list.isSuccess && rows.length === 0 && (
          <p className="py-6 text-sm text-stone-600">
            {activeCount > 0
              ? 'No hay registros que coincidan con los filtros.'
              : 'Todavía no hay registros de auditoría.'}
          </p>
        )}
        {rows.length > 0 && (
          <div
            aria-busy={list.isPlaceholderData}
            className={`mt-2 overflow-x-auto ${list.isPlaceholderData ? 'opacity-60' : ''}`}
          >
            <table className="table-cards w-full text-left text-sm">
              <caption className="sr-only">
                Registros de auditoría, del más reciente al más antiguo
              </caption>
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th scope="col" className="py-2 pr-4">
                    Fecha
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Usuario
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Acción
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Entidad
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    IP
                  </th>
                  <th scope="col" className="py-2">
                    <span className="sr-only">Detalle</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <AuditRow key={entry.id} entry={entry} onOpen={openDetail} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {list.isSuccess && (
          <Pagination page={page} total={total} noun="registros" onPageChange={setPage} />
        )}
      </div>

      {selected && /^\d{1,18}$/.test(selected) && (
        <AuditDetailDialog id={selected} onClose={closeDetail} />
      )}
    </section>
  );
}
