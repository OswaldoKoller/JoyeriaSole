import type { StockEntryCurrency } from '@joyeria/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { formatBsPrecise, formatUsd } from '../../lib/format.ts';
import type { Line } from './lines.ts';
import { searchVariants, useVariantSearch, variantSearchKey } from './use-stock-entries.ts';
import { PieceImage } from '../catalog/photos/piece-image.tsx';

interface VariantPickerProps {
  existing: ReadonlySet<string>;
  onAdd: (line: Pick<Line, 'variantId' | 'sku' | 'productName' | 'variantLabel'>) => void;
}

/** Busca por SKU, código de barras o nombre. Un lector de códigos (texto + Enter) agrega solo. */
function VariantPicker({ existing, onAdd }: VariantPickerProps) {
  const [draft, setDraft] = useState('');
  const [term, setTerm] = useState('');
  const client = useQueryClient();
  const results = useVariantSearch(term);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.trim();
    if (value.length < 2) return;
    // Se resuelve aquí (no al renderizar): si el código es exacto y único, se agrega solo.
    const found = await client.query({
      queryKey: variantSearchKey(value),
      queryFn: () => searchVariants(value),
      staleTime: 30_000,
    });
    const exact = found.filter(
      (variant) => variant.sku === value || (variant.barcode !== null && variant.barcode === value),
    );
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
          No se pudo buscar. Su cuenta necesita permiso de lectura del catálogo.
        </p>
      )}
      {results.isSuccess && found.length === 0 && (
        <p className="text-sm text-stone-600">No hay variantes activas que coincidan.</p>
      )}
      {results.isSuccess && found.length > 0 && (
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
          {found.map((variant) => (
            <li key={variant.variantId} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <PieceImage variantId={variant.variantId} />
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{variant.productName}</span>
                {variant.variantLabel && variant.variantLabel !== 'Única' && (
                  <span className="text-stone-500"> · {variant.variantLabel}</span>
                )}
                <span className="block font-mono text-xs text-stone-500">{variant.sku}</span>
              </div>
              <Button
                variant="secondary"
                disabled={existing.has(variant.variantId)}
                aria-label={`Agregar ${variant.sku}`}
                onClick={() => {
                  onAdd(variant);
                }}
              >
                {existing.has(variant.variantId) ? 'Ya agregada' : 'Agregar'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ItemsProps {
  lines: Line[];
  currency: StockEntryCurrency;
  editable: boolean;
  /** Mientras se guarda, los campos se bloquean para no perder lo que se escriba en ese instante. */
  saving?: boolean;
  errors: Record<string, string>;
  onChange: (lines: Line[]) => void;
}

const money = (value: string, currency: StockEntryCurrency) =>
  value === '' ? '—' : currency === 'USD' ? formatUsd(value) : formatBsPrecise(value);

/** Ítems del borrador: cantidades, precio de compra en la moneda del ingreso y diferencias (C2). */
export function StockEntryItems({
  lines,
  currency,
  editable,
  saving = false,
  errors,
  onChange,
}: ItemsProps) {
  const update = (variantId: string, patch: Partial<Line>) => {
    onChange(lines.map((line) => (line.variantId === variantId ? { ...line, ...patch } : line)));
  };
  const priceLabel = `Precio de compra (${currency === 'USD' ? 'USD' : 'Bs'})`;

  return (
    <section
      aria-labelledby="entry-items-title"
      className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
    >
      <h2 id="entry-items-title" className="text-lg font-semibold">
        Ítems recibidos
      </h2>
      <fieldset disabled={saving} className="m-0 min-w-0 space-y-4 border-0 p-0">
        {editable && (
          <VariantPicker
            existing={new Set(lines.map((line) => line.variantId))}
            onAdd={(variant) => {
              onChange([
                ...lines,
                {
                  ...variant,
                  profileIncomplete: false,
                  expectedQty: '',
                  receivedQty: '1',
                  unitPrice: '0',
                  differenceReason: '',
                  notes: '',
                },
              ]);
            }}
          />
        )}

        {lines.length === 0 ? (
          <p className="py-4 text-sm text-stone-600">Aún no hay ítems en este ingreso.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-cards w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th className="py-2 pr-3">Variante</th>
                  <th className="py-2 pr-3">Esperada</th>
                  <th className="py-2 pr-3">Recibida</th>
                  <th className="py-2 pr-3">Diferencia</th>
                  <th className="py-2 pr-3">{priceLabel}</th>
                  {editable && <th className="py-2">Quitar</th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const expected = line.expectedQty.trim() === '' ? null : Number(line.expectedQty);
                  const received = Number(line.receivedQty);
                  const difference =
                    expected !== null && Number.isFinite(received) && Number.isFinite(expected)
                      ? received - expected
                      : null;
                  const reasonId = `reason-${line.variantId}`;
                  return (
                    <tr key={line.variantId} className="border-b border-stone-100 align-top">
                      <td className="py-3 pr-3">
                        <PieceImage
                          variantId={line.variantId}
                          className="float-left mr-3 size-12"
                        />
                        <span className="block font-medium">{line.productName}</span>
                        <span className="block text-xs font-normal text-stone-500">
                          {line.variantLabel && line.variantLabel !== 'Única'
                            ? `${line.variantLabel} · `
                            : ''}
                          <span className="font-mono">{line.sku}</span>
                        </span>
                        {line.profileIncomplete && (
                          <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                            Ficha incompleta
                          </span>
                        )}
                        {difference !== null && difference !== 0 && (
                          <span className="mt-2 block text-left font-normal">
                            {editable ? (
                              <>
                                <label
                                  htmlFor={reasonId}
                                  className="block text-xs font-medium text-amber-800"
                                >
                                  Justificación de la diferencia de {line.sku}
                                </label>
                                <input
                                  id={reasonId}
                                  value={line.differenceReason}
                                  onChange={(event) => {
                                    update(line.variantId, {
                                      differenceReason: event.target.value,
                                    });
                                  }}
                                  maxLength={500}
                                  placeholder="Obligatoria para confirmar"
                                  className="mt-1 block min-h-10 w-full rounded-lg border border-stone-300 px-2 py-1 text-sm"
                                />
                              </>
                            ) : (
                              <span className="block text-xs text-stone-600">
                                Justificación: {line.differenceReason || '—'}
                              </span>
                            )}
                          </span>
                        )}
                        {errors[line.variantId] && (
                          <span role="alert" className="mt-1 block text-xs text-red-700">
                            {errors[line.variantId]}
                          </span>
                        )}
                      </td>
                      <td data-label="Esperada" className="py-3 pr-3">
                        {editable ? (
                          <input
                            aria-label={`Cantidad esperada de ${line.sku}`}
                            value={line.expectedQty}
                            onChange={(event) => {
                              update(line.variantId, { expectedQty: event.target.value });
                            }}
                            inputMode="numeric"
                            className="min-h-10 w-24 rounded-lg border border-stone-300 px-2 py-1 text-sm"
                          />
                        ) : (
                          line.expectedQty || '—'
                        )}
                      </td>
                      <td data-label="Recibida" className="py-3 pr-3">
                        {editable ? (
                          <input
                            aria-label={`Cantidad recibida de ${line.sku}`}
                            value={line.receivedQty}
                            onChange={(event) => {
                              update(line.variantId, { receivedQty: event.target.value });
                            }}
                            inputMode="numeric"
                            className="min-h-10 w-24 rounded-lg border border-stone-300 px-2 py-1 text-sm"
                          />
                        ) : (
                          <strong>{line.receivedQty}</strong>
                        )}
                      </td>
                      <td data-label="Diferencia" className="py-3 pr-3">
                        {difference === null ? (
                          '—'
                        ) : (
                          <span className={difference === 0 ? '' : 'font-medium text-amber-700'}>
                            {difference > 0 ? `+${difference}` : difference}
                          </span>
                        )}
                      </td>
                      <td data-label={priceLabel} className="py-3 pr-3">
                        {editable ? (
                          <input
                            aria-label={`Precio de compra de ${line.sku}`}
                            value={line.unitPrice}
                            onChange={(event) => {
                              update(line.variantId, { unitPrice: event.target.value });
                            }}
                            inputMode="decimal"
                            className="min-h-10 w-28 rounded-lg border border-stone-300 px-2 py-1 text-sm"
                          />
                        ) : (
                          money(line.unitPrice, currency)
                        )}
                      </td>
                      {editable && (
                        <td className="py-2">
                          <Button
                            variant="secondary"
                            aria-label={`Quitar ${line.sku}`}
                            onClick={() => {
                              onChange(lines.filter((item) => item.variantId !== line.variantId));
                            }}
                          >
                            Quitar
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </fieldset>
    </section>
  );
}
