import { RECEIPT_FORMATS, formatSaleNumber, type ReceiptFormat } from '@joyeria/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { Receipt, ReceiptPrintArea } from './receipt.tsx';
import { RECEIPT_FORMAT_LABELS, loadReceiptFormat, saveReceiptFormat } from './receipt-settings.ts';
import { useRegisterPrint, useSaleReceipt } from './use-sales.ts';

/**
 * Comprobante interno de una venta (`/ventas/:id/comprobante`). Imprimir NO crea ni modifica la
 * venta: primero se registra la impresión (`print-events`, auditada) y con su respuesta se marca
 * «COPIA» si corresponde; recién entonces se abre el diálogo de impresión. Si el registro falla,
 * no se imprime.
 */
export function ReceiptPage() {
  const { id = '' } = useParams();
  const receipt = useSaleReceipt(id);
  const register = useRegisterPrint(id);
  const [format, setFormat] = useState<ReceiptFormat>(() => loadReceiptFormat());
  const [printJob, setPrintJob] = useState<{ isCopy: boolean; n: number } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // Evita dos registros por un doble clic antes de que el botón se deshabilite.
  const printing = useRef(false);
  const data = receipt.data;
  const label = data ? formatSaleNumber(data.number) : '';
  useDocumentTitle(data ? `Comprobante ${label}` : 'Comprobante');

  // La marca «COPIA» se pinta con la respuesta del registro y DESPUÉS se imprime.
  useEffect(() => {
    if (printJob) window.print();
  }, [printJob]);

  // Antes de registrar, la vista previa anticipa si la próxima impresión será copia.
  const isCopy = printJob ? printJob.isCopy : (data?.printCount ?? 0) >= 1;

  async function print() {
    if (printing.current) return;
    printing.current = true;
    setError('');
    setNotice('');
    try {
      const event = await register.mutateAsync(format);
      setPrintJob((previous) => ({ isCopy: event.isCopy, n: (previous?.n ?? 0) + 1 }));
      setNotice(
        event.isCopy
          ? `Impresión registrada como copia n.º ${event.copyNumber}.`
          : 'Impresión del original registrada.',
      );
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? `No se imprimió: ${cause.message}`
          : 'No se imprimió: no se pudo registrar la impresión. Revise la conexión y vuelva a intentarlo.',
      );
    } finally {
      printing.current = false;
    }
  }

  return (
    <section className="space-y-6">
      <p className="text-sm print:hidden">
        <Link to={`/ventas/${id}`} className="text-brand-700 underline">
          Volver a la venta
        </Link>
      </p>
      <div>
        <h1 className="text-2xl font-semibold">Comprobante interno{label ? ` ${label}` : ''}</h1>
        <p className="text-sm text-stone-600">
          Comprobante interno de la tienda; no es una factura fiscal. Reimprimir no cambia la venta
          ni sus importes.
        </p>
      </div>

      {receipt.isPending && (
        <p role="status" className="text-sm">
          Cargando comprobante…
        </p>
      )}
      {receipt.isError && (
        <p role="alert" className="text-sm text-red-700">
          No se encontró el comprobante o no se pudo cargar.
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
                    name="receipt-format"
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
              El formato elegido se recuerda en este navegador. En el diálogo de impresión use
              escala 100 % y desactive encabezados y pies de página.
            </p>
            <Button onClick={() => void print()} disabled={register.isPending} className="w-full">
              {register.isPending ? 'Registrando…' : `Imprimir comprobante de la venta ${label}`}
            </Button>
            {data.printCount >= 1 && !printJob && (
              <p className="text-xs text-stone-700">
                Este comprobante ya se imprimió {data.printCount}{' '}
                {data.printCount === 1 ? 'vez' : 'veces'}: la próxima impresión saldrá con la marca
                «COPIA».
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm text-emerald-800">
                {notice}
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
          </div>

          <div className="min-w-0">
            <h2 className="mb-2 text-sm font-semibold text-stone-700">Vista previa</h2>
            <div className="overflow-x-auto rounded-xl border border-stone-200 bg-stone-100 p-4">
              <div className="mx-auto w-fit bg-white p-3 shadow-sm">
                <Receipt receipt={data} format={format} isCopy={isCopy} />
              </div>
            </div>
          </div>
          <ReceiptPrintArea receipt={data} format={format} isCopy={isCopy} />
        </div>
      )}
    </section>
  );
}
