import {
  SALE_INCIDENT_KINDS,
  SALE_INCIDENT_TEXT_MAX_LENGTH,
  SALE_INCIDENT_TEXT_MIN_LENGTH,
  createSaleIncidentSchema,
  formatSaleNumber,
  type SaleIncident,
} from '@joyeria/shared';
import { useId, useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Dialog } from '../../components/ui/dialog.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { INCIDENT_KIND_LABELS, INCIDENT_NO_EFFECT_NOTICE } from './sale-labels.ts';
import { useReportIncident } from './use-sales.ts';

type Kind = SaleIncident['kind'];

/**
 * Reportar una incidencia sobre una venta (C5, C6). Es SOLO un registro para que el Administrador
 * lo atienda: no cambia la venta, el stock, los pagos ni la caja (D-10). Lo que haya que hacer
 * se resuelve fuera del sistema y se describe al cerrar la incidencia.
 */
export function ReportIncidentDialog({
  saleNumber,
  onClose,
  onReported,
}: {
  saleNumber: number;
  onClose: () => void;
  onReported: (incident: SaleIncident) => void;
}) {
  const report = useReportIncident();
  const [kind, setKind] = useState<Kind>('WRONG_SALE');
  const [description, setDescription] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const kindId = useId();
  const descriptionId = useId();

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const parsed = createSaleIncidentSchema.safeParse({ kind, description, saleNumber });
    if (!parsed.success) {
      setFieldError(
        parsed.error.issues.find((issue) => issue.path[0] === 'description')?.message ??
          parsed.error.issues[0]?.message ??
          'Revise los datos',
      );
      return;
    }
    setFieldError('');
    try {
      onReported(await report.mutateAsync(parsed.data));
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'No se pudo comunicar con el servidor. Puede reintentar: la incidencia no se registrará dos veces.',
      );
    }
  }

  return (
    <Dialog title="Reportar incidencia" onClose={onClose} busy={report.isPending}>
      <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
        <p className="text-sm">
          Venta <strong>{formatSaleNumber(saleNumber)}</strong>
        </p>
        <p className="rounded-lg bg-stone-50 p-3 text-sm text-stone-800">
          {INCIDENT_NO_EFFECT_NOTICE} El Administrador la revisará y la atenderá fuera del sistema.
        </p>
        <div className="space-y-1">
          <label htmlFor={kindId} className="block text-sm font-medium text-stone-700">
            Tipo de incidencia
          </label>
          <select
            id={kindId}
            data-autofocus
            value={kind}
            onChange={(event) => {
              const value = SALE_INCIDENT_KINDS.find((item) => item === event.target.value);
              if (value) setKind(value);
            }}
            className="min-h-10 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          >
            {SALE_INCIDENT_KINDS.map((value) => (
              <option key={value} value={value}>
                {INCIDENT_KIND_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={descriptionId} className="block text-sm font-medium text-stone-700">
            Qué pasó
          </label>
          <textarea
            id={descriptionId}
            value={description}
            rows={4}
            maxLength={SALE_INCIDENT_TEXT_MAX_LENGTH}
            aria-invalid={!!fieldError}
            aria-describedby={`${descriptionId}-help${fieldError ? ` ${descriptionId}-error` : ''}`}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
            className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none aria-invalid:border-red-500"
          />
          <p id={`${descriptionId}-help`} className="text-xs text-stone-600">
            Describa el error con al menos {SALE_INCIDENT_TEXT_MIN_LENGTH} caracteres.
          </p>
          {fieldError && (
            <p id={`${descriptionId}-error`} className="text-xs text-red-600">
              {fieldError}
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={report.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={report.isPending}>
            {report.isPending ? 'Enviando…' : 'Reportar incidencia'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
