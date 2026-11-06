import {
  PRICE_CHANGE_ORIGIN_LABELS,
  PRICE_CHANGE_STATUS_LABELS,
  type PriceChange,
  type PriceChangeStatus,
} from '@joyeria/shared';
import { formatBsPrecise, formatDateTime } from '../../lib/format.ts';
import { ProfitDisplay } from './profit-display.tsx';
import { PieceImage } from '../catalog/photos/piece-image.tsx';

const STATUS_STYLES: Record<PriceChangeStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-800',
  APPROVED: 'bg-emerald-50 text-emerald-800',
  REJECTED: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-stone-100 text-stone-600',
};

export function PriceStatusBadge({ status }: { status: PriceChangeStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {PRICE_CHANGE_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Historial de cambios de precio (D5): precio anterior y nuevo, estado, origen, quién solicitó y
 * quién decidió, comentario y, solo con `costs:read`, el costo total del momento y la ganancia.
 */
export function ChangesTable({
  rows,
  showProduct,
}: {
  rows: PriceChange[];
  /** En el historial global se muestra el producto; en el de una variante no hace falta. */
  showProduct: boolean;
}) {
  const showCosts = rows.some((row) => row.costSnapshot !== null);
  return (
    <div className="overflow-x-auto">
      <table className="table-cards w-full text-left text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-stone-600">
            <th className="py-2 pr-3">{showProduct ? 'Producto' : 'Fecha'}</th>
            {showProduct && <th className="py-2 pr-3">Fecha</th>}
            <th className="py-2 pr-3">Precio anterior</th>
            <th className="py-2 pr-3">Precio nuevo</th>
            {showCosts && <th className="py-2 pr-3">Costo total del momento</th>}
            {showCosts && <th className="py-2 pr-3">Ganancia del precio nuevo</th>}
            <th className="py-2 pr-3">Estado</th>
            <th className="py-2 pr-3">Origen</th>
            <th className="py-2 pr-3">Solicitó</th>
            <th className="py-2 pr-3">Decidió</th>
            <th className="py-2">Comentario</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-stone-100 align-top">
              <td className="py-3 pr-3">
                {showProduct ? (
                  <>
                    <PieceImage variantId={row.variantId} className="float-left mr-3 size-12" />
                    <span className="block font-medium">{row.productName}</span>
                    <span className="block text-xs font-normal text-stone-500">
                      {row.variantLabel && row.variantLabel !== 'Única'
                        ? `${row.variantLabel} · `
                        : ''}
                      <span className="font-mono">{row.sku}</span>
                    </span>
                  </>
                ) : (
                  formatDateTime(row.decidedAt ?? row.createdAt)
                )}
              </td>
              {showProduct && (
                <td data-label="Fecha" className="py-3 pr-3">
                  {formatDateTime(row.decidedAt ?? row.createdAt)}
                </td>
              )}
              <td data-label="Precio anterior" className="py-3 pr-3 tabular-nums">
                {formatBsPrecise(row.previousPrice)}
              </td>
              <td data-label="Precio nuevo" className="py-3 pr-3 font-medium tabular-nums">
                {formatBsPrecise(row.newPrice)}
              </td>
              {showCosts && (
                <td data-label="Costo total del momento" className="py-3 pr-3 tabular-nums">
                  {formatBsPrecise(row.costSnapshot)}
                </td>
              )}
              {showCosts && (
                <td data-label="Ganancia del precio nuevo" className="py-3 pr-3">
                  <ProfitDisplay
                    price={row.newPrice}
                    totalCost={row.costSnapshot}
                    label="del precio nuevo"
                  />
                </td>
              )}
              <td data-label="Estado" className="py-3 pr-3">
                <PriceStatusBadge status={row.status} />
              </td>
              <td data-label="Origen" className="py-3 pr-3">
                {PRICE_CHANGE_ORIGIN_LABELS[row.origin]}
              </td>
              <td data-label="Solicitó" className="py-3 pr-3">
                {row.requestedBy.name}
              </td>
              <td data-label="Decidió" className="py-3 pr-3">
                {row.decidedBy?.name ?? '—'}
              </td>
              <td data-label="Comentario" className="py-3">
                {row.decisionComment ?? row.reason ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
