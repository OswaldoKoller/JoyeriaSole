import { PERMISSIONS, type CreateStockEntryInput, type StockEntryDetail } from '@joyeria/shared';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Skeleton } from '../../components/ui/skeleton.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { useHasPermission } from '../auth/use-auth.ts';
import { CostPanel } from './cost-panel.tsx';
import {
  fromServer,
  ingressLabel,
  missingReasons,
  previewEntry,
  storedPreview,
  sumCosts,
  toInput,
  type Preview,
} from './lines.ts';
import { QuickCreatePiece, type QuickCreateState } from './quick-create-piece.tsx';
import { StatusBadge } from './status-badge.tsx';
import { costsFromServer, costsToInput, type CostLine } from './cost-lines.ts';
import { StockEntryCosts } from './stock-entry-costs.tsx';
import { StockEntryHeaderForm } from './stock-entry-header-form.tsx';
import { StockEntryItems } from './stock-entry-items.tsx';
import {
  useCancelStockEntry,
  useConfirmStockEntry,
  useCostTypes,
  useReplaceStockEntryCosts,
  useReplaceStockEntryItems,
  useStockEntry,
  useUpdateStockEntry,
} from './use-stock-entries.ts';

const dateTime = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  dateStyle: 'short',
  timeStyle: 'short',
});

function messageOf(error: unknown) {
  if (error instanceof ApiError) {
    const blockers = (error.details as { blockers?: string[] } | undefined)?.blockers;
    return blockers?.length ? `${error.message} ${blockers.join(' ')}` : error.message;
  }
  return 'No se pudo completar la operación. Intente de nuevo.';
}

const plain = (lines: readonly CostLine[]) =>
  JSON.stringify(lines.map(({ costTypeId, amount, note }) => ({ costTypeId, amount, note })));

interface EditorProps {
  entry: StockEntryDetail;
  quick: QuickCreateState;
  onQuickChange: (state: QuickCreateState) => void;
}

