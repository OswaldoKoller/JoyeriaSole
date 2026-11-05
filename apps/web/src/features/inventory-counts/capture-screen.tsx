import {
  PERMISSIONS,
  countLabel,
  type CountFinding,
  type InventoryCountBlindDetail,
  type LastCountScan,
} from '@joyeria/shared';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { useCurrentUser, useHasPermission } from '../auth/use-auth.ts';
import { CountStatusBadge } from './status-badge.tsx';
import {
  useCancelInventoryCount,
  useCountTransition,
  useScanMutations,
} from './use-inventory-counts.ts';

function messageOf(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return 'No se pudo completar la operación. Intente de nuevo.';
}

/** Pitido corto de confirmación (si el navegador lo permite); nunca bloquea la captura. */
function beep(kind: 'ok' | 'finding' | 'error') {
  try {
    const AudioContextClass = window.AudioContext;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = kind === 'ok' ? 880 : kind === 'finding' ? 440 : 200;
    gain.gain.value = 0.05;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (kind === 'ok' ? 0.08 : 0.2));
    oscillator.onended = () => void context.close();
  } catch {
    // Sin audio disponible: queda el aviso visual.
  }
}

type Feedback = { tone: 'ok' | 'finding' | 'error'; text: string };

function describeScan(scan: LastCountScan): Feedback {
  if (scan.kind === 'FINDING') {
    return {
      tone: 'finding',
      text:
        scan.findingType === 'OUT_OF_SCOPE'
          ? `Hallazgo: ${scan.sku ?? scan.code} (${scan.productName ?? ''}) pertenece a otra categoría. Registradas: ${scan.quantityAfter}.`
          : `Hallazgo: el código ${scan.code} no existe en el sistema. Registradas: ${scan.quantityAfter}.`,
    };
  }
  return {
    tone: 'ok',
    text: `${scan.sku ?? scan.code} · ${scan.productName ?? ''}${
      scan.variantLabel && scan.variantLabel !== 'Única' ? ` · ${scan.variantLabel}` : ''
    } — contadas: ${scan.quantityAfter}`,
  };
}

const TONES: Record<Feedback['tone'], string> = {
  ok: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  finding: 'border-amber-300 bg-amber-50 text-amber-900',
  error: 'border-red-300 bg-red-50 text-red-800',
};

function FindingNote({
  finding,
  onSave,
}: {
  finding: CountFinding;
  onSave: (findingId: string, note: string) => void;
}) {
  const [note, setNote] = useState(finding.note ?? '');
  return (
    <li className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
      <p className="font-medium">
        {finding.type === 'OUT_OF_SCOPE'
          ? `Fuera de alcance: ${finding.sku ?? finding.code} · ${finding.productName ?? ''}`
          : `Código desconocido: ${finding.code}`}{' '}
        <span className="tabular-nums">× {finding.quantity}</span>
        {finding.round === 2 && <span className="text-xs text-stone-500"> (recuento)</span>}
      </p>
      <label htmlFor={`note-${finding.id}`} className="block text-xs text-stone-600">
        Nota sobre {finding.code}
      </label>
      <input
        id={`note-${finding.id}`}
        value={note}
        maxLength={2000}
        onChange={(event) => {
          setNote(event.target.value);
        }}
        onBlur={() => {
          if (note !== (finding.note ?? '')) onSave(finding.id, note);
        }}
        className="block min-h-10 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
      />
    </li>
  );
}

/**
 * Captura a ciegas (primer conteo y segundo recuento): solo se muestran la identificación de las
 * piezas y lo contado, jamás el stock del sistema. El campo de lectura queda siempre enfocado para
 * que el lector (teclado + Enter) funcione sin tocar el mouse.
 */
