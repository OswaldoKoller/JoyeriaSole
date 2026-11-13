import {
  RECEIPT_COPY_LEGEND,
  RECEIPT_NOT_FISCAL_LEGEND,
  RECEIPT_TITLE,
  formatSaleNumber,
  type ReceiptFormat,
  type SaleReceipt,
} from '@joyeria/shared';
import { createPortal } from 'react-dom';
import { formatBs, formatDateTime } from '../../lib/format.ts';
import { variantText } from './cart.ts';
import { isRoll, receiptContentWidth, receiptPrintCss } from './receipt-settings.ts';

/**
 * Comprobante interno (DEC-V12): el MISMO componente sirve para la vista previa y para el papel.
 * Proyección de filas inmutables de la venta: sin costos y sin referencias de pago (D-09). Lleva
 * siempre «Comprobante interno» y «No válido como factura fiscal»; desde la segunda impresión
 * registrada, la marca «COPIA» (C4, D-19).
 */
export function Receipt({
  receipt,
  format,
  isCopy,
}: {
  receipt: SaleReceipt;
  format: ReceiptFormat;
  isCopy: boolean;
}) {
  const roll = isRoll(format);
  const text = roll ? 'text-[11px] leading-snug' : 'text-sm';
  const { business } = receipt;
  return (
    <article
      className={`receipt bg-white font-sans text-black tabular-nums ${text}`}
      style={{ width: receiptContentWidth(format) }}
      aria-label={`Comprobante de la venta ${formatSaleNumber(receipt.number)}`}
      data-format={format}
    >
      <header className="text-center">
        <p className={`font-bold ${roll ? 'text-sm' : 'text-lg'}`}>{business.tradeName}</p>
        {business.address && <p>{business.address}</p>}
        {business.phone && <p>Tel.: {business.phone}</p>}
        {business.taxId && <p>NIT: {business.taxId}</p>}
        <p className={`mt-2 font-semibold uppercase ${roll ? '' : 'text-base'}`}>{RECEIPT_TITLE}</p>
        {isCopy && (
          <p
            className={`mx-auto mt-1 w-fit border-2 border-black px-3 font-bold tracking-widest ${roll ? 'text-base' : 'text-xl'}`}
          >
            {RECEIPT_COPY_LEGEND}
          </p>
        )}
      </header>

      <dl className="mt-2 space-y-0.5">
        <div className="flex justify-between gap-2">
          <dt>N.º</dt>
          <dd className="font-semibold">{formatSaleNumber(receipt.number)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Fecha</dt>
          <dd>{formatDateTime(receipt.soldAt)}</dd>
        </div>
        {receipt.seller && (
          <div className="flex justify-between gap-2">
            <dt>Atendió</dt>
            <dd>{receipt.seller.name}</dd>
          </div>
        )}
      </dl>

      <table className="mt-2 w-full border-collapse text-left">
        <caption className="sr-only">Piezas vendidas</caption>
        <thead>
          <tr className="border-y border-black">
            <th scope="col" className="py-1 pr-1 font-semibold">
              Cant.
            </th>
            <th scope="col" className="py-1 pr-1 font-semibold">
              Descripción
            </th>
            {!roll && (
              <th scope="col" className="py-1 pr-1 text-right font-semibold">
                P. unit.
              </th>
            )}
            <th scope="col" className="py-1 text-right font-semibold">
              Importe
            </th>
          </tr>
        </thead>
        <tbody>
          {receipt.items.map((item) => {
            const label = variantText(item.variantLabel);
            return (
              <tr key={item.sku} className="border-b border-dashed border-black/40 align-top">
                <td className="py-1 pr-1">{item.quantity}</td>
                <td className="py-1 pr-1">
                  {item.productName}
                  {label ? ` · ${label}` : ''}
                  <span className="block">{item.sku}</span>
                  {roll && item.quantity > 1 && (
                    <span className="block">
                      {item.quantity} × {formatBs(item.unitPrice)}
                    </span>
                  )}
                </td>
                {!roll && <td className="py-1 pr-1 text-right">{formatBs(item.unitPrice)}</td>}
                <td className="py-1 text-right">{formatBs(item.lineTotal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className={`mt-2 flex justify-between font-bold ${roll ? 'text-sm' : 'text-base'}`}>
        <span>Total</span>
        <span>{formatBs(receipt.total)}</span>
      </p>

      <dl className="mt-2 space-y-0.5 border-t border-black pt-1">
        {receipt.payments.map((payment) => (
          <div key={payment.methodName}>
            <div className="flex justify-between gap-2">
              <dt>{payment.methodName}</dt>
              <dd>{formatBs(payment.amount)}</dd>
            </div>
            {payment.tendered !== null && (
              <div className="flex justify-between gap-2">
                <dt>Recibido</dt>
                <dd>{formatBs(payment.tendered)}</dd>
              </div>
            )}
            {payment.changeGiven !== null && payment.changeGiven !== '0.00' && (
              <div className="flex justify-between gap-2">
                <dt>Vuelto</dt>
                <dd>{formatBs(payment.changeGiven)}</dd>
              </div>
            )}
          </div>
        ))}
      </dl>

      <footer className="mt-3 border-t border-black pt-1 text-center">
        <p className="font-semibold">{RECEIPT_NOT_FISCAL_LEGEND}</p>
        <p>Moneda: bolivianos (Bs)</p>
      </footer>
    </article>
  );
}

/**
 * Contenido que va a la impresora: un portal hijo de `<body>` (fuera de `#root`) con su propio
 * `<style>`; en pantalla está oculto y en `@media print` es lo único visible (mismo patrón que
 * las etiquetas de `features/catalog`).
 */
export function ReceiptPrintArea({
  receipt,
  format,
  isCopy,
}: {
  receipt: SaleReceipt;
  format: ReceiptFormat;
  isCopy: boolean;
}) {
  return createPortal(
    <div id="print-receipt" aria-hidden="true">
      <style>{receiptPrintCss(format)}</style>
      <Receipt receipt={receipt} format={format} isCopy={isCopy} />
    </div>,
    document.body,
  );
}
