import {
  ERROR_CODES,
  PERMISSIONS,
  createSaleSchema,
  formatMoney,
  formatSaleNumber,
  type SaleDetail,
} from '@joyeria/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { ButtonLink } from '../../components/ui/button-link.tsx';
import { Input } from '../../components/ui/input.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { formatBs } from '../../lib/format.ts';
import { newIdempotencyKey } from '../../lib/idempotency.ts';
import { centsToAmount } from '../../lib/money-input.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { useHasPermission } from '../auth/use-auth.ts';
import { useCashStatus } from '../cash/use-cash.ts';
import { PieceImage } from '../catalog/photos/piece-image.tsx';
import { lookupVariant, searchCatalog } from '../catalog/use-products.ts';
import {
  EMPTY_PAYMENTS,
  addPiece,
  applyAvailable,
  applyCurrentPrices,
  cartTotal,
  cartUnits,
  linesOverStock,
  loadPosDraft,
  pieceName,
  pieceFromLookup,
  piecesFromProducts,
  removeLine,
  saleItemsInput,
  savePosDraft,
  setQuantity,
  variantText,
  type AddFailure,
  type CartLine,
  type PaymentDraft,
  type Piece,
  type PosDraft,
} from './cart.ts';
import { CartTable } from './cart-table.tsx';
import { summarizePayments, type PaymentSummary } from './payments.ts';
import { PaymentBreakdown, ReviewLines, ReviewStep } from './review-step.tsx';
import { ScanInput } from './scan-input.tsx';
import { useCreateSale, usePaymentMethods } from './use-sales.ts';

type Step = 'cart' | 'review' | 'uncertain' | 'done';

const ADD_MESSAGES: Record<AddFailure, (piece: Piece) => string> = {
  INACTIVE: (piece) => `${pieceName(piece)} (${piece.sku}) está inactiva: no se puede vender.`,
  NO_PRICE: (piece) => `${pieceName(piece)} (${piece.sku}) no tiene precio de venta.`,
  NO_STOCK: (piece) =>
    piece.available === 0
      ? `${pieceName(piece)} (${piece.sku}) no tiene stock.`
      : `No hay más stock de ${pieceName(piece)} (${piece.sku}): quedan ${piece.available ?? 0}.`,
  MAX_QUANTITY: (piece) => `Se alcanzó la cantidad máxima por línea de ${piece.sku}.`,
  MAX_ITEMS: () => 'Se alcanzó el máximo de piezas distintas por venta.',
};

