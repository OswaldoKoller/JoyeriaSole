import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { useCostHistory } from './use-stock-entries.ts';
import { ingressLabel } from './lines.ts';

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
const date = new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short' });

/**
 * Historial de costos de una variante (C10): compras confirmadas con su precio original, tipo de
 * cambio, costos adicionales y costo total unitario. Solo se muestra con `costs:read`.
 */
export function CostHistory({ variantId, sku }: { variantId: string; sku: string }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const history = useCostHistory(variantId, page, open);
  const rows = history.data?.data ?? [];
  const total = history.data?.meta.total ?? 0;
  const regionId = `cost-history-${variantId}`;

  return (
    <div className="mt-3">
      <Button
        variant="secondary"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {open ? 'Ocultar' : 'Ver'} historial de costos de {sku}
      </Button>
      {open && (
        <section
          id={regionId}
          aria-label={`Historial de costos de ${sku}`}
          className="mt-3 space-y-3"
        >
          <h3 className="text-sm font-semibold">Historial de costos</h3>
          {history.isPending && (
            <p role="status" className="text-sm">
              Cargando historial…
            </p>
          )}
          {history.isError && (
            <p role="alert" className="text-sm text-red-700">
              No se pudo cargar el historial de costos.
            </p>
          )}
          {history.isSuccess && rows.length === 0 && (
            <p className="text-sm text-stone-600">
              Esta variante aún no tiene compras confirmadas.
            </p>
          )}
          {history.isSuccess && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="table-cards w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-600">
                    <th className="py-2 pr-3">Ingreso</th>
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Proveedor</th>
                    <th className="py-2 pr-3">Cant.</th>
                    <th className="py-2 pr-3">Precio de compra</th>
                    <th className="py-2 pr-3">Precio de compra (Bs)</th>
                    <th className="py-2 pr-3">Costos adicionales por pieza</th>
                    <th className="py-2">Costo unitario total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.entryId} className="border-b border-stone-100 align-top">
                      <td className="py-3 pr-3">
                        <Link
                          to={`/ingresos/${row.entryId}`}
                          className="inline-flex min-h-10 items-center text-brand-700 underline"
                        >
                          {ingressLabel(row.entryNumber)}
                        </Link>
                      </td>
                      <td data-label="Fecha" className="py-3 pr-3">
                        {date.format(new Date(row.confirmedAt))}
                      </td>
                      <td data-label="Proveedor" className="py-3 pr-3">
                        {row.supplierName}
                      </td>
                      <td data-label="Cantidad" className="py-3 pr-3">
                        {row.quantity}
                      </td>
                      <td data-label="Precio de compra" className="py-3 pr-3 tabular-nums">
                        {row.currency === 'USD'
                          ? `${usd.format(Number(row.unitPrice))} × ${row.exchangeRate ?? ''}`
                          : bob.format(Number(row.unitPrice))}
                      </td>
                      <td data-label="Precio de compra (Bs)" className="py-3 pr-3 tabular-nums">
                        {bob.format(Number(row.unitCostBob))}
                      </td>
                      <td
                        data-label="Costos adicionales por pieza"
                        className="py-3 pr-3 tabular-nums"
                      >
                        {row.unitExtraCost === null ? '—' : bob.format(Number(row.unitExtraCost))}
                      </td>
                      <td
                        data-label="Costo unitario total"
                        className="py-3 font-medium tabular-nums"
                      >
                        {row.unitTotalCost === null ? '—' : bob.format(Number(row.unitTotalCost))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > 10 && (
            <div className="flex items-center gap-3 text-sm">
              <Button
                variant="secondary"
                disabled={page === 1}
                onClick={() => {
                  setPage(page - 1);
                }}
              >
                Anterior
              </Button>
              <span>
                Página {page} · {total} compras
              </span>
              <Button
                variant="secondary"
                disabled={page * 10 >= total}
                onClick={() => {
                  setPage(page + 1);
                }}
              >
                Siguiente
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