function Editor({ entry, quick, onQuickChange }: EditorProps) {
  const navigate = useNavigate();
  const canManage = useHasPermission(PERMISSIONS.STOCK_ENTRIES_MANAGE);
  const canConfirm = useHasPermission(PERMISSIONS.STOCK_ENTRIES_CONFIRM);
  const canCosts = useHasPermission(PERMISSIONS.COSTS_READ);
  const canCatalog = useHasPermission(PERMISSIONS.CATALOG_MANAGE);
  const isDraft = entry.status === 'DRAFT';
  // Precios y costos solo los edita quien también puede verlos (costs:read).
  const editable = isDraft && canManage && canCosts;

  const update = useUpdateStockEntry(entry.id);
  const replace = useReplaceStockEntryItems(entry.id);
  const replaceCosts = useReplaceStockEntryCosts(entry.id);
  const confirm = useConfirmStockEntry(entry.id);
  const cancel = useCancelStockEntry(entry.id);
  const costTypes = useCostTypes();

  const [lines, setLines] = useState(() => fromServer(entry.items));
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [costLines, setCostLines] = useState(() => costsFromServer(entry.costs));
  const [costErrors, setCostErrors] = useState<Record<string, string>>({});
  const [headerDirty, setHeaderDirty] = useState(false);
  const [headerError, setHeaderError] = useState('');
  const [actionError, setActionError] = useState('');

  const linesDirty = JSON.stringify(lines) !== JSON.stringify(fromServer(entry.items));
  const costsDirty = plain(costLines) !== plain(costsFromServer(entry.costs));
  const parsed = toInput(lines);

  // Mientras se edita, la vista previa usa el mismo algoritmo que la confirmación (ADR-015/016).
  let preview: Preview | null = null;
  if (canCosts) {
    preview = isDraft
      ? parsed.ok
        ? previewEntry({
            currency: entry.currency,
            exchangeRate: entry.exchangeRate,
            lines,
            items: parsed.items,
            extrasCents: sumCosts(costLines.map((line) => line.amount)),
          })
        : null
      : storedPreview(entry);
  }

  async function saveHeader(input: CreateStockEntryInput) {
    setHeaderError('');
    try {
      await update.mutateAsync(input);
    } catch (error) {
      setHeaderError(messageOf(error));
    }
  }

  async function saveItems() {
    setActionError('');
    if (!parsed.ok) {
      setLineErrors(parsed.errors);
      return;
    }
    setLineErrors({});
    try {
      await replace.mutateAsync({ items: parsed.items });
    } catch (error) {
      setActionError(messageOf(error));
    }
  }

  async function saveCosts() {
    setActionError('');
    const result = costsToInput(costLines);
    if (!result.ok) {
      setCostErrors(result.errors);
      return;
    }
    setCostErrors({});
    try {
      await replaceCosts.mutateAsync({ costs: result.costs });
    } catch (error) {
      setActionError(messageOf(error));
    }
  }

  async function confirmEntry() {
    setActionError('');
    if (
      !window.confirm(
        'Al confirmar, el stock aumentará y el ingreso ya no podrá modificarse. ¿Confirmar el ingreso?',
      )
    ) {
      return;
    }
    try {
      await confirm.mutateAsync();
    } catch (error) {
      setActionError(messageOf(error));
    }
  }

  async function cancelEntry() {
    setActionError('');
    if (!window.confirm('¿Cancelar este borrador? No se registrará ningún movimiento de stock.')) {
      return;
    }
    try {
      await cancel.mutateAsync();
      await navigate('/ingresos');
    } catch (error) {
      setActionError(messageOf(error));
    }
  }

  const reasons: string[] = [];
  if (linesDirty) reasons.push('Guarde los ítems antes de confirmar.');
  if (costsDirty) reasons.push('Guarde los costos adicionales antes de confirmar.');
  if (headerDirty) reasons.push('Guarde la cabecera antes de confirmar.');
  if (!linesDirty && !costsDirty) reasons.push(...entry.blockers);
  if (linesDirty) {
    for (const line of missingReasons(lines)) {
      reasons.push(`Justifique la diferencia de ${line.sku} para poder confirmar.`);
    }
    if (preview?.zeroValue) {
      reasons.push(
        'Hay costos adicionales pero el valor de compra es cero: indique el costo de al menos un ítem.',
      );
    }
  }
  const canPressConfirm =
    isDraft && canConfirm && canCosts && !confirm.isPending && reasons.length === 0;
  const quickBlocked =
    linesDirty || costsDirty
      ? 'Guarde los ítems y los costos antes de dar de alta una pieza nueva.'
      : headerDirty
        ? 'Guarde la cabecera antes de dar de alta una pieza nueva.'
        : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            to="/ingresos"
            className="inline-flex min-h-10 items-center text-sm text-brand-700 underline"
          >
            ← Ingresos de mercadería
          </Link>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
            Ingreso {ingressLabel(entry.number)} <StatusBadge status={entry.status} />
          </h1>
          <p className="text-sm text-stone-600">
            {entry.supplierName}
            {entry.documentNumber
              ? ` · ${entry.documentType ?? 'Doc.'} ${entry.documentNumber}`
              : ''}
          </p>
        </div>
      </div>

      {entry.relatedEntries.length > 0 && (
        <section
          aria-label="Otros ingresos con el mismo comprobante"
          className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900"
        >
          <p>
            Hay otros ingresos de {entry.supplierName} con el comprobante{' '}
            <strong>{entry.documentNumber}</strong> (entregas parciales):
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {entry.relatedEntries.map((other) => (
              <li key={other.id}>
                <Link
                  to={`/ingresos/${other.id}`}
                  className="inline-flex min-h-8 items-center underline"
                >
                  {ingressLabel(other.number)}
                </Link>{' '}
                <span className="text-xs">
                  (
                  {other.status === 'CONFIRMED'
                    ? 'confirmado'
                    : other.status === 'DRAFT'
                      ? 'borrador'
                      : 'cancelado'}
                  )
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {entry.status === 'CONFIRMED' && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          Confirmado por {entry.confirmedByName ?? '—'}
          {entry.confirmedAt ? ` el ${dateTime.format(new Date(entry.confirmedAt))}` : ''}. El stock
          y el último costo de cada variante ya fueron actualizados; el precio de venta no cambia.
          Las correcciones se hacen con un ajuste de inventario.
        </p>
      )}
      {entry.status === 'CANCELLED' && (
        <p role="status" className="rounded-lg bg-stone-100 p-3 text-sm text-stone-700">
          Este ingreso fue cancelado. No generó movimientos de stock.
        </p>
      )}

      <StockEntryHeaderForm
        entry={entry}
        editable={isDraft && canManage}
        submitLabel="Guardar cabecera"
        pending={update.isPending}
        serverError={headerError}
        onSubmit={saveHeader}
        onDirtyChange={setHeaderDirty}
      />

      {canCosts && (
        <StockEntryCosts
          lines={costLines}
          types={costTypes.data ?? []}
          editable={editable}
          saving={replaceCosts.isPending}
          dirty={costsDirty}
          errors={costErrors}
          onChange={(next) => {
            setCostLines(next);
            setCostErrors({});
          }}
          onSave={() => void saveCosts()}
        />
      )}

      <StockEntryItems
        lines={lines}
        currency={entry.currency}
        editable={editable}
        saving={replace.isPending}
        errors={lineErrors}
        onChange={(next) => {
          setLines(next);
          setLineErrors({});
        }}
      />

      {editable && canCatalog && (
        <QuickCreatePiece
          entryId={entry.id}
          state={quick}
          onStateChange={onQuickChange}
          currency={entry.currency}
          blockedReason={quickBlocked}
          onCreated={() => {
            setActionError('');
          }}
        />
      )}

      {canCosts && (
        <CostPanel
          preview={preview}
          currency={entry.currency}
          exchangeRate={entry.exchangeRate}
          confirmed={entry.status === 'CONFIRMED'}
        />
      )}

      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {actionError}
        </p>
      )}

      {isDraft && (
        <section
          aria-label="Acciones del ingreso"
          className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
        >
          {reasons.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-3">
            {editable && (
              <Button
                variant="secondary"
                disabled={replace.isPending || !linesDirty}
                onClick={() => void saveItems()}
              >
                {replace.isPending ? 'Guardando…' : 'Guardar ítems'}
              </Button>
            )}
            {canConfirm && canCosts && (
              <Button disabled={!canPressConfirm} onClick={() => void confirmEntry()}>
                {confirm.isPending ? 'Confirmando…' : 'Confirmar ingreso'}
              </Button>
            )}
            {canManage && (
              <Button
                variant="danger"
                disabled={cancel.isPending}
                onClick={() => void cancelEntry()}
              >
                Cancelar borrador
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export function StockEntryPage() {
  const { id = '' } = useParams();
  const query = useStockEntry(id);
  // El editor se reinicia al guardar; el estado del alta rápida vive aquí para no perderlo.
  const [quick, setQuick] = useState<QuickCreateState>({ open: false, notice: null });

  if (query.isPending) {
    return (
      <div role="status" aria-label="Cargando ingreso" className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <p role="alert" className="py-6 text-sm text-red-700">
        {notFound ? 'El ingreso no existe.' : 'No se pudo cargar el ingreso.'}{' '}
        <Link to="/ingresos" className="underline">
          Volver a la lista
        </Link>
      </p>
    );
  }
  // Al guardar, el servidor devuelve datos normalizados: se reinicia el editor con ellos.
  const version = JSON.stringify([
    query.data.status,
    query.data.items,
    query.data.costs,
    query.data.currency,
    query.data.exchangeRate,
    query.data.supplierId,
    query.data.documentType,
    query.data.documentNumber,
    query.data.documentDate,
    query.data.notes,
  ]);
  return <Editor key={version} entry={query.data} quick={quick} onQuickChange={setQuick} />;
}
