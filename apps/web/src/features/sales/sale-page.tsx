import { PERMISSIONS, formatCashSessionNumber, formatSaleNumber } from '@joyeria/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { ButtonLink } from '../../components/ui/button-link.tsx';
import { formatBs, formatDateTime } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { useHasPermission } from '../auth/use-auth.ts';
import { PieceCell } from './cart-table.tsx';
import { ReportIncidentDialog } from './report-incident-dialog.tsx';
import { reportedMessage } from './sale-labels.ts';
import { useSale } from './use-sales.ts';

/**
 * Detalle de SOLO LECTURA de una venta (`/ventas/:id`). Una venta confirmada no se anula, no se
 * borra y no se modifica (DEC-V07): las únicas acciones son ver el comprobante y reportar una
 * incidencia (que no tiene efecto sobre stock ni importes).
 */
export function SalePage() {
  const { id = '' } = useParams();
  const detail = useSale(id);
  const canReport = useHasPermission(PERMISSIONS.SALES_INCIDENTS_REPORT);
  const canReadCash = useHasPermission(PERMISSIONS.CASH_READ);
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState('');
  const sale = detail.data;
  const label = sale ? formatSaleNumber(sale.number) : '';
  useDocumentTitle(sale ? `Venta ${label}` : 'Venta');

  return (
    <section className="space-y-6">
      <p className="text-sm">
        <Link to="/ventas" className="text-brand-700 underline">
          Volver al historial de ventas
        </Link>
      </p>
      {detail.isPending && (
        <p role="status" className="text-sm">
          Cargando la venta…
        </p>
      )}
      {detail.isError && (
        <p role="alert" className="text-sm text-red-700">
          No se encontró la venta o no tiene permiso para verla.
        </p>
      )}
      {sale && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Venta {label}</h1>
              <p className="text-sm text-stone-700">
                {formatDateTime(sale.soldAt)} · {sale.sellerName} · Caja{' '}
                {canReadCash ? (
                  <Link to={`/caja/sesiones/${sale.cashSessionId}`} className="underline">
                    {formatCashSessionNumber(sale.cashSessionNumber)}
                  </Link>
                ) : (
                  formatCashSessionNumber(sale.cashSessionNumber)
                )}
              </p>
              <p className="mt-1 text-sm text-stone-600">
                Venta confirmada: no se puede anular ni modificar.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ButtonLink to={`/ventas/${sale.id}/comprobante`}>Ver comprobante</ButtonLink>
              {canReport && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setNotice('');
                    setReporting(true);
                  }}
                >
                  Reportar incidencia
                </Button>
              )}
            </div>
          </div>

          {notice && (
            <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              {notice}
            </p>
          )}

          <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
            <h2 className="text-lg font-semibold">Piezas</h2>
            <div className="overflow-x-auto">
              <table className="table-cards w-full text-left text-sm">
                <caption className="sr-only">Piezas vendidas</caption>
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
                  {sale.items.map((item) => (
                    <tr key={item.variantId} className="border-b border-stone-100 align-top">
                      <td className="py-3 pr-3">
                        <PieceCell
                          line={{
                            variantId: item.variantId,
                            sku: item.sku,
                            productName: item.productName,
                            variantLabel: item.variantLabel,
                            unitPrice: item.unitPrice,
                            available: null,
                            quantity: item.quantity,
                          }}
                        />
                      </td>
                      <td data-label="Cantidad" className="py-3 pr-3 tabular-nums">
                        {item.quantity}
                      </td>
                      <td data-label="Precio" className="py-3 pr-3 tabular-nums">
                        {formatBs(item.unitPrice)}
                      </td>
                      <td data-label="Subtotal" className="py-3 font-medium tabular-nums">
                        {formatBs(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="flex justify-between text-lg font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatBs(sale.total)}</span>
            </p>
          </div>

          <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
            <h2 className="text-lg font-semibold">Pagos</h2>
            <dl className="space-y-2 text-sm">
              {sale.payments.map((payment) => (
                <div key={payment.methodCode} className="border-b border-stone-100 pb-2">
                  <div className="flex justify-between gap-3 font-medium">
                    <dt>{payment.methodName}</dt>
                    <dd className="tabular-nums">{formatBs(payment.amount)}</dd>
                  </div>
                  {payment.tendered !== null && (
                    <p className="text-stone-700">
                      Recibido {formatBs(payment.tendered)} · vuelto {formatBs(payment.changeGiven)}
                    </p>
                  )}
                  {payment.reference && (
                    <p className="text-stone-700">Referencia: {payment.reference}</p>
                  )}
                </div>
              ))}
            </dl>
            <p className="text-sm text-stone-700">
              Comprobante impreso {sale.receiptPrints} {sale.receiptPrints === 1 ? 'vez' : 'veces'}.
            </p>
          </div>

          {reporting && (
            <ReportIncidentDialog
              saleNumber={sale.number}
              onClose={() => {
                setReporting(false);
              }}
              onReported={(incident) => {
                setReporting(false);
                setNotice(reportedMessage(incident));
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
