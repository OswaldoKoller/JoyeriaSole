import {
  CASH_CLOSE_NOTES_MAX_LENGTH,
  CASH_CLOSE_NOTES_MIN_LENGTH,
  ERROR_CODES,
  closeCashSessionSchema,
  formatCashSessionNumber,
  type CashSessionDetail,
} from '@joyeria/shared';
import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { ButtonLink } from '../../components/ui/button-link.tsx';
import { Dialog } from '../../components/ui/dialog.tsx';
import { Input } from '../../components/ui/input.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { formatBs, formatDateTime } from '../../lib/format.ts';
import { isBlank, normalizeMoneyText } from '../../lib/money-input.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { DifferenceText, FiguresList, MethodTotals } from './cash-figures.tsx';
import { differenceLabel, noteIsValid, noteRequired, previewDifference } from './cash-math.ts';
import { useCloseCash, useCurrentCashSession } from './use-cash.ts';

type Step = 'count' | 'summary';

/** Error de red o del servidor: el resultado es incierto y se reintenta con la MISMA clave. */
function isUncertain(error: unknown) {
  return !(error instanceof ApiError) || error.status >= 500;
}

function readNoteDetails(details: unknown): { expectedCash: string } | null {
  if (details && typeof details === 'object' && 'expectedCash' in details) {
    const expected = details.expectedCash;
    if (typeof expected === 'string') return { expectedCash: expected };
  }
  return null;
}

/**
 * Cierre de caja con arqueo (`/caja/cierre`, B5, R-14): (1) efectivo contado; (2) resumen con
 * esperado, contado y diferencia anunciada, QR y transferencia aparte y observación obligatoria si
 * hay diferencia; (3) confirmación accesible «El cierre no se puede reabrir». El esperado lo
 * calcula el servidor; si cambió mientras tanto (ventas en curso), se actualiza y se pide la nota.
 */
export function CashClosePage() {
  useDocumentTitle('Cerrar caja');
  const current = useCurrentCashSession();
  const session = current.data ?? null;
  // El resultado vive aquí: al cerrar, la «sesión actual» pasa a vacía y el formulario se desmonta.
  const [closed, setClosed] = useState<CashSessionDetail | null>(null);

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm">
          <Link to="/caja" className="text-brand-700 underline">
            Volver a la caja
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">Cerrar caja</h1>
      </div>
      {closed && <ClosedResult closed={closed} />}
      {!closed && current.isPending && (
        <p role="status" className="text-sm">
          Cargando la caja…
        </p>
      )}
      {!closed && current.isError && (
        <p role="alert" className="text-sm text-red-700">
          No se pudo cargar la caja.{' '}
          <button className="underline" onClick={() => void current.refetch()}>
            Reintentar
          </button>
        </p>
      )}
      {!closed && current.isSuccess && !session && (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm text-amber-950">No hay ninguna caja abierta para cerrar.</p>
          <ButtonLink to="/caja/historial" variant="secondary">
            Ver el historial de cajas
          </ButtonLink>
        </div>
      )}
      {!closed && session && (
        <CloseForm
          key={session.id}
          session={session}
          onRefresh={current.refetch}
          onClosed={setClosed}
        />
      )}
    </section>
  );
}

