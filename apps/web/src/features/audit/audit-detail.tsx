import { BUSINESS_TIME_ZONE } from '@joyeria/shared';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { actionLabel, entityTypeLabel, fieldLabel, hasActionLabel } from './audit-labels.ts';
import {
  diffAudit,
  flattenAudit,
  formatAuditValue,
  type AuditJson,
  type DiffRow,
} from './audit-diff.ts';
import { useAuditDetail } from './use-audit.ts';

const fullDate = new Intl.DateTimeFormat('es-BO', {
  timeZone: BUSINESS_TIME_ZONE,
  dateStyle: 'long',
  timeStyle: 'medium',
});

const CELL = 'px-2 py-1.5 align-top [overflow-wrap:anywhere]';

function DiffTable({ rows }: { rows: DiffRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-stone-200">
      <table className="w-full table-fixed text-left text-sm">
        <caption className="sr-only">Diferencias entre el valor anterior y el nuevo</caption>
        <thead className="bg-stone-50 text-xs text-stone-600">
          <tr>
            <th scope="col" className={`${CELL} w-1/3`}>
              Campo
            </th>
            <th scope="col" className={CELL}>
              Antes
            </th>
            <th scope="col" className={CELL}>
              Después
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.field}
              data-changed={row.changed}
              className={`border-t border-stone-100 ${row.changed ? 'bg-amber-50' : ''}`}
            >
              <th scope="row" className={`${CELL} font-medium`}>
                {fieldLabel(row.field)}
                {row.changed && <span className="sr-only"> (cambió)</span>}
              </th>
              <td className={`${CELL} ${row.changed ? 'text-red-800' : 'text-stone-600'}`}>
                {formatAuditValue(row.before)}
              </td>
              <td
                className={`${CELL} ${row.changed ? 'font-medium text-green-800' : 'text-stone-600'}`}
              >
                {formatAuditValue(row.after)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetadataTable({ value }: { value: AuditJson }) {
  return (
    <div className="overflow-hidden rounded-lg border border-stone-200">
      <table className="w-full table-fixed text-left text-sm">
        <caption className="sr-only">Datos adicionales del registro</caption>
        <thead className="bg-stone-50 text-xs text-stone-600">
          <tr>
            <th scope="col" className={`${CELL} w-1/3`}>
              Campo
            </th>
            <th scope="col" className={CELL}>
              Valor
            </th>
          </tr>
        </thead>
        <tbody>
          {flattenAudit(value).map(([field, child]) => (
            <tr key={field} className="border-t border-stone-100">
              <th scope="row" className={`${CELL} font-medium`}>
                {fieldLabel(field)}
              </th>
              <td className={`${CELL} text-stone-700`}>{formatAuditValue(child)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
      <dt className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{label}</dt>
      <dd className="text-sm [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/**
 * Detalle de un registro de auditoría, en un diálogo modal accesible (Esc cierra, el foco entra al
 * botón «Cerrar» y vuelve al elemento que lo abrió). Todo valor se muestra como texto: React lo
 * escapa y nunca se inserta HTML.
 */
export function AuditDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = useAuditDetail(id);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [showJson, setShowJson] = useState(false);

  // El padre crea «onClose» en cada render: se guarda en una ref para no repetir el efecto de foco.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  const entry = detail.data;
  const hasChanges = entry !== undefined && (entry.before !== null || entry.after !== null);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Cerrar detalle"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-stone-900/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-3">
          <h2 id={titleId} className="text-lg font-semibold">
            Detalle del registro
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          >
            <X className="size-5" aria-hidden="true" />
            <span className="sr-only">Cerrar</span>
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-4 py-4">
          {detail.isPending && (
            <p role="status" className="text-sm text-stone-600">
              Cargando detalle…
            </p>
          )}
          {detail.isError && (
            <p role="alert" className="text-sm text-red-700">
              No se pudo cargar el detalle.{' '}
              <button className="underline" onClick={() => void detail.refetch()}>
                Reintentar
              </button>
            </p>
          )}
          {entry && (
            <>
              <dl className="space-y-2">
                <Field label="Fecha">
                  {fullDate.format(new Date(entry.createdAt))} (hora de La Paz)
                </Field>
                <Field label="Usuario">
                  {entry.user ? (
                    <>
                      {entry.user.name} <span className="text-stone-500">({entry.user.email})</span>
                    </>
                  ) : (
                    <span className="text-stone-500">Sistema o usuario desconocido</span>
                  )}
                </Field>
                <Field label="Acción">
                  <span className="font-medium">{actionLabel(entry.action)}</span>
                  {hasActionLabel(entry.action) && (
                    <span className="ml-2 font-mono text-xs text-stone-500">{entry.action}</span>
                  )}
                </Field>
                <Field label="Entidad">
                  {entry.entityType ? entityTypeLabel(entry.entityType) : '—'}
                  {entry.entityId && (
                    <span className="ml-2 font-mono text-xs text-stone-500">{entry.entityId}</span>
                  )}
                </Field>
                <Field label="IP">{entry.ip ?? '—'}</Field>
                <Field label="ID de petición">
                  <span className="font-mono text-xs">{entry.requestId ?? '—'}</span>
                </Field>
                <Field label="Navegador">
                  <span className="text-xs">{entry.userAgent ?? '—'}</span>
                </Field>
              </dl>

              <section aria-labelledby={`${titleId}-changes`} className="space-y-2">
                <h3 id={`${titleId}-changes`} className="text-sm font-semibold">
                  Antes y después
                </h3>
                {hasChanges ? (
                  <DiffTable rows={diffAudit(entry.before, entry.after)} />
                ) : (
                  <p className="text-sm text-stone-600">
                    Este registro no guardó valores anteriores ni nuevos.
                  </p>
                )}
              </section>

              {entry.metadata !== null && (
                <section aria-labelledby={`${titleId}-meta`} className="space-y-2">
                  <h3 id={`${titleId}-meta`} className="text-sm font-semibold">
                    Datos adicionales
                  </h3>
                  <MetadataTable value={entry.metadata} />
                </section>
              )}

              <div className="space-y-2">
                <Button
                  variant="secondary"
                  aria-expanded={showJson}
                  onClick={() => {
                    setShowJson((value) => !value);
                  }}
                >
                  {showJson ? 'Ocultar JSON completo' : 'Ver JSON completo'}
                </Button>
                {showJson && (
                  <pre
                    aria-label="JSON completo del registro"
                    className="max-h-80 overflow-auto rounded-lg bg-stone-900 p-3 text-xs break-words whitespace-pre-wrap text-stone-100"
                  >
                    {JSON.stringify(
                      {
                        before: entry.before,
                        after: entry.after,
                        metadata: entry.metadata,
                      } satisfies Record<string, AuditJson>,
                      null,
                      2,
                    )}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
