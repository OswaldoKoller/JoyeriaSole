import {
  ERROR_CODES,
  PERMISSIONS,
  createSaleExchangeSchema,
  formatExchangeNumber,
  formatSaleNumber,
  type ExchangeHolding,
  type SaleExchangeDetail,
} from '@joyeria/shared';
import { useRef, useState, type SyntheticEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { ButtonLink } from '../../components/ui/button-link.tsx';
import { Input } from '../../components/ui/input.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { formatBs, formatDateTime } from '../../lib/format.ts';
import { useAttemptKeys } from '../../lib/idempotency.ts';
import { centsToAmount } from '../../lib/money-input.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { useHasPermission } from '../auth/use-auth.ts';
import { useCashStatus } from '../cash/use-cash.ts';
import { PieceImage } from '../catalog/photos/piece-image.tsx';
import { lookupVariant, searchCatalog } from '../catalog/use-products.ts';
import {
  EMPTY_PAYMENTS,
  pieceFromLookup,
  pieceName,
  piecesFromProducts,
  variantText,
  type PaymentDraft,
  type Piece,
} from '../sales/cart.ts';
import { PaymentFields } from '../sales/payment-fields.tsx';
import { summarizePayments } from '../sales/payments.ts';
import { parseSaleNumber } from '../sales/sale-labels.ts';
import { ScanInput } from '../sales/scan-input.tsx';
import { usePaymentMethods } from '../sales/use-sales.ts';
import { exchangeIssueMessage, holdingKey, previewExchange } from './exchange-math.ts';
import { useCreateExchange, useExchangeLookup } from './use-sale-exchanges.ts';

/** Una pieza que el cliente puede devolver: foto, nombre, lo que pagó y cuántas quedan. */
function HoldingOption({
  holding,
  checked,
  onSelect,
}: {
  holding: ExchangeHolding;
  checked: boolean;
  onSelect: () => void;
}) {
  const name = pieceName(holding);
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 focus-within:ring-2 focus-within:ring-brand-500 ${
        checked ? 'border-brand-600 bg-brand-50' : 'border-stone-200 bg-white'
      }`}
    >
      <input
        type="radio"
        name="holding"
        checked={checked}
        onChange={onSelect}
        className="size-5 accent-brand-700"
        aria-label={`Devolver ${name} (${holding.sku})`}
      />
      <PieceImage variantId={holding.variantId} className="size-16" />
      <span className="min-w-0 text-sm">
        <span className="block font-medium">{holding.productName}</span>
        {variantText(holding.variantLabel) && (
          <span className="block text-stone-700">{variantText(holding.variantLabel)}</span>
        )}
        <span className="block font-mono text-xs text-stone-600">{holding.sku}</span>
        <span className="block text-stone-700">
          El cliente pagó {formatBs(holding.creditUnitPrice)} · quedan {holding.remaining} por
          cambiar
          {holding.exchangeNumber !== null &&
            ` · entregada en el cambio ${formatExchangeNumber(holding.exchangeNumber)}`}
        </span>
      </span>
    </label>
  );
}

function errorText(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'No llegó la respuesta del servidor: el cambio pudo registrarse o no. Pulse «Registrar cambio» otra vez: si ya se registró, el sistema lo reconoce y no lo duplica.';
  }
  switch (error.code) {
    case ERROR_CODES.PRICE_CHANGED:
      return 'El precio de la pieza nueva cambió. Búsquela otra vez para ver el precio vigente.';
    case ERROR_CODES.CASH_SESSION_REQUIRED:
      return 'No hay una caja abierta. Pida que abran la caja y vuelva a intentar.';
    default:
      return error.message;
  }
}

/**
 * Cambio de pieza (`/cambios/nuevo`). Política de la tienda: NO hay devoluciones; solo se cambia
 * una pieza por otra de igual o mayor precio, con el comprobante de la venta. Tres pasos simples:
 * la venta, la pieza que devuelve el cliente y la pieza nueva. La diferencia de precio se cobra
 * aquí mismo y entra a la caja abierta. La venta original no se modifica.
 */
export function ExchangePage() {
  useDocumentTitle('Cambio de pieza');
  const [params] = useSearchParams();
  const canOpenCash = useHasPermission(PERMISSIONS.CASH_OPEN);
  const cash = useCashStatus();
  const methods = usePaymentMethods();
  const create = useCreateExchange();
  const attempt = useAttemptKeys();

  const initial = parseSaleNumber(params.get('venta') ?? '');
  const [numberText, setNumberText] = useState(initial ? String(initial) : '');
  const [saleNumber, setSaleNumber] = useState<number | null>(initial);
  const [numberError, setNumberError] = useState('');
  const lookup = useExchangeLookup(saleNumber);

  const [selected, setSelected] = useState('');
  const [quantityText, setQuantityText] = useState('1');
  const [piece, setPiece] = useState<Piece | null>(null);
  const [candidates, setCandidates] = useState<Piece[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [payments, setPayments] = useState<PaymentDraft>(EMPTY_PAYMENTS);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState<SaleExchangeDetail | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  // Evita dos envíos por un doble clic antes de que el botón se deshabilite.
  const sending = useRef(false);

  const holdings = lookup.data?.holdings ?? [];
  // Con una sola pieza por cambiar, ya viene elegida.
  const onlyOne = holdings.length === 1 ? holdings[0] : undefined;
  const holding = holdings.find((item) => holdingKey(item) === selected) ?? onlyOne;
  const quantity = /^\d+$/.test(quantityText.trim()) ? Number(quantityText) : 0;
  const quantityOk = holding !== undefined && quantity >= 1 && quantity <= holding.remaining;
  const preview = holding && piece && quantityOk ? previewExchange(holding, quantity, piece) : null;
  const differenceCents = preview?.issue === null ? preview.differenceCents : 0n;
  const summary = summarizePayments(differenceCents, payments);
  // Sin diferencia no hay nada que cobrar: el cobro está listo con cero pagos (el resumen de la venta
  // exige un total mayor que cero, por eso aquí se decide aparte).
  const paymentReady = differenceCents === 0n || summary.ready;
  const exchangePayments = differenceCents === 0n ? [] : summary.payments;
  const cashOpen = cash.data?.open === true;
  const readyToSend =
    cashOpen &&
    holding !== undefined &&
    quantityOk &&
    piece !== null &&
    preview?.issue === null &&
    paymentReady &&
    !create.isPending;

  function reset() {
    setSelected('');
    setQuantityText('1');
    setPiece(null);
    setCandidates([]);
    setScanError('');
    setPayments(EMPTY_PAYMENTS);
    setNote('');
    setError('');
  }

  function searchSale(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = parseSaleNumber(numberText);
    if (value === null) {
      setNumberError(
        'Escriba el número del comprobante de la venta, por ejemplo VTA-000123 o 123.',
      );
      return;
    }
    setNumberError('');
    reset();
    setDone(null);
    setSaleNumber(value);
  }

  function choose(next: Piece) {
    setPiece(next);
    setCandidates([]);
    setScanError('');
    setError('');
    setPayments(EMPTY_PAYMENTS);
  }

  async function findPiece(code: string) {
    setScanError('');
    setCandidates([]);
    setScanning(true);
    try {
      choose(pieceFromLookup((await lookupVariant(code)).data));
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.status !== 404) {
        setScanError(
          cause instanceof ApiError
            ? cause.message
            : 'No se pudo consultar la pieza. Revise la conexión.',
        );
        return;
      }
      try {
        const found = piecesFromProducts(await searchCatalog(code));
        if (found.length === 0) setScanError(`No se encontró ninguna pieza con «${code}».`);
        else setCandidates(found);
      } catch {
        setScanError('No se pudo buscar en el catálogo.');
      }
    } finally {
      setScanning(false);
      scanRef.current?.focus();
    }
  }

  async function submit() {
    if (!readyToSend || !lookup.data || sending.current) return;
    const parsed = createSaleExchangeSchema.safeParse({
      saleId: lookup.data.saleId,
      ...(holding.sourceItemId
        ? { sourceItemId: holding.sourceItemId }
        : { sourceExchangeId: holding.sourceExchangeId }),
      deliveredVariantId: piece.variantId,
      quantity,
      expectedDeliveredUnitPrice: piece.unitPrice,
      payments: exchangePayments,
      note,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revise los datos del cambio.');
      return;
    }
    sending.current = true;
    setError('');
    try {
      const result = await create.mutateAsync({
        body: parsed.data,
        key: attempt.keyFor(parsed.data),
      });
      attempt.settle(null);
      setDone(result);
    } catch (cause) {
      attempt.settle(cause);
      setError(errorText(cause));
      if (cause instanceof ApiError && cause.code === ERROR_CODES.PRICE_CHANGED) setPiece(null);
      if (cause instanceof ApiError && cause.code === ERROR_CODES.EXCHANGE_QUANTITY_EXCEEDED) {
        void lookup.refetch();
      }
    } finally {
      sending.current = false;
    }
  }

  if (done) {
    return (
      <section className="space-y-6">
        <h1 className="sr-only">Cambio de pieza</h1>
        <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="text-xl font-semibold text-emerald-900" role="status">
            Cambio {formatExchangeNumber(done.number)} registrado
          </h2>
          <p>
            El cliente devolvió <strong>{pieceName(done.returned)}</strong> y se lleva{' '}
            <strong>{pieceName(done.delivered)}</strong>
            {done.quantity > 1 && ` (${String(done.quantity)} unidades)`}.
          </p>
          <p className="text-lg">
            Diferencia cobrada:{' '}
            <strong className="tabular-nums">{formatBs(done.difference)}</strong>
          </p>
          {done.changeGiven !== '0.00' && (
            <p className="text-lg">
              Vuelto a entregar:{' '}
              <strong className="tabular-nums">{formatBs(done.changeGiven)}</strong>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <ButtonLink to={`/cambios/${done.id}`}>Ver e imprimir comprobante</ButtonLink>
            <ButtonLink to={`/ventas/${done.saleId}`} variant="secondary">
              Volver a la venta
            </ButtonLink>
            <Button
              variant="secondary"
              onClick={() => {
                reset();
                setDone(null);
                setNumberText('');
                setSaleNumber(null);
              }}
            >
              Otro cambio
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cambio de pieza</h1>
        <p className="text-sm text-stone-600">
          No hay devoluciones: solo se cambia una pieza por otra de igual o mayor precio, con el
          comprobante de la venta. La diferencia de precio se cobra aquí.
        </p>
      </div>

      {cash.isSuccess && !cashOpen && (
        <div role="alert" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="font-semibold text-amber-950">No hay caja abierta. No se puede cambiar.</p>
          <p className="text-sm text-amber-950">
            {canOpenCash
              ? 'Abra la caja con el fondo inicial y vuelva aquí.'
              : 'Pida a un Administrador o al Responsable de inventario que abra la caja.'}
          </p>
          <ButtonLink to="/caja" variant={canOpenCash ? 'primary' : 'secondary'}>
            {canOpenCash ? 'Abrir caja' : 'Ver el estado de la caja'}
          </ButtonLink>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <form
        onSubmit={searchSale}
        noValidate
        className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
      >
        <h2 className="text-lg font-semibold">1. Venta del comprobante</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-52 flex-1">
            <Input
              label="Número de la venta (VTA-…)"
              value={numberText}
              inputMode="numeric"
              autoComplete="off"
              onChange={(event) => {
                setNumberText(event.target.value);
              }}
              error={numberError}
            />
          </div>
          <Button type="submit" variant="secondary">
            Buscar venta
          </Button>
        </div>
        {lookup.isFetching && (
          <p role="status" className="text-sm">
            Buscando la venta…
          </p>
        )}
        {lookup.isError && (
          <p role="alert" className="text-sm text-red-700">
            {lookup.error instanceof ApiError
              ? lookup.error.message
              : 'No se pudo buscar la venta. Revise la conexión.'}
          </p>
        )}
        {lookup.data && (
          <p className="text-sm text-stone-700">
            Venta <strong>{formatSaleNumber(lookup.data.number)}</strong> del{' '}
            {formatDateTime(lookup.data.soldAt)}.
          </p>
        )}
      </form>

      {lookup.data && holdings.length === 0 && (
        <p role="status" className="rounded-xl border border-stone-200 bg-white p-5 text-sm">
          Esta venta ya no tiene piezas por cambiar: todas se cambiaron antes.
        </p>
      )}

      {lookup.data && holdings.length > 0 && (
        <>
          <fieldset className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
            <legend className="px-1 text-lg font-semibold">2. Pieza que el cliente devuelve</legend>
            <div className="space-y-2">
              {holdings.map((item) => (
                <HoldingOption
                  key={holdingKey(item)}
                  holding={item}
                  checked={holding !== undefined && holdingKey(item) === holdingKey(holding)}
                  onSelect={() => {
                    setSelected(holdingKey(item));
                    setQuantityText('1');
                    setPayments(EMPTY_PAYMENTS);
                    setError('');
                  }}
                />
              ))}
            </div>
            {holding && holding.remaining > 1 && (
              <div className="max-w-40">
                <Input
                  label="Unidades a cambiar"
                  inputMode="numeric"
                  autoComplete="off"
                  value={quantityText}
                  onChange={(event) => {
                    setQuantityText(event.target.value);
                    setPayments(EMPTY_PAYMENTS);
                  }}
                  error={
                    quantityOk
                      ? undefined
                      : `Escriba un número entre 1 y ${String(holding.remaining)}.`
                  }
                />
              </div>
            )}
          </fieldset>

          {holding && quantityOk && (
            <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
              <h2 className="text-lg font-semibold">3. Pieza nueva que se lleva el cliente</h2>
              <ScanInput ref={scanRef} onScan={findPiece} busy={scanning} />
              {scanError && (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {scanError}
                </p>
              )}
              {candidates.length > 0 && (
                <ul
                  aria-label="Resultados de la búsqueda"
                  className="divide-y divide-stone-100 text-sm"
                >
                  {candidates.map((candidate) => (
                    <li
                      key={candidate.variantId}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <span className="flex items-center gap-3">
                        <PieceImage variantId={candidate.variantId} className="size-12" />
                        <span>
                          <span className="block font-medium">{candidate.productName}</span>
                          {variantText(candidate.variantLabel) && (
                            <span className="block">{variantText(candidate.variantLabel)}</span>
                          )}
                          <span className="block font-mono text-xs text-stone-600">
                            {candidate.sku} · {formatBs(candidate.unitPrice)}
                            {candidate.available !== null
                              ? ` · stock ${String(candidate.available)}`
                              : ''}
                          </span>
                        </span>
                      </span>
                      <Button
                        variant="secondary"
                        aria-label={`Elegir ${pieceName(candidate)} (${candidate.sku})`}
                        onClick={() => {
                          choose(candidate);
                        }}
                      >
                        Elegir
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {piece && (
                <div className="space-y-3 rounded-lg bg-stone-50 p-4">
                  <span className="flex items-center gap-3">
                    <PieceImage variantId={piece.variantId} className="size-16" />
                    <span className="text-sm">
                      <span className="block font-medium">{piece.productName}</span>
                      {variantText(piece.variantLabel) && (
                        <span className="block">{variantText(piece.variantLabel)}</span>
                      )}
                      <span className="block font-mono text-xs text-stone-600">{piece.sku}</span>
                      <span className="block">Precio {formatBs(piece.unitPrice)}</span>
                    </span>
                  </span>
                  {preview?.issue && (
                    <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                      {exchangeIssueMessage(
                        preview.issue,
                        {
                          credit: formatBs(holding.creditUnitPrice),
                          piece: formatBs(piece.unitPrice),
                        },
                        piece,
                      )}
                    </p>
                  )}
                  {preview?.issue === null && (
                    <p role="status" className="text-lg">
                      {differenceCents > 0n ? (
                        <>
                          Diferencia a cobrar:{' '}
                          <strong className="tabular-nums">
                            {formatBs(centsToAmount(differenceCents))}
                          </strong>
                        </>
                      ) : (
                        'Sin diferencia de precio: no hay nada que cobrar.'
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {holding && quantityOk && piece && preview?.issue === null && (
            <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
              <h2 className="text-lg font-semibold">
                {differenceCents > 0n ? '4. Cobro de la diferencia' : '4. Confirmar'}
              </h2>
              {differenceCents > 0n && (
                <>
                  {methods.isError && (
                    <p role="alert" className="text-sm text-red-700">
                      No se pudieron cargar los medios de pago.
                    </p>
                  )}
                  <div className="max-w-sm">
                    <PaymentFields
                      summary={summary}
                      payments={payments}
                      methods={(methods.data ?? []).map((method) => method.code)}
                      onChange={(field, value) => {
                        setPayments((current) => ({ ...current, [field]: value }));
                      }}
                    />
                  </div>
                </>
              )}
              <div className="max-w-md">
                <Input
                  label="Observación (opcional)"
                  value={note}
                  maxLength={300}
                  autoComplete="off"
                  onChange={(event) => {
                    setNote(event.target.value);
                  }}
                />
              </div>
              <p className="text-sm text-stone-700">
                Al registrar, la pieza que devuelve el cliente vuelve al stock y la nueva sale del
                stock. El cambio no se puede deshacer.
              </p>
              <Button disabled={!readyToSend} onClick={() => void submit()}>
                {create.isPending ? 'Registrando…' : 'Registrar cambio'}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
