import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { formatBs } from '../../lib/format.ts';
import { centsToAmount } from '../../lib/money-input.ts';
import { lineTotal, type CartLine } from './cart.ts';
import { PieceCell } from './cart-table.tsx';
import type { PaymentSummary } from './payments.ts';

/** Aviso obligatorio de la revisión previa (DEC-V07, plan 11 §5.4 paso 4). */
export const NO_REVERSAL_WARNING =
  'Una venta confirmada no se puede anular ni modificar. Revise las piezas y los importes antes de confirmar.';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  QR: 'QR',
  BANK_TRANSFER: 'Transferencia',
};

/** Tabla de solo lectura de lo que se va a vender (también se usa en «resultado incierto»). */
export function ReviewLines({ lines }: { lines: CartLine[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table-cards w-full text-left text-sm">
        <caption className="sr-only">Piezas a vender</caption>
        <thead>
          <tr className="border-b border-stone-200 text-stone-600">
            <th scope="col" className="py-2 pr-3 font-medium">
              Pieza
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Cantidad
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Precio
            </th>
            <th scope="col" className="py-2 font-medium">
              Subtotal
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.variantId} className="border-b border-stone-100 align-top">
              <td className="py-3 pr-3">
                <PieceCell line={line} />
              </td>
              <td data-label="Cantidad" className="py-3 pr-3 tabular-nums">
                {line.quantity}
              </td>
              <td data-label="Precio" className="py-3 pr-3 tabular-nums">
                {formatBs(line.unitPrice)}
              </td>
              <td data-label="Subtotal" className="py-3 font-medium tabular-nums">
                {formatBs(centsToAmount(lineTotal(line)))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Desglose de pagos: aplicado por medio, efectivo recibido y vuelto. */
export function PaymentBreakdown({ summary }: { summary: PaymentSummary }) {
  return (
    <dl aria-label="Pagos" className="space-y-1 text-sm">
      {summary.payments.map((payment) => (
        <div key={payment.methodCode} className="flex justify-between gap-3">
          <dt>{METHOD_LABELS[payment.methodCode] ?? payment.methodCode}</dt>
          <dd className="tabular-nums">{formatBs(payment.amount)}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-3 border-t border-stone-200 pt-1 font-medium">
        <dt>Suma de pagos</dt>
        <dd className="tabular-nums">
          {formatBs(
            centsToAmount(summary.cashAppliedCents + summary.qrCents + summary.transferCents),
          )}
        </dd>
      </div>
      {summary.tenderedCents > 0n && (
        <div className="flex justify-between gap-3">
          <dt>Efectivo recibido</dt>
          <dd className="tabular-nums">{formatBs(centsToAmount(summary.tenderedCents))}</dd>
        </div>
      )}
      <div className="flex justify-between gap-3 font-semibold">
        <dt>Vuelto</dt>
        <dd className="tabular-nums">{formatBs(centsToAmount(summary.changeCents))}</dd>
      </div>
    </dl>
  );
}

/**
 * Pantalla de revisión previa, OBLIGATORIA antes de confirmar (DEC-V07, R-07): líneas con foto,
 * precios definitivos, total, desglose de pagos, recibido y vuelto, y el aviso de que una venta
 * confirmada no se puede anular ni modificar. Es de solo lectura: para cambiar algo se vuelve al
 * carrito.
 */
export function ReviewStep({
  lines,
  summary,
  pending,
  canConfirm,
  alert,
  onBack,
  onConfirm,
}: {
  lines: CartLine[];
  summary: PaymentSummary;
  pending: boolean;
  /** Falso si no hay caja abierta: no se puede confirmar. */
  canConfirm: boolean;
  alert?: ReactNode;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section
      aria-labelledby="review-heading"
      className="space-y-5 rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
    >
      <h2 id="review-heading" ref={headingRef} tabIndex={-1} className="text-lg font-semibold">
        Revise la venta antes de confirmar
      </h2>
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-950">
        {NO_REVERSAL_WARNING}
      </p>
      <ReviewLines lines={lines} />
      <p className="flex justify-between text-lg font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatBs(centsToAmount(summary.totalCents))}</span>
      </p>
      <PaymentBreakdown summary={summary} />
      {alert}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onBack} disabled={pending}>
          Volver a corregir
        </Button>
        <Button onClick={onConfirm} disabled={pending || !canConfirm}>
          {pending ? 'Registrando venta…' : 'Confirmar venta'}
        </Button>
      </div>
    </section>
  );
}
