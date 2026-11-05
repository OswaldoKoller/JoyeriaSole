import type { InventoryItem } from '@joyeria/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { ApiError } from '../../lib/api-client.ts';
import {
  buildInput,
  parseDelta,
  resultingQuantity,
  zeroDelta,
  type FormLine,
} from './adjustment-form.ts';
import {
  inventorySearchKey,
  searchInventory,
  useAdjustmentReasons,
  useCreateAdjustment,
  useInventorySearch,
} from './use-adjustments.ts';

const toLine = (item: InventoryItem, delta = ''): FormLine => ({
  variantId: item.variantId,
  sku: item.sku,
  productName: item.productName,
  variantLabel: item.variantLabel,
  quantity: item.quantity,
  delta,
});

/** Busca por SKU, código de barras o nombre. Un lector de códigos (texto + Enter) agrega solo. */
function VariantPicker({
  existing,
  onAdd,
}: {
  existing: ReadonlySet<string>;
  onAdd: (item: InventoryItem) => void;
}) {
  const [draft, setDraft] = useState('');
  const [term, setTerm] = useState('');
  const client = useQueryClient();
  const results = useInventorySearch(term);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.trim();
    if (value.length < 2) return;
    const found = await client.query({
      queryKey: inventorySearchKey(value),
      queryFn: () => searchInventory(value),
      staleTime: 0,
    });
    const exact = found.filter((item) => item.sku === value || item.barcode === value);
    const single = exact.length === 1 ? exact[0] : undefined;
    if (single && !existing.has(single.variantId)) {
      onAdd(single);
      setDraft('');
      setTerm('');
      return;
    }
    setTerm(value);
  }

  const found = results.data ?? [];
  return (
    <div className="space-y-3">
      <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <Input
            label="Agregar variante por SKU, código de barras o nombre"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            maxLength={100}
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="secondary">
          Buscar variante
        </Button>
      </form>
      {term.length >= 2 && results.isPending && (
        <p role="status" className="text-sm text-stone-600">
          Buscando…
        </p>
      )}
      {results.isError && (
        <p role="alert" className="text-sm text-red-700">
          No se pudo buscar la variante.
        </p>
      )}
      {results.isSuccess && found.length === 0 && (
        <p className="text-sm text-stone-600">No hay variantes activas que coincidan.</p>
      )}
      {results.isSuccess && found.length > 0 && (
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
          {found.map((item) => (
            <li key={item.variantId} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{item.productName}</span>
                {item.variantLabel && item.variantLabel !== 'Única' && (
                  <span className="text-stone-500"> · {item.variantLabel}</span>
                )}
                <span className="block font-mono text-xs text-stone-500">
                  {item.sku} · {item.quantity} en stock
                </span>
              </div>
              <Button
                variant="secondary"
                disabled={existing.has(item.variantId)}
                aria-label={`Agregar ${item.sku}`}
                onClick={() => {
                  onAdd(item);
                }}
              >
                {existing.has(item.variantId) ? 'Ya agregada' : 'Agregar'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AdjustmentForm({ initialLines }: { initialLines: FormLine[] }) {
  const navigate = useNavigate();
  const reasons = useAdjustmentReasons();
  const create = useCreateAdjustment();
  const [lines, setLines] = useState<FormLine[]>(initialLines);
  const [reasonId, setReasonId] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});

  const reasonList = reasons.data ?? [];
  const reason = reasonList.find((item) => item.id === reasonId);

  const update = (variantId: string, delta: string) => {
    setLines(lines.map((line) => (line.variantId === variantId ? { ...line, delta } : line)));
    setLineErrors({});
  };

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const result = buildInput({ reasonId, notes, lines }, reasonList);
    if (!result.ok) {
      setFormError(result.formError);
      setLineErrors(result.lineErrors);
      return;
    }
    setLineErrors({});
    try {
      const adjustment = await create.mutateAsync(result.input);
      await navigate(`/inventario/ajustes/${adjustment.id}`, { replace: true });
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'No se pudo enviar la solicitud. Intente de nuevo.',
      );
    }
  }

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="adjustment-items-title"
        className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
      >
        <h2 id="adjustment-items-title" className="text-lg font-semibold">
          Variantes a ajustar
        </h2>
        <VariantPicker
          existing={new Set(lines.map((line) => line.variantId))}
          onAdd={(item) => {
            setLines([...lines, toLine(item)]);
            setLineErrors({});
          }}
        />
        {lines.length === 0 ? (
          <p className="py-2 text-sm text-stone-600">Aún no agregó variantes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-cards w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th className="py-2 pr-3">Variante</th>
                  <th className="py-2 pr-3">Saldo actual</th>
                  <th className="py-2 pr-3">Diferencia (+ entra, − sale)</th>
                  <th className="py-2 pr-3">Quedaría</th>
                  <th className="py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const after = resultingQuantity(line);
                  const hasDelta = parseDelta(line.delta) !== null;
                  return (
                    <tr key={line.variantId} className="border-b border-stone-100 align-top">
                      <td className="py-3 pr-3">
                        <span className="block font-medium">{line.productName}</span>
                        <span className="block text-xs text-stone-500">
                          {line.variantLabel && line.variantLabel !== 'Única'
                            ? `${line.variantLabel} · `
                            : ''}
                          <span className="font-mono">{line.sku}</span>
                        </span>
                        {lineErrors[line.variantId] && (
                          <span role="alert" className="mt-1 block text-xs text-red-700">
                            {lineErrors[line.variantId]}
                          </span>
                        )}
                      </td>
                      <td data-label="Saldo actual" className="py-3 pr-3 tabular-nums">
                        {line.quantity}
                      </td>
                      <td data-label="Diferencia" className="py-3 pr-3">
                        <input
                          aria-label={`Diferencia de ${line.sku}`}
                          value={line.delta}
                          onChange={(event) => {
                            update(line.variantId, event.target.value);
                          }}
                          inputMode="numeric"
                          placeholder="-1"
                          autoComplete="off"
                          className="min-h-10 w-28 rounded-lg border border-stone-300 px-2 py-1 text-sm"
                        />
                      </td>
                      <td data-label="Quedaría" className="py-3 pr-3 tabular-nums">
                        {after === null ? (
                          '—'
                        ) : (
                          <span
                            className={after < 0 ? 'font-semibold text-red-700' : 'font-medium'}
                          >
                            {after}
                          </span>
                        )}
                        {hasDelta && after !== null && after < 0 && (
                          <span className="sr-only"> (saldo negativo no permitido)</span>
                        )}
                      </td>
                      <td className="flex flex-wrap gap-2 py-2">
                        <Button
                          variant="secondary"
                          disabled={line.quantity === 0}
                          aria-label={`Ajustar a cero ${line.sku}`}
                          onClick={() => {
                            update(line.variantId, zeroDelta(line.quantity));
                          }}
                        >
                          Ajustar a cero
                        </Button>
                        <Button
                          variant="secondary"
                          aria-label={`Quitar ${line.sku}`}
                          onClick={() => {
                            setLines(lines.filter((item) => item.variantId !== line.variantId));
                            setLineErrors({});
                          }}
                        >
                          Quitar
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Formulario aparte: el buscador de variantes de arriba es otro <form> y no pueden anidarse. */}
      <form onSubmit={(event) => void submit(event)} className="space-y-6" noValidate>
        <section
          aria-labelledby="adjustment-reason-title"
          className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
        >
          <h2 id="adjustment-reason-title" className="text-lg font-semibold">
            Motivo
          </h2>
          <div className="space-y-1">
            <label htmlFor="adjustment-reason" className="block text-sm font-medium text-stone-700">
              Motivo del ajuste
            </label>
            <select
              id="adjustment-reason"
              value={reasonId}
              onChange={(event) => {
                setReasonId(event.target.value);
              }}
              className="block min-h-10 w-full max-w-sm rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="">Elija un motivo…</option>
              {reasonList.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {reasons.isError && (
              <p role="alert" className="text-xs text-red-700">
                No se pudieron cargar los motivos.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label htmlFor="adjustment-notes" className="block text-sm font-medium text-stone-700">
              {reason?.requiresNotes ? 'Observación (obligatoria)' : 'Observación (opcional)'}
            </label>
            <textarea
              id="adjustment-notes"
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
              }}
              maxLength={2000}
              rows={3}
              required={reason?.requiresNotes ?? false}
              className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
            />
          </div>
        </section>

        {formError && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {formError}
          </p>
        )}
        <p className="text-sm text-stone-600">
          La solicitud no cambia el stock: queda pendiente hasta que el Administrador la apruebe.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Enviando…' : 'Enviar solicitud'}
          </Button>
          <Link
            to="/inventario/ajustes"
            className="inline-flex min-h-10 items-center rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}

/**
 * Nueva solicitud. Con `?sku=…` abre la variante ya cargada (desde Inventario); con `&cero=1`
 * propone sacar todo el saldo actual (atajo «Ajustar a cero» para descontinuar, B11).
 */
export function AdjustmentNewPage() {
  const [params] = useSearchParams();
  const sku = params.get('sku')?.trim() ?? '';
  const toZero = params.get('cero') === '1';
  const prefill = useQuery({
    queryKey: ['inventory', 'adjustment-prefill', sku],
    queryFn: async () => {
      const found = await searchInventory(sku);
      return found.find((item) => item.sku === sku) ?? null;
    },
    enabled: sku.length > 0,
    staleTime: 0,
  });

  const waiting = sku.length > 0 && prefill.isPending;
  const initialLines = prefill.data
    ? [toLine(prefill.data, toZero ? zeroDelta(prefill.data.quantity) : '')]
    : [];

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <Link
          to="/inventario/ajustes"
          className="inline-flex min-h-10 items-center text-sm text-brand-700 underline"
        >
          ← Ajustes de inventario
        </Link>
        <h1 className="text-2xl font-semibold">Solicitar ajuste</h1>
        <p className="text-sm text-stone-600">
          Indique cuántas piezas entran o salen de cada variante y el motivo. El Administrador
          revisa y aprueba.
        </p>
      </div>
      {waiting ? (
        <p role="status" className="text-sm">
          Cargando la variante…
        </p>
      ) : (
        <>
          {sku && prefill.data === null && (
            <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              No se encontró una variante activa con el SKU {sku}.
            </p>
          )}
          <AdjustmentForm initialLines={initialLines} />
        </>
      )}
    </section>
  );
}
