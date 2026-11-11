import { PERMISSIONS, formatCashSessionNumber } from '@joyeria/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { ButtonLink } from '../../components/ui/button-link.tsx';
import { formatBs, formatDateTime } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { useHasPermission } from '../auth/use-auth.ts';
import { FiguresList, MethodTotals } from './cash-figures.tsx';
import { OpenCashDialog } from './open-cash-dialog.tsx';
import { useCashStatus, useCurrentCashSession } from './use-cash.ts';

/**
 * Estado de la caja única (`/caja`). Cerrada: aviso y «Abrir caja» (solo `cash:open`). Abierta:
 * quién y desde cuándo; con `cash:read`, fondo, cobros por medio y efectivo esperado en vivo; con
 * `cash:close`, acceso al cierre. Quien solo vende ve el estado sin cifras.
 */
export function CashPage() {
  useDocumentTitle('Caja');
  const canRead = useHasPermission(PERMISSIONS.CASH_READ);
  const canOpen = useHasPermission(PERMISSIONS.CASH_OPEN);
  const canClose = useHasPermission(PERMISSIONS.CASH_CLOSE);
  const canSell = useHasPermission(PERMISSIONS.SALES_CREATE);
  const status = useCashStatus();
  const current = useCurrentCashSession(canRead && status.data?.open === true);
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState('');

  const session = status.data?.session ?? null;
  const live = current.data ?? null;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Caja</h1>
          <p className="text-sm text-stone-600">
            Caja única de la tienda. No se puede vender sin una caja abierta.
          </p>
        </div>
        {canRead && (
          <ButtonLink to="/caja/historial" variant="secondary">
            Historial de cajas
          </ButtonLink>
        )}
      </div>

      {notice && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      {status.isPending && (
        <p role="status" className="text-sm">
          Consultando la caja…
        </p>
      )}
      {status.isError && (
        <p role="alert" className="text-sm text-red-700">
          No se pudo consultar la caja.{' '}
          <button className="underline" onClick={() => void status.refetch()}>
            Reintentar
          </button>
        </p>
      )}

      {status.isSuccess && !session && (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-lg font-semibold text-amber-950">La caja está cerrada</h2>
          <p className="text-sm text-amber-950">
            {canOpen
              ? 'Ábrala con el fondo inicial para poder vender.'
              : 'Pida a un Administrador o al Responsable de inventario que abra la caja para poder vender.'}
          </p>
          {canOpen && (
            <Button
              onClick={() => {
                setNotice('');
                setOpening(true);
              }}
            >
              Abrir caja
            </Button>
          )}
        </div>
      )}

      {status.isSuccess && session && (
        <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                Caja abierta · {formatCashSessionNumber(session.number)}
              </h2>
              <p className="text-sm text-stone-700">
                Abierta por {session.openedByName} desde {formatDateTime(session.openedAt)}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canSell && (
                <ButtonLink to="/ventas/nueva" variant="secondary">
                  Ir al punto de venta
                </ButtonLink>
              )}
              {canClose && canRead && <ButtonLink to="/caja/cierre">Cerrar caja</ButtonLink>}
            </div>
          </div>

          {canRead && current.isPending && (
            <p role="status" className="text-sm">
              Cargando cifras…
            </p>
          )}
          {canRead && current.isError && (
            <p role="alert" className="text-sm text-red-700">
              No se pudieron cargar las cifras de la caja.
            </p>
          )}
          {canRead && live && (
            <>
              <FiguresList
                label="Cifras de la caja"
                rows={[
                  { label: 'Fondo inicial', value: formatBs(live.openingAmount) },
                  { label: 'Efectivo esperado ahora', value: formatBs(live.liveExpectedCash) },
                ]}
              />
              <MethodTotals session={live} />
            </>
          )}
        </div>
      )}

      {opening && (
        <OpenCashDialog
          onClose={() => {
            setOpening(false);
          }}
          onOpened={(opened) => {
            setOpening(false);
            setNotice(
              `Caja ${formatCashSessionNumber(opened.number)} abierta con un fondo de ${formatBs(opened.openingAmount)}.`,
            );
          }}
        />
      )}
    </section>
  );
}
