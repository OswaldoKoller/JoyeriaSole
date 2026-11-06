import type { Product, VariantLookup } from '@joyeria/shared';
import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { LabelPage, LabelPrintArea } from './label.tsx';
import {
  DEFAULT_LABEL_SIZE,
  LABEL_SIZE_LIMITS,
  MAX_COPIES_PER_VARIANT,
  MAX_LABELS_PER_PRINT,
  expandCopies,
  loadLabelSize,
  parseLabelSize,
  saveLabelSize,
  totalLabels,
  type LabelSize,
} from './label-settings.ts';
import { PieceImage } from './photos/piece-image.tsx';
import { lookupVariant, searchCatalog } from './use-products.ts';

type Item = {
  variantId: string;
  sku: string;
  productName: string;
  label: string | null;
  copies: number;
};
type Candidate = { variantId: string; sku: string; productName: string; label: string | null };

const PREVIEW_LIMIT = 12;

function candidatesOf(products: Product[]): Candidate[] {
  return products.flatMap((product) =>
    product.variants.map((variant) => ({
      variantId: variant.id,
      sku: variant.sku,
      productName: product.name,
      label: variant.label,
    })),
  );
}

/**
 * Etiquetas propias (Q-10 A, B7): todas las piezas llevan solo el Code 128 del SKU y el SKU
 * legible. Se eligen piezas buscando o escaneando (el lector escribe el código y pulsa Enter),
 * se define cuántas copias y el tamaño de la etiqueta, y se imprime desde el navegador.
 */
