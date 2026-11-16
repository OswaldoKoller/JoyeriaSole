import {
  EXCHANGE_RECEIPT_TITLE,
  RECEIPT_NOT_FISCAL_LEGEND,
  formatExchangeNumber,
  formatSaleNumber,
  type ReceiptFormat,
  type SaleExchangeReceipt,
} from '@joyeria/shared';
import { createPortal } from 'react-dom';
import { formatBs, formatDateTime } from '../../lib/format.ts';
import { variantText } from '../sales/cart.ts';
import { ReceiptFooterNote, ReceiptLogo } from '../sales/receipt.tsx';
import { isRoll, receiptContentWidth, receiptPrintCss } from '../sales/receipt-settings.ts';

/**
 * Comprobante de un cambio de pieza: el MISMO componente sirve para la vista previa y para el
 * papel. Muestra lo que el cliente devolvió, lo que se lleva y la diferencia cobrada. No es una
 * factura ni una devolución. Sin costos y sin referencias de pago.
 */
export function ExchangeReceipt({
  receipt,
  format,
}: {
  receipt: SaleExchangeReceipt;
  format: ReceiptFormat;
}) {
  const roll = isRoll(format);
  const text = roll ? 'text-[11px] leading-snug' : 'text-sm';
  const { business } = receipt;
  const piece = (item: SaleExchangeReceipt['returned']) =>
    [item.productName, variantText(item.variantLabel)].filter(Boolean).join(' · ');
  return (
    <article
      className={`receipt bg-white font-sans text-black tabular-nums ${text}`}
      style={{ width: receiptContentWidth(format) }}
      aria-label={`Comprobante del cambio ${formatExchangeNumber(receipt.number)}`}
      data-format={format}
    >
      <header className="text-center">
        <ReceiptLogo sha256={business.logoSha256} tradeName={business.tradeName} roll={roll} />
        <p className={`font-bold ${roll ? 'text-sm' : 'text-lg'}`}>{business.tradeName}</p>
        {business.address && <p>{business.address}</p>}
        {business.phone && <p>Tel.: {business.phone}</p>}
        {business.taxId && <p>NIT: {business.taxId}</p>}
        <p className={`mt-2 font-semibold uppercase ${roll ? '' : 'text-base'}`}>
          {EXCHANGE_RECEIPT_TITLE}
        </p>
      </header>

      <dl className="mt-2 space-y-0.5">
        <div className="flex justify-between gap-2">
          <dt>N.º</dt>
          <dd className="font-semibold">{formatExchangeNumber(receipt.number)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Venta</dt>
          <dd>{formatSaleNumber(receipt.saleNumber)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Fecha</dt>
          <dd>{formatDateTime(receipt.createdAt)}</dd>
        </div>
        {receipt.seller && (
          <div className="flex justify-between gap-2">
            <dt>Atendió</dt>
            <dd>{receipt.seller.name}</dd>
          </div>
        )}
      </dl>

      <div className="mt-2 space-y-1 border-t border-black pt-1">
        <p className="font-semibold">Pieza que devuelve</p>
        <p>
          {String(receipt.quantity)} × {piece(receipt.returned)}
        </p>
        <p className="font-mono text-[0.85em]">{receipt.returned.sku}</p>
        <p>Precio pagado: {formatBs(receipt.creditUnitPrice)} c/u</p>
      </div>
      <div className="mt-2 space-y-1 border-t border-black pt-1">
        <p className="font-semibold">Pieza que se lleva</p>
        <p>
          {String(receipt.quantity)} × {piece(receipt.delivered)}
        </p>
        <p className="font-mono text-[0.85em]">{receipt.delivered.sku}</p>
        <p>Precio: {formatBs(receipt.deliveredUnitPrice)} c/u</p>
      </div>

      <dl className="mt-2 space-y-0.5 border-t border-black pt-1">
        <div className="flex justify-between gap-2 text-base font-bold">
          <dt>Diferencia cobrada</dt>
          <dd>{formatBs(receipt.difference)}</dd>
        </div>
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
        <ReceiptFooterNote note={business.footerNote} />
      </footer>
    </article>
  );
}

/** Contenido que va a la impresora (mismo patrón del comprobante de venta). */
export function ExchangeReceiptPrintArea({
  receipt,
  format,
}: {
  receipt: SaleExchangeReceipt;
  format: ReceiptFormat;
}) {
  return createPortal(
    <div id="print-receipt" aria-hidden="true">
      <style>{receiptPrintCss(format)}</style>
      <ExchangeReceipt receipt={receipt} format={format} />
    </div>,
    document.body,
  );
}