/** Detalles de error de la API con una lista `items` (PRICE_CHANGED, INSUFFICIENT_STOCK, …). */
function detailItems(details: unknown): Record<string, unknown>[] {
  if (
    details &&
    typeof details === 'object' &&
    'items' in details &&
    Array.isArray(details.items)
  ) {
    return details.items.filter(
      (item): item is Record<string, unknown> => !!item && typeof item === 'object',
    );
  }
  return [];
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Error de red o del servidor: no se sabe si la venta quedó registrada. */
function isUncertain(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status >= 500;
}

/**
 * Punto de venta (`/ventas/nueva`, plan 11 §5.4). Carrito en el navegador → cobro → revisión
 * OBLIGATORIA → confirmación atómica e idempotente. La `Idempotency-Key` se genera al entrar a la
 * revisión y se guarda en `sessionStorage` con el carrito: un reintento (corte de red, 503, recarga)
 * reenvía EXACTAMENTE el mismo cuerpo con la MISMA clave, así el servidor nunca registra dos veces
 * la misma venta. Una venta confirmada no se puede anular ni modificar (DEC-V07).
 */
export function PosPage() {
  useDocumentTitle('Punto de venta');
  const canOpenCash = useHasPermission(PERMISSIONS.CASH_OPEN);
  const cash = useCashStatus();
  const methods = usePaymentMethods();
  const createSale = useCreateSale();
  const [draft, setDraft] = useState<PosDraft>(() => loadPosDraft());
  const [step, setStep] = useState<Step>(() => (draft.attempt?.uncertain ? 'uncertain' : 'cart'));
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [message, setMessage] = useState('');
  const [scanError, setScanError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [candidates, setCandidates] = useState<Piece[]>([]);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [cartAlert, setCartAlert] = useState('');
  const [reviewAlert, setReviewAlert] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);
  const cartAlertRef = useRef<HTMLParagraphElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  // Evita dos envíos por un doble clic antes de que el botón se deshabilite.
  const sending = useRef(false);

  useEffect(() => {
    savePosDraft(draft);
  }, [draft]);

  useEffect(() => {
    if (step === 'done' || step === 'uncertain') resultRef.current?.focus();
    if (step === 'cart') {
      if (cartAlertRef.current) cartAlertRef.current.focus();
      else scanRef.current?.focus();
    }
  }, [step]);

  const lines = draft.lines;
  const totalCents = cartTotal(lines);
  const summary = useMemo(
    () => summarizePayments(totalCents, draft.payments),
    [totalCents, draft.payments],
  );
  const cashOpen = cash.data?.open === true;
  const activeMethods = methods.data ?? [];

  function updateLines(next: CartLine[]) {
    setDraft((current) => ({ ...current, lines: next }));
  }

  function addToCart(piece: Piece) {
    const result = addPiece(lines, piece);
    if (!result.ok) {
      setScanError(ADD_MESSAGES[result.reason](piece));
      return;
    }
    updateLines(result.cart);
    setScanError('');
    setCandidates([]);
    setIssues((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => id !== piece.variantId)),
    );
    setMessage(`Agregada: ${pieceName(piece)} (${piece.sku}).`);
    scanRef.current?.focus();
  }

  async function scan(code: string) {
    setScanError('');
    setMessage('');
    setCandidates([]);
    setCartAlert('');
    setScanning(true);
    try {
      addToCart(pieceFromLookup((await lookupVariant(code)).data));
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.status !== 404) {
        setScanError(
          cause instanceof ApiError
            ? cause.message
            : 'No se pudo consultar la pieza. Revise la conexión.',
        );
        return;
      }
      // No es un código exacto: búsqueda por nombre o SKU para elegir a mano.
      try {
        const found = piecesFromProducts(await searchCatalog(code));
        if (found.length === 0) {
          setScanError(`No se encontró ninguna pieza con «${code}».`);
        } else {
          setCandidates(found);
          setMessage(`No hay un código exacto «${code}». Elija la pieza en la lista.`);
        }
      } catch {
        setScanError('No se pudo buscar en el catálogo.');
      }
    } finally {
      setScanning(false);
      scanRef.current?.focus();
    }
  }

  function setPayment(field: keyof PaymentDraft, value: string) {
    setDraft((current) => ({ ...current, payments: { ...current.payments, [field]: value } }));
  }

  /** Entra a la revisión: fija el cuerpo de la venta y su clave (la misma si nada cambió). */
  function toReview() {
    if (!summary.ready || !cashOpen || linesOverStock(lines).length > 0) return;
    const body = JSON.stringify({
      items: saleItemsInput(lines),
      payments: summary.payments,
      expectedTotal: formatMoney(totalCents),
    });
    setDraft((current) => ({
      ...current,
      attempt:
        current.attempt && current.attempt.body === body
          ? current.attempt
          : { key: newIdempotencyKey(), body, uncertain: false },
    }));
    setReviewAlert('');
    setStep('review');
    void cash.refetch();
  }

  function backToCart(alert: string, nextIssues: Record<string, string> = {}) {
    setCartAlert(alert);
    setIssues(nextIssues);
    setStep('cart');
  }

  /** Maneja un rechazo de NEGOCIO: la operación cambia, así que la próxima vez lleva clave nueva. */
  function handleBusinessError(error: ApiError) {
    const items = detailItems(error.details);
    if (error.code === ERROR_CODES.PRICE_CHANGED) {
      const prices = items.map((item) => ({
        variantId: text(item.variantId) ?? '',
        currentUnitPrice: text(item.currentUnitPrice),
      }));
      const marks: Record<string, string> = {};
      for (const item of items) {
        const id = text(item.variantId);
        if (id) {
          marks[id] =
            `El precio cambió: antes ${formatBs(text(item.expectedUnitPrice))}, ahora ${formatBs(text(item.currentUnitPrice))}.`;
        }
      }
      setDraft((current) => ({
        ...current,
        lines: applyCurrentPrices(current.lines, prices),
        attempt: null,
      }));
      backToCart(
        'Cambió el precio de una o más piezas. Revise el carrito y el cobro antes de continuar.',
        marks,
      );
      return;
    }
    if (error.code === ERROR_CODES.INSUFFICIENT_STOCK) {
      const stock = items.flatMap((item) => {
        const id = text(item.variantId);
        return id && typeof item.available === 'number'
          ? [{ variantId: id, available: item.available }]
          : [];
      });
      const marks: Record<string, string> = {};
      for (const item of stock) {
        marks[item.variantId] =
          item.available === 0
            ? 'Ya no hay stock de esta pieza: quítela del carrito.'
            : `Stock insuficiente: solo quedan ${item.available}.`;
      }
      setDraft((current) => ({
        ...current,
        lines: applyAvailable(current.lines, stock),
        attempt: null,
      }));
      backToCart('No hay stock suficiente de una o más piezas. Corrija el carrito.', marks);
      return;
    }
    if (error.code === ERROR_CODES.VARIANT_NOT_SELLABLE) {
      const marks: Record<string, string> = {};
      for (const item of items) {
        const id = text(item.variantId);
        if (id) marks[id] = 'Esta pieza ya no se puede vender (inactiva o sin precio): quítela.';
      }
      setDraft((current) => ({ ...current, attempt: null }));
      backToCart('Una o más piezas ya no se pueden vender. Corrija el carrito.', marks);
      return;
    }
    setDraft((current) => ({ ...current, attempt: null }));
    backToCart(
      error.code === ERROR_CODES.PAYMENT_MISMATCH
        ? `Los pagos no cuadran con el total: ${error.message}`
        : error.message,
    );
  }

  async function confirm() {
    const attempt = draft.attempt;
    if (!attempt || sending.current) return;
    const parsed = createSaleSchema.safeParse(JSON.parse(attempt.body));
    if (!parsed.success) {
      setDraft((current) => ({ ...current, attempt: null }));
      backToCart('Revise la venta: hay datos que no son válidos.');
      return;
    }
    sending.current = true;
    setReviewAlert('');
    try {
      const created = await createSale.mutateAsync({ body: parsed.data, key: attempt.key });
      setSale(created);
      setDraft({ lines: [], payments: { ...EMPTY_PAYMENTS }, attempt: null });
      setIssues({});
      setCartAlert('');
      setStep('done');
    } catch (cause) {
      if (isUncertain(cause)) {
        // Sin respuesta clara: se conserva la MISMA clave y el MISMO cuerpo para reintentar.
        setDraft((current) => ({
          ...current,
          attempt: current.attempt ? { ...current.attempt, uncertain: true } : null,
        }));
        setStep('uncertain');
        return;
      }
      if (!(cause instanceof ApiError)) return;
      if (cause.code === ERROR_CODES.CASH_SESSION_REQUIRED) {
        // La caja se cerró: no se registró nada; se conservan carrito y clave.
        void cash.refetch();
        setDraft((current) => ({
          ...current,
          attempt: current.attempt ? { ...current.attempt, uncertain: false } : null,
        }));
        setReviewAlert(
          'La caja se cerró mientras cobraba: la venta NO se registró. Pida que se abra la caja y vuelva a confirmar.',
        );
        setStep('review');
        return;
      }
      handleBusinessError(cause);
    } finally {
      sending.current = false;
    }
  }

  function newSale() {
    setSale(null);
    setMessage('');
    setScanError('');
    setStep('cart');
  }

  const cashBanner: ReactNode = cash.isSuccess && !cashOpen && (
    <div role="alert" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p className="font-semibold text-amber-950">No hay caja abierta. No se puede vender.</p>
      <p className="text-sm text-amber-950">
        {canOpenCash
          ? 'Abra la caja con el fondo inicial y vuelva aquí: el carrito se conserva.'
          : 'Pida a un Administrador o al Responsable de inventario que abra la caja. El carrito se conserva.'}
      </p>
      <ButtonLink to="/caja" variant={canOpenCash ? 'primary' : 'secondary'}>
        {canOpenCash ? 'Abrir caja' : 'Ver el estado de la caja'}
      </ButtonLink>
    </div>
  );

  if (step === 'done' && sale) {
    return (
      <section className="space-y-6">
        <h1 className="sr-only">Punto de venta</h1>
        <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 ref={resultRef} tabIndex={-1} className="text-xl font-semibold text-emerald-900">
            Venta {formatSaleNumber(sale.number)} registrada
          </h2>
          <p className="text-lg">
            Total cobrado: <strong className="tabular-nums">{formatBs(sale.total)}</strong>
          </p>
          <p className="text-lg">
            Vuelto a entregar:{' '}
            <strong className="tabular-nums">{formatBs(sale.changeGiven)}</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink to={`/ventas/${sale.id}/comprobante`}>Ver comprobante</ButtonLink>
            <Button variant="secondary" onClick={newSale}>
              Nueva venta
            </Button>
          </div>
        </div>
      </section>
    );
  }

  if (step === 'uncertain' && draft.attempt) {
    return (
      <section className="space-y-6">
        <h1 className="sr-only">Punto de venta</h1>
        <div role="alert" className="space-y-3 rounded-xl border border-red-300 bg-red-50 p-5">
          <h2 ref={resultRef} tabIndex={-1} className="text-xl font-semibold text-red-900">
            Resultado incierto: no cobre de nuevo
          </h2>
          <p className="text-sm text-red-900">
            No llegó la respuesta del servidor: la venta pudo registrarse o no. Pulse «Reintentar»:
            si ya se registró, el sistema la reconoce y no la duplica. También puede revisar las
            ventas del día.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void confirm()} disabled={createSale.isPending}>
              {createSale.isPending ? 'Reintentando…' : 'Reintentar'}
            </Button>
            <ButtonLink to="/ventas" variant="secondary">
              Ver ventas del día
            </ButtonLink>
          </div>
        </div>
        <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
          <h2 className="text-lg font-semibold">Venta pendiente de confirmar</h2>
          <ReviewLines lines={lines} />
          <p className="flex justify-between text-lg font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatBs(centsToAmount(totalCents))}</span>
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Punto de venta</h1>
          <p className="text-sm text-stone-600">
            {cash.data?.session
              ? `Caja abierta por ${cash.data.session.openedByName}.`
              : 'Venta de mostrador con comprobante interno.'}
          </p>
        </div>
      </div>

      {cashBanner}
      {cash.isError && (
        <p role="alert" className="text-sm text-red-700">
          No se pudo consultar si la caja está abierta.{' '}
          <button className="underline" onClick={() => void cash.refetch()}>
            Reintentar
          </button>
        </p>
      )}

      {step === 'review' && (
        <ReviewStep
          lines={lines}
          summary={summary}
          pending={createSale.isPending}
          canConfirm={cashOpen}
          alert={
            reviewAlert ? (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {reviewAlert}
              </p>
            ) : null
          }
          onBack={() => {
            setStep('cart');
          }}
          onConfirm={() => void confirm()}
        />
      )}

      {step === 'cart' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
            <h2 className="text-lg font-semibold">Carrito</h2>
            <ScanInput ref={scanRef} onScan={scan} busy={scanning} />
            <p role="status" className="min-h-5 text-sm text-emerald-800">
              {message}
            </p>
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
                {candidates.map((piece) => (
                  <li
                    key={piece.variantId}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span className="flex items-center gap-3">
                      <PieceImage variantId={piece.variantId} className="size-12" />
                      <span>
                        <span className="block font-medium">{piece.productName}</span>
                        {variantText(piece.variantLabel) && (
                          <span className="block">{variantText(piece.variantLabel)}</span>
                        )}
                        <span className="block font-mono text-xs text-stone-600">
                          {piece.sku} · {formatBs(piece.unitPrice)}
                          {piece.available !== null ? ` · stock ${piece.available}` : ''}
                        </span>
                      </span>
                    </span>
                    <Button
                      variant="secondary"
                      aria-label={`Agregar ${pieceName(piece)} (${piece.sku}) al carrito`}
                      onClick={() => {
                        addToCart(piece);
                      }}
                    >
                      Agregar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {cartAlert && (
              <p
                ref={cartAlertRef}
                tabIndex={-1}
                role="alert"
                className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-950"
              >
                {cartAlert}
              </p>
            )}
            {lines.length === 0 ? (
              <p className="text-sm text-stone-600">El carrito está vacío.</p>
            ) : (
              <CartTable
                lines={lines}
                issues={issues}
                onQuantity={(variantId, quantity) => {
                  updateLines(setQuantity(lines, variantId, quantity));
                }}
                onRemove={(variantId) => {
                  updateLines(removeLine(lines, variantId));
                  scanRef.current?.focus();
                }}
              />
            )}
          </div>

          <PaymentPanel
            lines={lines}
            summary={summary}
            payments={draft.payments}
            methods={activeMethods.map((method) => method.code)}
            methodsError={methods.isError}
            cashOpen={cashOpen}
            onChange={setPayment}
            onReview={toReview}
          />
        </div>
      )}
    </section>
  );
}

const PAYMENT_FIELDS: {
  code: 'CASH' | 'QR' | 'BANK_TRANSFER';
  field: 'cash' | 'qr' | 'transfer';
  label: string;
  reference?: { field: 'qrReference' | 'transferReference'; label: string };
}[] = [
  { code: 'CASH', field: 'cash', label: 'Efectivo recibido (Bs)' },
  {
    code: 'QR',
    field: 'qr',
    label: 'QR (Bs)',
    reference: { field: 'qrReference', label: 'Referencia del QR (opcional)' },
  },
  {
    code: 'BANK_TRANSFER',
    field: 'transfer',
    label: 'Transferencia (Bs)',
    reference: { field: 'transferReference', label: 'Referencia de la transferencia (opcional)' },
  },
];

/** Cobro: efectivo recibido, QR y transferencia (y combinaciones), con «Falta» y «Vuelto». */
function PaymentPanel({
  lines,
  summary,
  payments,
  methods,
  methodsError,
  cashOpen,
  onChange,
  onReview,
}: {
  lines: CartLine[];
  summary: PaymentSummary;
  payments: PaymentDraft;
  methods: string[];
  methodsError: boolean;
  cashOpen: boolean;
  onChange: (field: keyof PaymentDraft, value: string) => void;
  onReview: () => void;
}) {
  const empty = lines.length === 0;
  const reason = empty
    ? 'Agregue piezas al carrito.'
    : !cashOpen
      ? 'No hay caja abierta.'
      : linesOverStock(lines).length > 0
        ? 'Hay piezas sin stock suficiente: corrija o quite las líneas marcadas.'
        : summary.error
          ? summary.error
          : summary.remainingCents > 0n
            ? `Falta cobrar ${formatBs(centsToAmount(summary.remainingCents))}.`
            : null;

  return (
    <aside
      aria-label="Cobro"
      className="h-fit space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs lg:sticky lg:top-4"
    >
      <h2 className="text-lg font-semibold">Cobro</h2>
      <p className="flex items-baseline justify-between">
        <span className="text-sm text-stone-700">
          Total ({cartUnits(lines)} {cartUnits(lines) === 1 ? 'pieza' : 'piezas'})
        </span>
        <strong className="text-2xl tabular-nums">
          {formatBs(centsToAmount(summary.totalCents))}
        </strong>
      </p>
      {methodsError && (
        <p role="alert" className="text-sm text-red-700">
          No se pudieron cargar los medios de pago.
        </p>
      )}
      {!empty && (
        <div className="space-y-3">
          {PAYMENT_FIELDS.filter((item) => methods.includes(item.code)).map((item) => (
            <div key={item.code} className="space-y-2">
              <Input
                label={item.label}
                inputMode="decimal"
                autoComplete="off"
                value={payments[item.field]}
                onChange={(event) => {
                  onChange(item.field, event.target.value);
                }}
                error={summary.fieldErrors[item.field]}
              />
              {item.reference && payments[item.field].trim() !== '' && (
                <Input
                  label={item.reference.label}
                  autoComplete="off"
                  maxLength={100}
                  value={payments[item.reference.field]}
                  onChange={(event) => {
                    if (item.reference) onChange(item.reference.field, event.target.value);
                  }}
                  error={summary.fieldErrors[item.reference.field]}
                />
              )}
            </div>
          ))}
          <div
            role="status"
            aria-label="Estado del cobro"
            aria-atomic="true"
            className="space-y-1 rounded-lg bg-stone-50 p-3"
          >
            {summary.remainingCents > 0n && (
              <p className="flex justify-between font-medium text-red-800">
                <span>Falta</span>
                <span className="tabular-nums">
                  {formatBs(centsToAmount(summary.remainingCents))}
                </span>
              </p>
            )}
            <p className="flex justify-between font-medium">
              <span>Vuelto</span>
              <span className="tabular-nums">{formatBs(centsToAmount(summary.changeCents))}</span>
            </p>
            {summary.error && <p className="text-sm text-red-800">{summary.error}</p>}
          </div>
          {summary.ready && <PaymentBreakdown summary={summary} />}
        </div>
      )}
      <Button
        className="w-full"
        disabled={reason !== null}
        onClick={onReview}
        aria-describedby={reason ? 'review-reason' : undefined}
      >
        Revisar venta
      </Button>
      {reason && (
        <p id="review-reason" className="text-sm text-stone-700">
          {reason}
        </p>
      )}
    </aside>
  );
}