export function LabelsPage() {
  const [params] = useSearchParams();
  const [items, setItems] = useState<Item[]>([]);
  const [codeDraft, setCodeDraft] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [size, setSize] = useState<LabelSize>(() => loadLabelSize());
  const [widthDraft, setWidthDraft] = useState(String(size.widthMm));
  const [heightDraft, setHeightDraft] = useState(String(size.heightMm));
  const [sizeError, setSizeError] = useState('');
  const loadedFromUrl = useRef(false);

  function addItem(piece: Candidate) {
    setItems((current) => {
      const existing = current.find((item) => item.sku === piece.sku);
      if (!existing) return [...current, { ...piece, copies: 1 }];
      return current.map((item) =>
        item.sku === piece.sku
          ? { ...item, copies: Math.min(item.copies + 1, MAX_COPIES_PER_VARIANT) }
          : item,
      );
    });
  }

  function fromLookup(found: VariantLookup): Candidate {
    return {
      variantId: found.variantId,
      sku: found.sku,
      productName: found.productName,
      label: found.label,
    };
  }

  // Desde la ficha del producto o de una variante: ?codes=SKU-000001,SKU-000002
  useEffect(() => {
    if (loadedFromUrl.current) return;
    loadedFromUrl.current = true;
    const codes = (params.get('codes') ?? '')
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean)
      .slice(0, 50);
    if (codes.length === 0) return;
    void (async () => {
      for (const code of codes) {
        try {
          addItem(fromLookup((await lookupVariant(code)).data));
        } catch {
          setError(`No se encontró la pieza con código ${code}.`);
        }
      }
    })();
  }, [params]);

  async function submitCode(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = codeDraft.trim();
    if (!term) return;
    setError('');
    setMessage('');
    setCandidates([]);
    try {
      const { data } = await lookupVariant(term);
      addItem(fromLookup(data));
      setMessage(`Agregada: ${data.productName} (${data.sku}).`);
      setCodeDraft('');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status !== 404) {
        setError(cause.message);
        return;
      }
      // No es un código exacto: se ofrece una lista para elegir a mano.
      try {
        const found = candidatesOf(await searchCatalog(term));
        setCandidates(found);
        if (found.length === 0) setError(`No se encontró ninguna pieza para «${term}».`);
      } catch {
        setError('No se pudo buscar en el catálogo.');
      }
    }
  }

  function applySize(width: string, height: string) {
    setWidthDraft(width);
    setHeightDraft(height);
    const parsed = parseLabelSize(width, height);
    if (!parsed) {
      setSizeError(
        `Use un ancho de ${LABEL_SIZE_LIMITS.minWidth} a ${LABEL_SIZE_LIMITS.maxWidth} mm y un alto de ${LABEL_SIZE_LIMITS.minHeight} a ${LABEL_SIZE_LIMITS.maxHeight} mm.`,
      );
      return;
    }
    setSizeError('');
    setSize(parsed);
    saveLabelSize(parsed);
  }

  const requests = useMemo(
    () => items.map((item) => ({ sku: item.sku, copies: item.copies })),
    [items],
  );
  const total = totalLabels(requests);
  const tooMany = total > MAX_LABELS_PER_PRINT;
  const printable = useMemo(() => expandCopies(requests), [requests]);
  const preview = items.slice(0, PREVIEW_LIMIT);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Etiquetas</h1>
        <p className="text-sm text-stone-600">
          Cada etiqueta lleva únicamente el código de barras Code 128 del SKU y el SKU legible.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
        <h2 className="text-lg font-semibold">Piezas</h2>
        <form
          onSubmit={(event) => void submitCode(event)}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="min-w-52 flex-1">
            <Input
              label="Escanee o escriba un SKU, código o nombre"
              value={codeDraft}
              onChange={(event) => {
                setCodeDraft(event.target.value);
              }}
              maxLength={100}
              autoComplete="off"
            />
          </div>
          <Button type="submit" variant="secondary">
            Agregar
          </Button>
        </form>
        {message && (
          <p role="status" className="text-sm text-emerald-800">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {candidates.length > 0 && (
          <ul aria-label="Resultados de la búsqueda" className="divide-y divide-stone-100 text-sm">
            {candidates.map((candidate) => (
              <li key={candidate.sku} className="flex items-center justify-between gap-2 py-2">
                <span className="flex items-center gap-3">
                  <PieceImage variantId={candidate.variantId} />
                  <span>
                    {candidate.productName}
                    {candidate.label && candidate.label !== 'Única'
                      ? ` · ${candidate.label}`
                      : ''}{' '}
                    <span className="text-stone-600">({candidate.sku})</span>
                  </span>
                </span>
                <Button
                  variant="secondary"
                  aria-label={`Agregar etiqueta de ${candidate.sku}`}
                  onClick={() => {
                    addItem(candidate);
                    setCandidates([]);
                    setCodeDraft('');
                  }}
                >
                  Agregar
                </Button>
              </li>
            ))}
          </ul>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-stone-600">Aún no hay piezas seleccionadas.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Piezas y cantidad de etiquetas</caption>
            <thead>
              <tr className="border-b border-stone-200 text-stone-600">
                <th scope="col" className="py-2 pr-2 font-medium">
                  Pieza
                </th>
                <th scope="col" className="py-2 pr-2 font-medium">
                  SKU
                </th>
                <th scope="col" className="py-2 pr-2 font-medium">
                  Copias
                </th>
                <th scope="col" className="py-2 font-medium">
                  <span className="sr-only">Quitar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.sku} className="border-b border-stone-100">
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-3">
                      <PieceImage variantId={item.variantId} className="size-10" />
                      <span>
                        {item.productName}
                        {item.label && item.label !== 'Única' ? ` · ${item.label}` : ''}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 pr-2 font-mono">{item.sku}</td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={1}
                      max={MAX_COPIES_PER_VARIANT}
                      step={1}
                      value={item.copies}
                      aria-label={`Copias de ${item.sku}`}
                      onChange={(event) => {
                        const copies = Math.min(
                          Math.max(Math.floor(Number(event.target.value) || 1), 1),
                          MAX_COPIES_PER_VARIANT,
                        );
                        setItems((current) =>
                          current.map((entry) =>
                            entry.sku === item.sku ? { ...entry, copies } : entry,
                          ),
                        );
                      }}
                      className="block min-h-10 w-24 rounded-lg border border-stone-300 px-3 py-2 text-sm"
                    />
                  </td>
                  <td className="py-2 text-right">
                    <Button
                      variant="secondary"
                      aria-label={`Quitar ${item.sku}`}
                      onClick={() => {
                        setItems((current) => current.filter((entry) => entry.sku !== item.sku));
                      }}
                    >
                      Quitar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
        <h2 className="text-lg font-semibold">Tamaño de la etiqueta</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36">
            <Input
              label="Ancho (mm)"
              inputMode="decimal"
              value={widthDraft}
              onChange={(event) => {
                applySize(event.target.value, heightDraft);
              }}
            />
          </div>
          <div className="w-36">
            <Input
              label="Alto (mm)"
              inputMode="decimal"
              value={heightDraft}
              onChange={(event) => {
                applySize(widthDraft, event.target.value);
              }}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              applySize(String(DEFAULT_LABEL_SIZE.widthMm), String(DEFAULT_LABEL_SIZE.heightMm));
            }}
          >
            Restablecer {DEFAULT_LABEL_SIZE.widthMm} × {DEFAULT_LABEL_SIZE.heightMm} mm
          </Button>
        </div>
        <p className="text-xs text-stone-600">
          Se recuerda en este navegador. Use el tamaño real del rollo o papel de su impresora.
        </p>
        {sizeError && (
          <p role="alert" className="text-sm text-red-700">
            {sizeError}
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Vista previa</h2>
          <Button
            disabled={total === 0 || tooMany}
            onClick={() => {
              window.print();
            }}
          >
            Imprimir{' '}
            {total > 0 ? `${total} ${total === 1 ? 'etiqueta' : 'etiquetas'}` : 'etiquetas'}
          </Button>
        </div>
        {tooMany && (
          <p role="alert" className="text-sm text-red-700">
            Son demasiadas etiquetas para una sola impresión (máximo {MAX_LABELS_PER_PRINT}).
            Reduzca las copias.
          </p>
        )}
        <p className="text-xs text-stone-600">
          Se imprime una etiqueta por página, con el tamaño indicado y sin márgenes, en cualquier
          impresora. Para guardar un PDF elija «Guardar como PDF» en el cuadro de impresión del
          navegador.
        </p>
        {items.length === 0 ? (
          <p className="text-sm text-stone-600">Agregue piezas para ver las etiquetas.</p>
        ) : (
          <div className="flex flex-wrap gap-3" aria-label="Vista previa de etiquetas">
            {preview.map((item) => (
              <div key={item.sku} className="border border-dashed border-stone-400">
                <LabelPage sku={item.sku} size={size} />
              </div>
            ))}
          </div>
        )}
        {items.length > PREVIEW_LIMIT && (
          <p className="text-xs text-stone-600">
            Se muestran las primeras {PREVIEW_LIMIT} piezas; se imprimirán todas.
          </p>
        )}
      </div>
      {printable.length > 0 && !tooMany && <LabelPrintArea skus={printable} size={size} />}
    </section>
  );
}
