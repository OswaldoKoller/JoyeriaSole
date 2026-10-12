import {
  PERMISSIONS,
  formatMoney,
  parseMoney,
  type CreateStockEntryInput,
  type StockEntryDetail,
} from '@joyeria/shared';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Skeleton } from '../../components/ui/skeleton.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { useHasPermission } from '../auth/use-auth.ts';
import {
  fromServer,
  ingressLabel,
  previewLines,
  toInput,
  type Line,
  type Preview,
} from './lines.ts';
import { StatusBadge } from './status-badge.tsx';
import { StockEntryHeaderForm } from './stock-entry-header-form.tsx';
import { StockEntryItems } from './stock-entry-items.tsx';
import {
  useCancelStockEntry,
  useConfirmStockEntry,
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

/** Totales y costos por pieza de un ingreso ya cerrado, tal como quedaron guardados. */
function storedPreview(entry: StockEntryDetail): Preview {
  const perVariant = new Map<string, { unitExtra: string; unitTotal: string }>();
  for (const item of entry.items) {
    if (item.unitExtraCost !== null && item.unitTotalCost !== null) {
      perVariant.set(item.variantId, {
        unitExtra: item.unitExtraCost,
        unitTotal: item.unitTotalCost,
      });
    }
  }
  return {
    purchaseTotal: entry.purchaseTotal,
    extrasTotal: entry.extrasTotal,
    grandTotal: formatMoney(parseMoney(entry.purchaseTotal) + parseMoney(entry.extrasTotal)),
    perVariant,
    zeroValue: false,
  };
}

function Editor({ entry }: { entry: StockEntryDetail }) {
  const navigate = useNavigate();
  const canManage = useHasPermission(PERMISSIONS.STOCK_ENTRIES_MANAGE);
  const canConfirm = useHasPermission(PERMISSIONS.STOCK_ENTRIES_CONFIRM);
  const editable = entry.status === 'DRAFT' && canManage;

  const update = useUpdateStockEntry(entry.id);
  const replace = useReplaceStockEntryItems(entry.id);
  const confirm = useConfirmStockEntry(entry.id);
  const cancel = useCancelStockEntry(entry.id);

  const [lines, setLines] = useState<Line[]>(() => fromServer(entry.items));
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [headerDirty, setHeaderDirty] = useState(false);
  const [headerError, setHeaderError] = useState('');
  const [actionError, setActionError] = useState('');

  const linesDirty = JSON.stringify(lines) !== JSON.stringify(fromServer(entry.items));
  const parsed = toInput(lines);
  const savedExtras =
    parseMoney(entry.freightCost) + parseMoney(entry.packagingCost) + parseMoney(entry.otherCosts);
  // Mientras se edita, la vista previa usa el mismo algoritmo que la confirmación (ADR-015).
  const preview: Preview | null =
    entry.status === 'DRAFT'
      ? parsed.ok
        ? previewLines(parsed.items, savedExtras)
        : null
      : storedPreview(entry);

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
  if (headerDirty) reasons.push('Guarde la cabecera antes de confirmar.');
  if (!linesDirty) reasons.push(...entry.blockers);
  if (linesDirty && preview?.zeroValue) {
    reasons.push(
      'Hay costos adicionales pero el valor de compra es cero: indique el costo de al menos un ítem.',
    );
  }
  const canPressConfirm =
    entry.status === 'DRAFT' && canConfirm && !confirm.isPending && reasons.length === 0;

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

      {entry.status === 'CONFIRMED' && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          Confirmado por {entry.confirmedByName ?? '—'}
          {entry.confirmedAt ? ` el ${dateTime.format(new Date(entry.confirmedAt))}` : ''}. El stock
          y el último costo de cada variante ya fueron actualizados; el precio de venta no cambia.
        </p>
      )}
      {entry.status === 'CANCELLED' && (
        <p role="status" className="rounded-lg bg-stone-100 p-3 text-sm text-stone-700">
          Este ingreso fue cancelado. No generó movimientos de stock.
        </p>
      )}

      <StockEntryHeaderForm
        entry={entry}
        editable={editable}
        submitLabel="Guardar cabecera"
        pending={update.isPending}
        serverError={headerError}
        onSubmit={saveHeader}
        onDirtyChange={setHeaderDirty}
      />

      <StockEntryItems
        lines={lines}
        editable={editable}
        saving={replace.isPending}
        preview={preview}
        errors={lineErrors}
        onChange={(next) => {
          setLines(next);
          setLineErrors({});
        }}
      />

      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {actionError}
        </p>
      )}

      {entry.status === 'DRAFT' && (
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
            {canConfirm && (
              <Button disabled={!canPressConfirm} onClick={() => void confirmEntry()}>
                {confirm.isPending ? 'Confirmando…' : 'Confirmar ingreso'}
              </Button>
            )}
            {editable && (
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
    query.data.freightCost,
    query.data.packagingCost,
    query.data.otherCosts,
    query.data.supplierId,
    query.data.documentType,
    query.data.documentNumber,
    query.data.documentDate,
    query.data.notes,
  ]);
  return <Editor key={version} entry={query.data} />;
}