export function CaptureScreen({ count }: { count: InventoryCountBlindDetail }) {
  const { data: user } = useCurrentUser();
  const canManage = useHasPermission(PERMISSIONS.INVENTORY_COUNTS_MANAGE);
  const recounting = count.status === 'RECOUNT';
  const isOperator = !!user && user.id === count.operatorId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [flash, setFlash] = useState<Feedback['tone'] | null>(null);
  const [session, setSession] = useState(0);
  const [error, setError] = useState('');
  const { scan, undo, setQuantity, noteFinding } = useScanMutations(count.id);
  const take = useCountTransition(count.id, 'take');
  const close = useCountTransition(count.id, 'close');
  const cancel = useCancelInventoryCount(count.id);

  const focusInput = () => {
    inputRef.current?.focus();
  };
  useEffect(() => {
    if (isOperator) focusInput();
  }, [isOperator]);

  function signal(next: Feedback) {
    setFeedback(next);
    setFlash(next.tone);
    beep(next.tone);
    window.setTimeout(() => {
      setFlash(null);
    }, 400);
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = code.trim();
    if (!value) return;
    setCode('');
    setError('');
    try {
      const result = await scan.mutateAsync(value);
      if (result.scan) {
        signal(describeScan(result.scan));
        setSession((total) => total + 1);
      }
    } catch (failure) {
      const text = messageOf(failure);
      signal({ tone: 'error', text });
    } finally {
      focusInput();
    }
  }

  async function undoLast() {
    setError('');
    try {
      const result = await undo.mutateAsync();
      setFeedback({
        tone: 'ok',
        text: result.scan
          ? `Se deshizo la última lectura. Ahora: ${describeScan(result.scan).text}`
          : 'Se deshizo la última lectura.',
      });
      setSession((total) => Math.max(0, total - 1));
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      focusInput();
    }
  }

  async function closeNow() {
    setError('');
    const question = recounting
      ? 'Al cerrar el recuento, las variantes sin lecturas se cuentan como 0 y el conteo pasa a revisión. ¿Cerrar el recuento?'
      : 'Al cerrar el conteo, las variantes sin lecturas se cuentan como 0. Si hay diferencias con el sistema se pedirá un segundo recuento. ¿Cerrar el conteo?';
    if (!window.confirm(question)) return;
    try {
      await close.mutateAsync();
    } catch (failure) {
      setError(messageOf(failure));
    }
  }

  async function cancelNow() {
    setError('');
    if (!window.confirm('¿Cancelar este conteo? No se registrará ningún movimiento de stock.')) {
      return;
    }
    try {
      await cancel.mutateAsync('');
    } catch (failure) {
      setError(messageOf(failure));
    }
  }

  async function takeNow() {
    setError('');
    try {
      await take.mutateAsync();
    } catch (failure) {
      setError(messageOf(failure));
    }
  }

  async function setItemQuantity(variantId: string, value: string) {
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setError('Indique una cantidad entera de 0 o más.');
      return;
    }
    setError('');
    try {
      await setQuantity.mutateAsync({ variantId, quantity });
    } catch (failure) {
      setError(messageOf(failure));
    }
  }

  const flashClass =
    flash === 'ok'
      ? 'ring-4 ring-emerald-400'
      : flash === 'finding'
        ? 'ring-4 ring-amber-400'
        : flash === 'error'
          ? 'ring-4 ring-red-400'
          : '';

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          to="/inventario/conteos"
          className="inline-flex min-h-10 items-center text-sm text-brand-700 underline"
        >
          ← Conteos físicos
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
          {recounting ? 'Segundo recuento' : 'Conteo'} {countLabel(count.number)}{' '}
          <CountStatusBadge status={count.status} />
        </h1>
        <p className="text-sm text-stone-600">
          {count.scope ?? 'Sin categoría'} · Operador: {count.operatorName ?? '—'}
        </p>
        <p className="text-sm text-stone-600">
          {recounting
            ? 'Cuente de nuevo, a ciegas, solo las piezas de esta lista. El valor del recuento prevalece.'
            : 'Conteo a ciegas: el sistema no muestra cuántas piezas debería haber.'}
        </p>
      </div>

      {!isOperator && (
        <section
          aria-label="Operador del conteo"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
        >
          <p className="text-sm text-amber-900">
            Este conteo lo está capturando {count.operatorName ?? 'otro usuario'}. Solo un operador
            captura a la vez.
          </p>
          {canManage && (
            <Button variant="secondary" disabled={take.isPending} onClick={() => void takeNow()}>
              Tomar el conteo
            </Button>
          )}
        </section>
      )}

      {isOperator && (
        <form
          onSubmit={(event) => void submit(event)}
          aria-label="Lectura de códigos"
          className={`space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-xs transition-shadow ${flashClass}`}
        >
          <div className="space-y-1">
            <label htmlFor="scan-code" className="block text-sm font-medium text-stone-700">
              Código de la pieza
            </label>
            <input
              id="scan-code"
              ref={inputRef}
              value={code}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={100}
              placeholder="Escanee o escriba SKU, código de barras o de proveedor y pulse Enter"
              onChange={(event) => {
                setCode(event.target.value);
              }}
              onBlur={() => {
                // Si el foco se pierde sin ir a otro control, vuelve al campo de lectura.
                window.setTimeout(() => {
                  const active = document.activeElement;
                  if (!active || active === document.body) focusInput();
                }, 0);
              }}
              className="block min-h-12 w-full rounded-lg border border-stone-300 px-3 py-2 text-base shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            {/* Sin `disabled` mientras hay una lectura en curso: un botón de envío deshabilitado bloquea el Enter
                del lector y se perderían las lecturas rápidas. */}
            <Button type="submit">Registrar lectura</Button>
            <Button variant="secondary" disabled={undo.isPending} onClick={() => void undoLast()}>
              Deshacer última lectura
            </Button>
          </div>
        </form>
      )}

      <div role="status" aria-live="polite" className="min-h-14">
        {feedback && (
          <p className={`rounded-lg border p-3 text-sm font-medium ${TONES[feedback.tone]}`}>
            <span className="block text-xs font-normal text-stone-600">Última lectura</span>
            {feedback.text}
          </p>
        )}
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <dt className="text-sm text-stone-500">Piezas contadas en esta sesión</dt>
          <dd className="text-2xl font-semibold tabular-nums">{session}</dd>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <dt className="text-sm text-stone-500">Total de piezas contadas</dt>
          <dd className="text-2xl font-semibold tabular-nums">{count.piecesCounted}</dd>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <dt className="text-sm text-stone-500">
            {recounting ? 'Variantes recontadas' : 'Variantes con lecturas'}
          </dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {count.scannedVariants}
            {recounting ? ` de ${count.recountTotal}` : ''}
          </dd>
        </div>
      </dl>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section
        aria-labelledby="counted-title"
        className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
      >
        <h2 id="counted-title" className="text-lg font-semibold">
          {recounting ? 'Piezas a recontar' : 'Lo contado'}
        </h2>
        {count.items.length === 0 ? (
          <p className="text-sm text-stone-600">Todavía no hay lecturas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-cards w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th className="py-2 pr-3">Pieza</th>
                  <th className="py-2 pr-3">Código de barras</th>
                  <th className="py-2">Contadas</th>
                </tr>
              </thead>
              <tbody>
                {count.items.map((item) => (
                  <tr key={item.variantId} className="border-b border-stone-100 align-top">
                    <td className="py-3 pr-3">
                      <span className="block font-medium">{item.productName}</span>
                      <span className="block text-xs text-stone-500">
                        {item.variantLabel && item.variantLabel !== 'Única'
                          ? `${item.variantLabel} · `
                          : ''}
                        <span className="font-mono">{item.sku}</span>
                      </span>
                    </td>
                    <td data-label="Código de barras" className="py-3 pr-3 font-mono text-xs">
                      {item.barcode ?? '—'}
                    </td>
                    <td data-label="Contadas" className="py-3">
                      {isOperator ? (
                        <input
                          key={`${item.variantId}-${item.quantity}`}
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          aria-label={`Cantidad contada de ${item.sku}`}
                          defaultValue={item.quantity}
                          onBlur={(event) => {
                            if (event.target.value !== String(item.quantity)) {
                              void setItemQuantity(item.variantId, event.target.value);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              event.currentTarget.blur();
                              focusInput();
                            }
                          }}
                          className="min-h-10 w-24 rounded-lg border border-stone-300 px-2 py-1 text-sm tabular-nums"
                        />
                      ) : (
                        <span className="tabular-nums">{item.quantity}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {count.findings.length > 0 && (
        <section
          aria-labelledby="findings-title"
          className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
        >
          <h2 id="findings-title" className="text-lg font-semibold">
            Hallazgos
          </h2>
          <p className="text-sm text-stone-600">
            Códigos que no existen o son de otra categoría. No afectan el stock; el aprobador los
            regulariza después.
          </p>
          <ul className="space-y-2">
            {count.findings.map((finding) => (
              <FindingNote
                key={finding.id}
                finding={finding}
                onSave={(findingId, note) => {
                  noteFinding.mutate({ findingId, note });
                }}
              />
            ))}
          </ul>
        </section>
      )}

      {isOperator && (
        <section
          aria-label="Cierre del conteo"
          className="flex flex-wrap gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
        >
          <Button disabled={close.isPending} onClick={() => void closeNow()}>
            {close.isPending ? 'Cerrando…' : recounting ? 'Cerrar recuento' : 'Cerrar conteo'}
          </Button>
          <Button variant="danger" disabled={cancel.isPending} onClick={() => void cancelNow()}>
            Cancelar conteo
          </Button>
        </section>
      )}
    </div>
  );
}
