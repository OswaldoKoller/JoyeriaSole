import {
  CASH_CORRECTION_REASON_MAX_LENGTH,
  CASH_CORRECTION_REASON_MIN_LENGTH,
  ERROR_CODES,
  createCashCorrectionSchema,
  type CashSessionDetail,
  type CreateCashCorrectionInput,
} from '@joyeria/shared';
import { useId, useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Dialog } from '../../components/ui/dialog.tsx';
import { Input } from '../../components/ui/input.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { formatBs } from '../../lib/format.ts';
import { centsToAmount, isBlank, normalizeMoneyText } from '../../lib/money-input.ts';
import { correctionPreview, differenceLabel } from './cash-math.ts';
import { useCorrectCash } from './use-cash.ts';

type Kind = CreateCashCorrectionInput['kind'];

const KIND_LABELS: Record<Kind, string> = {
  COUNTED_CASH: 'Efectivo contado mal registrado',
  OPENING_AMOUNT: 'Fondo inicial mal registrado',
  NOTE: 'Solo agregar una observación',
};

/**
 * Corrección de un cierre (solo Administrador, `cash:correct`; doc. 10). Es append-only: agrega una
 * fila y no modifica la sesión, las ventas ni los pagos. Solo corrige errores de CAPTURA del
 * arqueo (contado, fondo) o agrega una observación; nunca toca importes de ventas.
 */
export function CorrectionDialog({
  session,
  onClose,
  onDone,
}: {
  session: CashSessionDetail;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const correct = useCorrectCash(session.id);
  const [kind, setKind] = useState<Kind>('COUNTED_CASH');
  const [newValue, setNewValue] = useState('');
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const reasonId = useId();
  const kindId = useId();

  const currentValue =
    kind === 'OPENING_AMOUNT' ? session.current.openingAmount : session.current.countedCash;
  const preview = kind === 'NOTE' ? null : correctionPreview(session.current, kind, newValue);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const candidate =
      kind === 'NOTE'
        ? { kind, reason }
        : {
            kind,
            expectedPreviousValue: currentValue ?? '',
            newValue: normalizeMoneyText(newValue),
            reason,
          };
    const parsed = createCashCorrectionSchema.safeParse(candidate);
    const errors: Record<string, string> = {};
    if (kind !== 'NOTE' && isBlank(newValue)) errors.newValue = 'Indique el valor correcto.';
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '');
        if (!errors[field]) errors[field] = issue.message;
      }
    }
    setFieldErrors(errors);
    if (!parsed.success || Object.keys(errors).length > 0) return;
    try {
      await correct.mutateAsync(parsed.data);
      onDone('Corrección registrada. Las cifras vigentes del cierre se actualizaron.');
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === ERROR_CODES.CASH_CORRECTION_CONFLICT) {
        setError(
          'Otra persona corrigió este cierre mientras usted escribía. Cierre esta ventana, revise las cifras vigentes y vuelva a intentarlo.',
        );
        return;
      }
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'No se pudo comunicar con el servidor. Puede reintentar: la corrección no se registrará dos veces.',
      );
    }
  }

  return (
    <Dialog title="Corregir cierre" onClose={onClose} busy={correct.isPending}>
      <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
        <p className="text-sm text-stone-700">
          La corrección queda registrada junto al cierre original, que no se modifica. No cambia
          ventas, pagos ni stock.
        </p>
        <div className="space-y-1">
          <label htmlFor={kindId} className="block text-sm font-medium text-stone-700">
            Qué se corrige
          </label>
          <select
            id={kindId}
            data-autofocus
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as Kind);
              setFieldErrors({});
            }}
            className="min-h-10 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          >
            {(Object.keys(KIND_LABELS) as Kind[]).map((value) => (
              <option key={value} value={value}>
                {KIND_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        {kind !== 'NOTE' && (
          <>
            <p className="text-sm">
              Valor vigente: <strong className="tabular-nums">{formatBs(currentValue)}</strong>
            </p>
            <Input
              label="Valor correcto (Bs)"
              inputMode="decimal"
              autoComplete="off"
              value={newValue}
              onChange={(event) => {
                setNewValue(event.target.value);
              }}
              error={fieldErrors.newValue}
            />
            {preview && (
              <p aria-live="polite" className="rounded-lg bg-stone-50 p-3 text-sm">
                Tras la corrección: esperado {formatBs(centsToAmount(preview.expectedCents))},
                contado {formatBs(centsToAmount(preview.countedCents))} ·{' '}
                {differenceLabel(preview.differenceCents)}.
              </p>
            )}
          </>
        )}

        <div className="space-y-1">
          <label htmlFor={reasonId} className="block text-sm font-medium text-stone-700">
            Motivo de la corrección
          </label>
          <textarea
            id={reasonId}
            value={reason}
            rows={3}
            maxLength={CASH_CORRECTION_REASON_MAX_LENGTH}
            aria-invalid={!!fieldErrors.reason}
            aria-describedby={`${reasonId}-help${fieldErrors.reason ? ` ${reasonId}-error` : ''}`}
            onChange={(event) => {
              setReason(event.target.value);
            }}
            className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none aria-invalid:border-red-500"
          />
          <p id={`${reasonId}-help`} className="text-xs text-stone-600">
            Al menos {CASH_CORRECTION_REASON_MIN_LENGTH} caracteres.
          </p>
          {fieldErrors.reason && (
            <p id={`${reasonId}-error`} className="text-xs text-red-600">
              {fieldErrors.reason}
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={correct.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={correct.isPending}>
            {correct.isPending ? 'Registrando…' : 'Registrar corrección'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
