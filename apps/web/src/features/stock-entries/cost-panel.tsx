import type { StockEntryCurrency } from '@joyeria/shared';
import type { Preview } from './lines.ts';
import { PieceImage } from '../catalog/photos/piece-image.tsx';

const bob = new Intl.NumberFormat('es-BO', {
  style: 'currency',
  currency: 'BOB',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const usd = new Intl.NumberFormat('es-BO', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const orDash = (value: string | null, format: Intl.NumberFormat) =>
  value === null ? '—' : format.format(Number(value));

interface Props {
  preview: Preview | null;
  currency: StockEntryCurrency;
  exchangeRate: string | null;
  /** Confirmado: valores guardados. Borrador: vista previa con el algoritmo de la confirmación. */
  confirmed: boolean;
}

/**
 * Panel de costos (solo con `costs:read`): por ítem, precio de compra en moneda original y en Bs,
 * subtotal, costos adicionales asignados, costo total y costo unitario total; y los totales del
 * ingreso. En móvil cada ítem es una tarjeta.
 */
export function CostPanel({ preview, currency, exchangeRate, confirmed }: Props) {
  const isUsd = currency === 'USD';
  return (
    <section
      aria-labelledby="cost-panel-title"
      className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
    >
      <div>
        <h2 id="cost-panel-title" className="text-lg font-semibold">
          Panel de costos
        </h2>
        <p className="text-xs text-stone-500">
          {confirmed
            ? 'Costos guardados al confirmar.'
            : 'Vista previa con el mismo cálculo de la confirmación.'}{' '}
          {isUsd && exchangeRate ? `Tipo de cambio: ${exchangeRate} Bs por USD. ` : ''}
          Todo en bolivianos salvo el precio original.
        </p>
      </div>

      {preview?.error && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {preview.error}
        </p>
      )}
      {preview?.zeroValue && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Hay costos adicionales pero el valor de compra es cero: indique el precio de compra de al
          menos un ítem para repartirlos.
        </p>
      )}

      {preview && preview.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table-cards w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-600">
                <th className="py-2 pr-3">Ítem</th>
                <th className="py-2 pr-3">Cant.</th>
                {isUsd && <th className="py-2 pr-3">Precio de compra (USD)</th>}
                <th className="py-2 pr-3">Precio de compra (Bs)</th>
                <th className="py-2 pr-3">Subtotal de compra (Bs)</th>
                <th className="py-2 pr-3">Costos adicionales asignados</th>
                <th className="py-2 pr-3">Costo total del ítem</th>
                <th className="py-2">Costo unitario total</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr key={row.variantId} className="border-b border-stone-100 align-top">
                  <td className="py-3 pr-3">
                    <PieceImage variantId={row.variantId} className="float-left mr-3 size-12" />
                    <span className="block font-medium">{row.productName}</span>
                    <span className="block text-xs font-normal text-stone-500">
                      {row.variantLabel && row.variantLabel !== 'Única'
                        ? `${row.variantLabel} · `
                        : ''}
                      <span className="font-mono">{row.sku}</span>
                    </span>
                  </td>
                  <td data-label="Cantidad" className="py-3 pr-3">
                    {row.receivedQty}
                  </td>
                  {isUsd && (
                    <td data-label="Precio de compra (USD)" className="py-3 pr-3 tabular-nums">
                      {usd.format(Number(row.unitPrice))}
                    </td>
                  )}
                  <td data-label="Precio de compra (Bs)" className="py-3 pr-3 tabular-nums">
                    {bob.format(Number(row.unitCostBob))}
                  </td>
                  <td data-label="Subtotal de compra (Bs)" className="py-3 pr-3 tabular-nums">
                    {bob.format(Number(row.subtotalBob))}
                  </td>
                  <td data-label="Costos adicionales asignados" className="py-3 pr-3 tabular-nums">
                    {orDash(row.extraAllocated, bob)}
                  </td>
                  <td
                    data-label="Costo total del ítem"
                    className="py-3 pr-3 font-medium tabular-nums"
                  >
                    {orDash(row.totalCost, bob)}
                  </td>
                  <td data-label="Costo unitario total" className="py-3 font-medium tabular-nums">
                    {orDash(row.unitTotalCost, bob)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview && !preview.error && (
        <dl
          aria-label="Totales del ingreso"
          className="ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm"
        >
          {isUsd && (
            <>
              <dt className="text-stone-600">Valor de compra (USD)</dt>
              <dd className="text-right tabular-nums">
                {usd.format(Number(preview.totals.purchaseOriginal))}
              </dd>
            </>
          )}
          <dt className="text-stone-600">Valor de compra (Bs)</dt>
          <dd className="text-right tabular-nums">
            {bob.format(Number(preview.totals.purchaseBob))}
          </dd>
          <dt className="text-stone-600">Costos adicionales</dt>
          <dd className="text-right tabular-nums">{bob.format(Number(preview.totals.extras))}</dd>
          <dt className="border-t border-stone-200 pt-1 font-semibold">Total del ingreso</dt>
          <dd className="border-t border-stone-200 pt-1 text-right font-semibold tabular-nums">
            {bob.format(Number(preview.totals.grand))}
          </dd>
        </dl>
      )}
    </section>
  );
}
