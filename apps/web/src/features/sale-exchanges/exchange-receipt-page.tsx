import { RECEIPT_FORMATS, formatExchangeNumber, type ReceiptFormat } from '@joyeria/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import {
  RECEIPT_FORMAT_LABELS,
  loadReceiptFormat,
  saveReceiptFormat,
} from '../sales/receipt-settings.ts';
import { ExchangeReceipt, ExchangeReceiptPrintArea } from './exchange-receipt.tsx';
import { useExchangeReceipt } from './use-sale-exchanges.ts';

/**
 * Comprobante de un cambio de pieza (`/cambios/:id`). Imprimir no modifica nada: el cambio ya está
 * registrado y es inmutable. El formato elegido se comparte con el comprobante de venta.
 */
export function ExchangeReceiptPage() {
  const { id = '' } = useParams();
  const receipt = useExchangeReceipt(id);
  const [format, setFormat] = useState<ReceiptFormat>(() => loadReceiptFormat());
  const data = receipt.data;
  const label = data ? formatExchangeNumber(data.number) : '';
  useDocumentTitle(data ? `Cambio ${label}` : 'Cambio de pieza');

  return (
    <section className="space-y-6">
      <p className="text-sm print:hidden">
        <Link to="/cambios" className="text-brand-700 underline">
          Volver al historial de cambios
        </Link>
      </p>
      <div>
        <h1 className="text-2xl font-semibold">Cambio de pieza{label ? ` ${label}` : ''}</h1>
        <p className="text-sm text-stone-600">
          Comprobante interno de la tienda; no es una factura fiscal. Un cambio registrado no se
          modifica.
        </p>
      </div>

      {receipt.isPending && (
        <p role="status" className="text-sm">
          Cargando comprobante…
        </p>
      )}
      {receipt.isError && (
        <p role="alert" className="text-sm text-red-700">
          No se encontró el cambio o no se pudo cargar.
        </p>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Formato de impresión</legend>
              {RECEIPT_FORMATS.map((value) => (
                <label key={value} className="flex min-h-10 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="exchange-receipt-format"
                    value={value}
                    checked={format === value}
                    onChange={() => {
                      setFormat(value);
                      saveReceiptFormat(value);
                    }}
                    className="size-4 accent-brand-700"
                  />
                  {RECEIPT_FORMAT_LABELS[value]}
                </label>
              ))}
            </fieldset>
            <p className="text-xs text-stone-600">
              En el diálogo de impresión use escala 100 % y desactive encabezados y pies de página.
            </p>
            <Button
              className="w-full"
              onClick={() => {
                window.print();
              }}
            >
              Imprimir comprobante del cambio {label}
            </Button>
          </div>

          <div className="min-w-0">
            <h2 className="mb-2 text-sm font-semibold text-stone-700">Vista previa</h2>
            <div className="overflow-x-auto rounded-xl border border-stone-200 bg-stone-100 p-4">
              <div className="mx-auto w-fit bg-white p-3 shadow-sm">
                <ExchangeReceipt receipt={data} format={format} />
              </div>
            </div>
          </div>
          <ExchangeReceiptPrintArea receipt={data} format={format} />
        </div>
      )}
    </section>
  );
}
