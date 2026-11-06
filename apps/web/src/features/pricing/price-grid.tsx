import { PERMISSIONS, type PricingVariant } from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useHasPermission } from '../auth/use-auth.ts';
import { useCategories } from '../catalog/use-categories.ts';
import { formatBsPrecise } from '../../lib/format.ts';
import { parsePriceInput } from './price-math.ts';
import { ProfitDisplay } from './profit-display.tsx';
import { useApplyPrices, usePricingVariants, useRequestPrices } from './use-pricing.ts';
import { PriceHistoryPanel } from './variant-price-history.tsx';
import { PieceImage } from '../catalog/photos/piece-image.tsx';
import { Pagination } from '../../components/ui/pagination.tsx';

/**
 * Panel de precios (Q-04, Q-06): por variante muestra el panel de costos (solo con `costs:read`),
 * el precio vigente y un campo «Nuevo precio» con la ganancia en vivo. El Responsable envía una
 * solicitud; el Administrador aplica el cambio de inmediato (queda aprobado por él mismo).
 */
export function PriceGrid({ initialSearch }: { initialSearch: string }) {
  const canApprove = useHasPermission(PERMISSIONS.PRICES_APPROVE);
  const [page, setPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [categoryId, setCategoryId] = useState('');
  const [noPrice, setNoPrice] = useState(false);
  const [withPending, setWithPending] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [historyFor, setHistoryFor] = useState<{ variantId: string; sku: string } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const categories = useCategories();
  const list = usePricingVariants({ page, q: search, categoryId, noPrice, withPending });
  const request = useRequestPrices();
  const apply = useApplyPrices();
  const rows = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;
  const showCosts = rows.some((row) => row.costs !== null);
  const busy = request.isPending || apply.isPending;

  // Cambios listos para enviar: seleccionados y con un precio válido escrito.
  const ready = [...selected].flatMap((variantId) => {
    const parsed = parsePriceInput(drafts[variantId] ?? '');
    return parsed.status === 'valid' ? [{ variantId, newPrice: parsed.value }] : [];
  });

  function submitSearch(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
  }

  function setDraft(variantId: string, text: string) {
    setDrafts((current) => ({ ...current, [variantId]: text }));
    setSelected((current) => {
      const next = new Set(current);
      if (text.trim() === '') next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  }

  function toggle(variantId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(variantId);
      else next.delete(variantId);
      return next;
    });
  }

  async function submit() {
    setMessage('');
    setError('');
    if (ready.length === 0) {
      setError('Escriba un nuevo precio válido en al menos una fila seleccionada.');
      return;
    }
    const input = { items: ready, reason: reason.trim() || null };
    try {
      if (canApprove) {
        await apply.mutateAsync(input);
        setMessage(
          ready.length === 1
            ? 'Se aplicó 1 precio nuevo.'
            : `Se aplicaron ${String(ready.length)} precios nuevos.`,
        );
      } else {
        await request.mutateAsync(input);
        setMessage(
          ready.length === 1
            ? 'Se envió 1 solicitud de cambio de precio al Administrador.'
            : `Se enviaron ${String(ready.length)} solicitudes de cambio de precio al Administrador.`,
        );
      }
      const sent = new Set(ready.map((item) => item.variantId));
      setDrafts((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => !sent.has(id))),
      );
      setSelected(new Set());
      setReason('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el cambio de precio');
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        <form onSubmit={submitSearch} className="flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1">
            <Input
              label="Buscar por SKU, nombre o código de barras"
              value={draftSearch}
              onChange={(event) => {
                setDraftSearch(event.target.value);
              }}
              maxLength={100}
            />
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
          <div className="space-y-1">
            <label htmlFor="pricing-category" className="block text-sm font-medium text-stone-700">
              Categoría
            </label>
            <select
              id="pricing-category"
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value);
                setPage(1);
              }}
              className="min-h-10 rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="">Todas</option>
              {(categories.data?.data ?? [])
                .filter((category) => category.isActive)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </div>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={noPrice}
              onChange={(event) => {
                setNoPrice(event.target.checked);
                setPage(1);
              }}
              className="size-4"
            />
            Solo sin precio
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={withPending}
              onChange={(event) => {
                setWithPending(event.target.checked);
                setPage(1);
              }}
              className="size-4"
            />
            Con cambios pendientes
          </label>
        </form>
      </div>

      {message && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        {list.isPending && (
          <p role="status" className="py-6 text-sm">
            Cargando precios…
          </p>
        )}
        {list.isError && (
          <p role="alert" className="py-6 text-sm text-red-700">
            No se pudieron cargar los precios.{' '}
            <button className="underline" onClick={() => void list.refetch()}>
              Reintentar
            </button>
          </p>
        )}
        {list.isSuccess && rows.length === 0 && (
          <p className="py-6 text-sm text-stone-600">No se encontraron variantes.</p>
        )}
        {list.isSuccess && rows.length > 0 && (
          <div aria-busy={list.isPlaceholderData} className="overflow-x-auto">
            <table className="table-cards w-full text-left text-sm">
              <caption className="sr-only">
                Precios de venta por variante, con costos y ganancia
              </caption>
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th className="py-2 pr-3">Ítem</th>
                  <th className="py-2 pr-3">Stock</th>
                  {showCosts && <th className="py-2 pr-3">Precio de compra (Bs)</th>}
                  {showCosts && <th className="py-2 pr-3">Subtotal de compra (Bs)</th>}
                  {showCosts && <th className="py-2 pr-3">Costos adicionales por pieza</th>}
                  {showCosts && <th className="py-2 pr-3">Costo total unitario</th>}
                  <th className="py-2 pr-3">Precio de venta (neto)</th>
                  {showCosts && <th className="py-2 pr-3">Ganancia vigente</th>}
                  <th className="py-2 pr-3">Nuevo precio</th>
                  {showCosts && <th className="py-2 pr-3">Ganancia con el nuevo precio</th>}
                  <th className="py-2">Historial</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <PriceRow
                    key={row.variantId}
                    row={row}
                    showCosts={showCosts}
                    draft={drafts[row.variantId] ?? ''}
                    checked={selected.has(row.variantId)}
                    onDraft={(text) => {
                      setDraft(row.variantId, text);
                    }}
                    onToggle={(checked) => {
                      toggle(row.variantId, checked);
                    }}
                    onHistory={() => {
                      setHistoryFor({ variantId: row.variantId, sku: row.sku });
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {historyFor && (
          <div className="mt-4 space-y-2 rounded-lg border border-stone-200 p-3">
            <PriceHistoryPanel key={historyFor.variantId} {...historyFor} />
            <Button
              variant="secondary"
              onClick={() => {
                setHistoryFor(null);
              }}
            >
              Cerrar historial
            </Button>
          </div>
        )}

        {list.isSuccess && (
          <Pagination page={page} total={total} noun="variantes" onPageChange={setPage} />
        )}
      </div>

      <div
        role="region"
        aria-label="Enviar cambios de precio"
        className="sticky bottom-0 flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-md"
      >
        <div className="min-w-52 flex-1">
          <Input
            label="Motivo del cambio (opcional)"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
            maxLength={500}
          />
        </div>
        <Button disabled={busy || ready.length === 0} onClick={() => void submit()}>
          {canApprove ? 'Aplicar ahora' : 'Solicitar cambio'} ({ready.length})
        </Button>
        <p className="w-full text-xs text-stone-600">
          {canApprove
            ? 'Como Administrador, el cambio rige de inmediato y queda en el historial a su nombre.'
            : 'El cambio no rige hasta que el Administrador lo apruebe.'}
        </p>
      </div>
    </div>
  );
}

function PriceRow({
  row,
  showCosts,
  draft,
  checked,
  onDraft,
  onToggle,
  onHistory,
}: {
  row: PricingVariant;
  showCosts: boolean;
  draft: string;
  checked: boolean;
  onDraft: (text: string) => void;
  onToggle: (checked: boolean) => void;
  onHistory: () => void;
}) {
  const parsed = parsePriceInput(draft);
  const cost = row.costs?.totalUnitCost ?? null;
  const hasPrice = Number(row.salePrice) > 0;
  const entryNumber = row.costs?.lastEntryNumber ?? null;
  const purchaseQty = row.costs?.purchaseQty ?? null;
  const errorId = `price-error-${row.variantId}`;
  const pendingId = `price-pending-${row.variantId}`;
  return (
    <tr className="border-b border-stone-100 align-top">
      <td className="py-3 pr-3">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => {
              onToggle(event.target.checked);
            }}
            disabled={row.pending !== null}
            aria-label={`Seleccionar ${row.sku}`}
            className="mt-1 size-4"
          />
          <span>
            <PieceImage variantId={row.variantId} className="float-left mr-3 size-12" />
            <span className="block font-medium">{row.productName}</span>
            <span className="block text-xs font-normal text-stone-500">
              {row.variantLabel && row.variantLabel !== 'Única' ? `${row.variantLabel} · ` : ''}
              <span className="font-mono">{row.sku}</span> · {row.categoryName}
            </span>
          </span>
        </label>
      </td>
      <td data-label="Stock" className="py-3 pr-3 tabular-nums">
        {row.stockQuantity ?? '—'}
      </td>
      {showCosts && (
        <td data-label="Precio de compra (Bs)" className="py-3 pr-3 tabular-nums">
          {formatBsPrecise(row.costs?.purchaseUnitCost)}
          {entryNumber !== null && (
            <span className="block text-xs text-stone-500">
              ING-{String(entryNumber).padStart(6, '0')}
            </span>
          )}
        </td>
      )}
      {showCosts && (
        <td data-label="Subtotal de compra (Bs)" className="py-3 pr-3 tabular-nums">
          {formatBsPrecise(row.costs?.purchaseSubtotal)}
          {purchaseQty !== null && (
            <span className="block text-xs text-stone-500">{purchaseQty} piezas</span>
          )}
        </td>
      )}
      {showCosts && (
        <td data-label="Costos adicionales por pieza" className="py-3 pr-3 tabular-nums">
          {formatBsPrecise(row.costs?.extraUnitCost)}
        </td>
      )}
      {showCosts && (
        <td data-label="Costo total unitario" className="py-3 pr-3 font-medium tabular-nums">
          {formatBsPrecise(cost)}
        </td>
      )}
      <td data-label="Precio de venta (neto)" className="py-3 pr-3 tabular-nums">
        {hasPrice ? (
          formatBsPrecise(row.salePrice)
        ) : (
          <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
            Sin precio
          </span>
        )}
        {row.pending && (
          <span id={pendingId} className="mt-1 block text-xs text-amber-800">
            Pendiente: {formatBsPrecise(row.pending.newPrice)} (solicitó{' '}
            {row.pending.requestedByName})
          </span>
        )}
      </td>
      {showCosts && (
        <td data-label="Ganancia vigente" className="py-3 pr-3">
          {hasPrice ? (
            <ProfitDisplay price={row.salePrice} totalCost={cost} label="del precio vigente" />
          ) : (
            '—'
          )}
        </td>
      )}
      <td data-label="Nuevo precio" className="py-3 pr-3">
        <input
          inputMode="decimal"
          autoComplete="off"
          value={draft}
          disabled={row.pending !== null}
          onChange={(event) => {
            onDraft(event.target.value);
          }}
          aria-label={`Nuevo precio de ${row.sku}`}
          aria-invalid={parsed.status === 'invalid'}
          aria-describedby={
            parsed.status === 'invalid' ? errorId : row.pending ? pendingId : undefined
          }
          placeholder="0,00"
          className="block min-h-10 w-28 rounded-lg border border-stone-300 px-3 py-2 text-sm tabular-nums shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:bg-stone-100 aria-invalid:border-red-500"
        />
        {parsed.status === 'invalid' && (
          <p id={errorId} className="mt-1 max-w-48 text-xs text-red-600">
            {parsed.message}
          </p>
        )}
      </td>
      {showCosts && (
        <td data-label="Ganancia con el nuevo precio" className="py-3 pr-3" aria-live="polite">
          {parsed.status === 'valid' ? (
            <ProfitDisplay price={parsed.value} totalCost={cost} label="del nuevo precio" />
          ) : (
            '—'
          )}
        </td>
      )}
      <td data-label="Historial" className="py-3">
        <Button
          variant="secondary"
          onClick={onHistory}
          aria-label={`Ver historial de precios de ${row.sku}`}
        >
          Historial
        </Button>
      </td>
    </tr>
  );
}