function CloseForm({
  session,
  onRefresh,
  onClosed,
}: {
  session: CashSessionDetail;
  onRefresh: () => Promise<unknown>;
  onClosed: (session: CashSessionDetail) => void;
}) {
  const close = useCloseCash(session.id);
  const [step, setStep] = useState<Step>('count');
  const [counted, setCounted] = useState('');
  const [countedError, setCountedError] = useState('');
  const [notes, setNotes] = useState('');
  const [notesError, setNotesError] = useState('');
  const [serverExpected, setServerExpected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const summaryRef = useRef<HTMLHeadingElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const notesId = useId();
  // Pedir el foco en la observación DESPUÉS de cerrar el diálogo (que devuelve el foco al abrirlo).
  const [focusNotes, setFocusNotes] = useState(0);

  const expected = serverExpected ?? session.liveExpectedCash ?? session.current.expectedCash;
  const difference = previewDifference(expected, counted);
  const needsNote = noteRequired(difference);

  useEffect(() => {
    if (step === 'summary') summaryRef.current?.focus();
  }, [step]);
  useEffect(() => {
    if (focusNotes > 0) notesRef.current?.focus();
  }, [focusNotes]);

  function toSummary(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBlank(counted)) {
      setCountedError('Indique el efectivo contado. Si no hay efectivo, escriba 0.');
      return;
    }
    const parsed = closeCashSessionSchema.shape.countedCash.safeParse(normalizeMoneyText(counted));
    if (!parsed.success) {
      setCountedError(parsed.error.issues[0]?.message ?? 'Importe inválido');
      return;
    }
    setCountedError('');
    setError('');
    setStep('summary');
    // El esperado puede haber cambiado por ventas recientes: se vuelve a pedir.
    setServerExpected(null);
    void onRefresh();
  }

  function askConfirmation() {
    setError('');
    if (needsNote && !noteIsValid(notes)) {
      setNotesError(
        `Hay una diferencia: explique el motivo (al menos ${CASH_CLOSE_NOTES_MIN_LENGTH} caracteres).`,
      );
      notesRef.current?.focus();
      return;
    }
    setNotesError('');
    setConfirming(true);
  }

  async function confirmClose() {
    setError('');
    const input = {
      countedCash: normalizeMoneyText(counted),
      ...(isBlank(notes) ? {} : { notes: notes.trim() }),
    };
    try {
      const result = await close.mutateAsync(input);
      setConfirming(false);
      onClosed(result);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === ERROR_CODES.CASH_DIFFERENCE_NOTE_REQUIRED) {
        const details = readNoteDetails(cause.details);
        if (details) setServerExpected(details.expectedCash);
        setConfirming(false);
        setNotesError(
          'Se registraron ventas mientras cerraba y ahora hay una diferencia: revise las cifras y escriba la observación.',
        );
        setFocusNotes((value) => value + 1);
        return;
      }
      if (cause instanceof ApiError && cause.code === ERROR_CODES.CASH_SESSION_CLOSED) {
        setConfirming(false);
        setError('Esta caja ya fue cerrada por otra persona. Revise el historial de cajas.');
        return;
      }
      setError(
        isUncertain(cause)
          ? 'No se pudo confirmar el cierre por un problema de conexión. Pulse «Confirmar cierre» otra vez: se reintenta la misma operación y la caja no se cerrará dos veces.'
          : cause instanceof ApiError
            ? cause.message
            : 'No se pudo cerrar la caja.',
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
        <h2 className="text-lg font-semibold">
          Caja {formatCashSessionNumber(session.number)} · abierta por {session.openedBy.name}
        </h2>
        <p className="text-sm text-stone-700">Desde {formatDateTime(session.openedAt)}.</p>
      </div>

      {step === 'count' && (
        <form
          onSubmit={toSummary}
          noValidate
          className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
        >
          <h2 className="text-lg font-semibold">1. Cuente el efectivo</h2>
          <p className="text-sm text-stone-700">
            Cuente todo el efectivo de la caja, incluido el fondo inicial, y escriba el total.
          </p>
          <div className="max-w-xs">
            <Input
              label="Efectivo contado (Bs)"
              inputMode="decimal"
              autoComplete="off"
              value={counted}
              onChange={(event) => {
                setCounted(event.target.value);
              }}
              error={countedError}
              autoFocus
            />
          </div>
          <Button type="submit">Continuar</Button>
        </form>
      )}

      {step === 'summary' && (
        <div className="space-y-5 rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
          <h2 ref={summaryRef} tabIndex={-1} className="text-lg font-semibold">
            2. Revise el arqueo
          </h2>
          <FiguresList
            label="Arqueo"
            rows={[
              { label: 'Fondo inicial', value: formatBs(session.openingAmount) },
              { label: 'Efectivo esperado', value: formatBs(expected) },
              { label: 'Efectivo contado', value: formatBs(normalizeMoneyText(counted)) },
            ]}
          />
          <p aria-live="polite" aria-atomic="true" className="text-base">
            Diferencia: <strong>{difference === null ? '—' : differenceLabel(difference)}</strong>
          </p>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-stone-800">Cobros de la sesión</h3>
            <MethodTotals session={session} />
            <p className="mt-2 text-sm text-stone-700">
              QR y transferencia se informan aparte: no forman parte del efectivo contado.
            </p>
          </div>
          <div className="space-y-1">
            <label htmlFor={notesId} className="block text-sm font-medium text-stone-700">
              Observación{needsNote ? ' (obligatoria: hay diferencia)' : ' (opcional)'}
            </label>
            <textarea
              id={notesId}
              ref={notesRef}
              value={notes}
              maxLength={CASH_CLOSE_NOTES_MAX_LENGTH}
              rows={3}
              aria-invalid={!!notesError}
              aria-describedby={notesError ? `${notesId}-error` : undefined}
              aria-required={needsNote}
              onChange={(event) => {
                setNotes(event.target.value);
              }}
              className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none aria-invalid:border-red-500"
            />
            {notesError && (
              <p id={`${notesId}-error`} role="alert" className="text-sm text-red-700">
                {notesError}
              </p>
            )}
          </div>
          {error && !confirming && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setStep('count');
              }}
            >
              Corregir el contado
            </Button>
            <Button onClick={askConfirmation}>Cerrar caja</Button>
          </div>
        </div>
      )}

      {confirming && (
        <Dialog
          title="¿Cerrar la caja?"
          busy={close.isPending}
          onClose={() => {
            setConfirming(false);
          }}
        >
          <div className="space-y-4">
            <p className="text-sm text-stone-800">
              El cierre no se puede reabrir. Se registrará un contado de{' '}
              <strong>{formatBs(normalizeMoneyText(counted))}</strong> frente a un esperado de{' '}
              <strong>{formatBs(expected)}</strong> (
              {difference === null ? '—' : differenceLabel(difference).toLowerCase()}).
            </p>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                disabled={close.isPending}
                onClick={() => {
                  setConfirming(false);
                }}
              >
                Volver
              </Button>
              <Button data-autofocus disabled={close.isPending} onClick={() => void confirmClose()}>
                {close.isPending ? 'Cerrando…' : 'Confirmar cierre'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** Resultado del cierre (el foco pasa al título para anunciarlo). */
function ClosedResult({ closed }: { closed: CashSessionDetail }) {
  const resultRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    resultRef.current?.focus();
  }, []);
  return (
    <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
      <h2 ref={resultRef} tabIndex={-1} className="text-lg font-semibold text-emerald-900">
        Caja {formatCashSessionNumber(closed.number)} cerrada
      </h2>
      <FiguresList
        label="Arqueo registrado"
        rows={[
          { label: 'Efectivo esperado', value: formatBs(closed.expectedCash) },
          { label: 'Efectivo contado', value: formatBs(closed.countedCash) },
          { label: 'Diferencia', value: <DifferenceText amount={closed.difference} /> },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <ButtonLink to={`/caja/sesiones/${closed.id}`}>Ver el detalle del cierre</ButtonLink>
        <ButtonLink to="/caja" variant="secondary">
          Volver a la caja
        </ButtonLink>
      </div>
    </div>
  );
}
