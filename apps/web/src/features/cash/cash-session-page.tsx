import { PERMISSIONS, formatCashSessionNumber, type CashCorrection } from '@joyeria/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { formatBs, formatDateTime } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { useHasPermission } from '../auth/use-auth.ts';
import {
  CashStatusBadge,
  CorrectedBadge,
  DifferenceText,
  FiguresList,
  MethodTotals,
} from './cash-figures.tsx';
import { CorrectionDialog } from './correction-dialog.tsx';
import { useCashCorrections, useCashSession } from './use-cash.ts';

const CORRECTION_KIND_LABELS: Record<CashCorrection['kind'], string> = {
  COUNTED_CASH: 'Efectivo contado',
  OPENING_AMOUNT: 'Fondo inicial',
  NOTE: 'Observación',
};

function CorrectionsList({ sessionId }: { sessionId: string }) {
  const corrections = useCashCorrections(sessionId);
  if (corrections.isPending) {
    return (
      <p role="status" className="text-sm">
        Cargando correcciones…
      </p>
    );
  }
  if (corrections.isError) {
    return (
      <p role="alert" className="text-sm text-red-700">
        No se pudieron cargar las correcciones.
      </p>
    );
  }
  if (corrections.data.length === 0) {
    return <p className="text-sm text-stone-600">Este cierre no tiene correcciones.</p>;
  }
  return (
    <ol className="space-y-3">
      {corrections.data.map((correction) => (
        <li key={correction.id} className="rounded-lg border border-stone-200 p-3 text-sm">
          <p className="font-medium">
            Corrección {correction.sequence} · {CORRECTION_KIND_LABELS[correction.kind]}
          </p>
          <p className="text-stone-700">
            {correction.correctedBy.name} · {formatDateTime(correction.correctedAt)}
          </p>
          {correction.kind !== 'NOTE' && (
            <p className="tabular-nums">
              De {formatBs(correction.previousValue)} a {formatBs(correction.newValue)}. Quedó:
              esperado {formatBs(correction.expectedCashAfter)}, contado{' '}
              {formatBs(correction.countedCashAfter)} ·{' '}
              <DifferenceText amount={correction.differenceAfter} />
            </p>
          )}
          <p className="mt-1 whitespace-pre-line">Motivo: {correction.reason}</p>
        </li>
      ))}
    </ol>
  );
}

/**
 * Detalle de una sesión de caja (`cash:read`): cifras ORIGINALES del cierre (inmutables) y cifras
 * VIGENTES tras las correcciones, cobros por medio y lista de correcciones. «Corregir cierre» solo
 * con `cash:correct` y solo en sesiones cerradas (no hay reapertura).
 */
export function CashSessionPage() {
  const { id = '' } = useParams();
  const detail = useCashSession(id);
  const canCorrect = useHasPermission(PERMISSIONS.CASH_CORRECT);
  const [correcting, setCorrecting] = useState(false);
  const [notice, setNotice] = useState('');
  const session = detail.data;
  useDocumentTitle(session ? `Caja ${formatCashSessionNumber(session.number)}` : 'Caja');

  return (
    <section className="space-y-6">
      <p className="text-sm">
        <Link to="/caja/historial" className="text-brand-700 underline">
          Volver al historial de cajas
        </Link>
      </p>
      {detail.isPending && (
        <p role="status" className="text-sm">
          Cargando la caja…
        </p>
      )}
      {detail.isError && (
        <p role="alert" className="text-sm text-red-700">
          No se encontró la caja o no se pudo cargar.
        </p>
      )}
      {session && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">
                Caja {formatCashSessionNumber(session.number)}
              </h1>
              <p className="mt-1 flex flex-wrap gap-2">
                <CashStatusBadge status={session.status} />
                <CorrectedBadge count={session.corrections.count} />
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canCorrect && session.status === 'CLOSED' && (
                <Button
                  onClick={() => {
                    setNotice('');
                    setCorrecting(true);
                  }}
                >
                  Corregir cierre
                </Button>
              )}
            </div>
          </div>

          {notice && (
            <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              {notice}
            </p>
          )}

          <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
            <h2 className="text-lg font-semibold">Apertura y cierre</h2>
            <FiguresList
              label="Apertura y cierre"
              rows={[
                {
                  label: 'Abierta',
                  value: `${formatDateTime(session.openedAt)} · ${session.openedBy.name}`,
                },
                {
                  label: 'Cerrada',
                  value: session.closedAt
                    ? `${formatDateTime(session.closedAt)} · ${session.closedBy?.name ?? '—'}`
                    : 'Sigue abierta',
                },
              ]}
            />
            {session.status === 'OPEN' ? (
              <FiguresList
                label="Cifras en vivo"
                rows={[
                  { label: 'Fondo inicial', value: formatBs(session.openingAmount) },
                  { label: 'Efectivo esperado ahora', value: formatBs(session.liveExpectedCash) },
                ]}
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Cierre original</h3>
                  <FiguresList
                    label="Cierre original"
                    rows={[
                      { label: 'Fondo inicial', value: formatBs(session.openingAmount) },
                      { label: 'Cobros en efectivo', value: formatBs(session.cashSalesTotal) },
                      { label: 'Efectivo esperado', value: formatBs(session.expectedCash) },
                      { label: 'Efectivo contado', value: formatBs(session.countedCash) },
                      {
                        label: 'Diferencia',
                        value: <DifferenceText amount={session.difference} />,
                      },
                    ]}
                  />
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Cifras vigentes</h3>
                  <FiguresList
                    label="Cifras vigentes"
                    rows={[
                      { label: 'Fondo inicial', value: formatBs(session.current.openingAmount) },
                      { label: 'Efectivo esperado', value: formatBs(session.current.expectedCash) },
                      { label: 'Efectivo contado', value: formatBs(session.current.countedCash) },
                      {
                        label: 'Diferencia',
                        value: <DifferenceText amount={session.current.difference} />,
                      },
                    ]}
                  />
                </div>
              </div>
            )}
            {session.notes && (
              <p className="text-sm whitespace-pre-line">
                <span className="font-medium">Observación del cierre:</span> {session.notes}
              </p>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
            <h2 className="text-lg font-semibold">Cobros por medio de pago</h2>
            <MethodTotals session={session} />
          </div>

          {session.status === 'CLOSED' && (
            <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
              <h2 className="text-lg font-semibold">Correcciones</h2>
              <CorrectionsList sessionId={session.id} />
            </div>
          )}

          {correcting && (
            <CorrectionDialog
              session={session}
              onClose={() => {
                setCorrecting(false);
              }}
              onDone={(message) => {
                setCorrecting(false);
                setNotice(message);
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
