import type { CashSessionDetail } from '@joyeria/shared';
import type { ReactNode } from 'react';
import { formatBs, formatInt } from '../../lib/format.ts';
import { amountToCents } from '../../lib/money-input.ts';
import { differenceLabelOf } from './cash-math.ts';

/** Estado de la sesión con texto (no solo color). */
export function CashStatusBadge({ status }: { status: 'OPEN' | 'CLOSED' }) {
  return status === 'OPEN' ? (
    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
      Abierta
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
      Cerrada
    </span>
  );
}

/** Marca de una sesión con correcciones posteriores al cierre. */
export function CorrectedBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
      Corregida ({count})
    </span>
  );
}

/** Diferencia con su texto «Sobrante» o «Faltante» además del importe con signo. */
export function DifferenceText({ amount }: { amount: string | null }) {
  if (amount === null) return <span>—</span>;
  const cents = amountToCents(amount);
  const tone = cents === 0n ? 'text-stone-800' : cents > 0n ? 'text-sky-800' : 'text-red-700';
  return <span className={`font-medium ${tone}`}>{differenceLabelOf(amount)}</span>;
}

/** Totales cobrados por medio de pago. QR y transferencia se informan aparte (B8). */
export function MethodTotals({ session }: { session: CashSessionDetail }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Cobros por medio de pago</caption>
        <thead>
          <tr className="border-b border-stone-200 text-stone-600">
            <th scope="col" className="py-2 pr-4 font-medium">
              Medio
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Cobros
            </th>
            <th scope="col" className="py-2 font-medium">
              Importe
            </th>
          </tr>
        </thead>
        <tbody>
          {session.totalsByMethod.map((method) => (
            <tr key={method.methodCode} className="border-b border-stone-100">
              <th scope="row" className="py-2 pr-4 font-normal">
                {method.methodName}
                {!method.isCash && (
                  <span className="block text-xs text-stone-600">
                    Informado aparte: no forma parte del efectivo
                  </span>
                )}
              </th>
              <td className="py-2 pr-4 tabular-nums">{formatInt(method.paymentsCount)}</td>
              <td className="py-2 tabular-nums">{formatBs(method.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-sm text-stone-700">
        Ventas: {formatInt(session.salesCount)} por {formatBs(session.salesTotal)}. Ventas con más
        de un medio de pago: {formatInt(session.mixedSales.count)} por{' '}
        {formatBs(session.mixedSales.amount)}.
      </p>
      <p className="mt-1 text-sm text-stone-700">
        Cambios de pieza: {formatInt(session.exchangesCount)} con diferencia cobrada de{' '}
        {formatBs(session.exchangesTotal)}. La diferencia cobrada en efectivo ya está incluida en el
        efectivo esperado.
      </p>
    </div>
  );
}

type Row = { label: string; value: ReactNode };

/** Lista de cifras etiquetadas (fondo, esperado, contado, diferencia). */
export function FiguresList({ rows, label }: { rows: Row[]; label: string }) {
  return (
    <dl aria-label={label} className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-3 border-b border-stone-100 py-1">
          <dt className="text-stone-600">{row.label}</dt>
          <dd className="text-right font-medium tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
