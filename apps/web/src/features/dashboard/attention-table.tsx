import type { InventoryItem } from '@joyeria/shared';
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  CircleCheck,
  PackageX,
  TriangleAlert,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Skeleton } from '../../components/ui/skeleton.tsx';
import { PieceImage } from '../catalog/photos/piece-image.tsx';

type SortKey = 'product' | 'sku' | 'quantity' | 'minStock' | 'level';
type Direction = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'product', label: 'Producto' },
  { key: 'sku', label: 'SKU' },
  { key: 'quantity', label: 'Piezas', numeric: true },
  { key: 'minStock', label: 'Mínimo', numeric: true },
  { key: 'level', label: 'Estado' },
];

const LEVEL_RANK: Record<InventoryItem['level'], number> = { OUT: 0, LOW: 1, OK: 2 };
const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

function compare(a: InventoryItem, b: InventoryItem, key: SortKey) {
  switch (key) {
    case 'product':
      return collator.compare(
        `${a.productName} ${a.variantLabel ?? ''}`,
        `${b.productName} ${b.variantLabel ?? ''}`,
      );
    case 'sku':
      return collator.compare(a.sku, b.sku);
    case 'quantity':
      return a.quantity - b.quantity;
    case 'minStock':
      return a.minStock - b.minStock;
    case 'level':
      return LEVEL_RANK[a.level] - LEVEL_RANK[b.level];
  }
}

function StatusBadge({ level }: { level: InventoryItem['level'] }) {
  if (level === 'OUT') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
        <PackageX className="size-3.5" aria-hidden="true" /> Sin stock
      </span>
    );
  }
  if (level === 'LOW') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
        <TriangleAlert className="size-3.5" aria-hidden="true" /> Bajo mínimo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
      <CircleCheck className="size-3.5" aria-hidden="true" /> Disponible
    </span>
  );
}

type AttentionTableProps = {
  items: InventoryItem[];
  /** Total real de piezas en alerta (puede superar las filas cargadas). */
  expectedTotal: number | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
};

const SKELETON_ROWS = 5;

export function AttentionTable({
  items,
  expectedTotal,
  isPending,
  isError,
  onRetry,
}: AttentionTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction }>({
    key: 'level',
    direction: 'asc',
  });

  const sorted = useMemo(() => {
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...items].sort(
      (a, b) =>
        compare(a, b, sort.key) * factor ||
        a.quantity - b.quantity ||
        collator.compare(a.sku, b.sku),
    );
  }, [items, sort]);

  function toggle(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  }

  const shown = sorted.length;
  const total = expectedTotal ?? shown;

  return (
    <div>
      {isError ? (
        <div role="alert" className="flex flex-col items-start gap-3 py-8 text-sm text-red-700">
          <p>No se pudieron cargar las piezas en alerta.</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-red-200 bg-white px-3 py-2 font-medium transition-all duration-200 ease-out hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98]"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2 @4xl:hidden">
            <label htmlFor="attention-sort" className="text-xs font-medium text-stone-600">
              Ordenar por
            </label>
            <select
              id="attention-sort"
              value={sort.key}
              disabled={isPending}
              onChange={(event) => {
                setSort({ key: event.target.value as SortKey, direction: 'asc' });
              }}
              className="min-h-10 flex-1 rounded-lg border border-stone-300 bg-white px-3 text-sm focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            >
              {COLUMNS.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setSort((current) => ({
                  ...current,
                  direction: current.direction === 'asc' ? 'desc' : 'asc',
                }));
              }}
              aria-label={sort.direction === 'asc' ? 'Orden ascendente' : 'Orden descendente'}
              className="flex size-10 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 transition-all duration-200 ease-out hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none active:scale-95 disabled:opacity-60"
            >
              {sort.direction === 'asc' ? (
                <ArrowUp className="size-4" aria-hidden="true" />
              ) : (
                <ArrowDown className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
          <div className="-mx-1 overflow-auto px-1 @4xl:max-h-[26rem]">
            <table
              className="table-cards w-full text-left text-sm @4xl:min-w-[34rem]"
              aria-busy={isPending}
            >
              <caption className="sr-only">
                Piezas sin stock o bajo su mínimo. Use los encabezados para ordenar.
              </caption>
              <thead>
                <tr className="sticky top-0 z-10 border-b border-stone-200 bg-white text-xs tracking-wider text-stone-500 uppercase">
                  {COLUMNS.map((column) => {
                    const active = sort.key === column.key;
                    const Icon = !active
                      ? ChevronsUpDown
                      : sort.direction === 'asc'
                        ? ArrowUp
                        : ArrowDown;
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        aria-sort={
                          active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                        }
                        className={`py-2 pr-3 font-semibold ${column.numeric ? 'text-right' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            toggle(column.key);
                          }}
                          disabled={isPending}
                          className={`inline-flex items-center gap-1.5 rounded-md px-1 py-1 tracking-wider uppercase transition-colors duration-200 ease-out hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60 ${
                            active ? 'text-stone-900' : ''
                          } ${column.numeric ? 'flex-row-reverse' : ''}`}
                        >
                          {column.label}
                          <Icon
                            className={`size-3.5 ${active ? '' : 'opacity-50'}`}
                            aria-hidden="true"
                          />
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {isPending &&
                  Array.from({ length: SKELETON_ROWS }, (_, index) => (
                    <tr key={index} className="border-b border-stone-100">
                      <td className="py-3 pr-3">
                        <Skeleton className="h-9 w-44" />
                      </td>
                      <td className="py-3 pr-3">
                        <Skeleton className="h-4 w-20" />
                      </td>
                      <td className="py-3 pr-3">
                        <Skeleton className="ml-auto h-4 w-8" />
                      </td>
                      <td className="py-3 pr-3">
                        <Skeleton className="ml-auto h-4 w-8" />
                      </td>
                      <td className="py-3 pr-3">
                        <Skeleton className="h-6 w-24 rounded-full" />
                      </td>
                    </tr>
                  ))}
                {!isPending &&
                  sorted.map((item) => (
                    <tr
                      key={item.variantId}
                      className="border-b border-stone-100 transition-colors duration-200 ease-out last:border-0 hover:bg-stone-50"
                    >
                      <td className="py-3 pr-3">
                        <PieceImage
                          variantId={item.variantId}
                          className="float-left mr-3 size-12"
                        />
                        <span className="block font-medium text-stone-900">{item.productName}</span>
                        {item.variantLabel && item.variantLabel !== 'Única' && (
                          <span className="block text-xs text-stone-500">{item.variantLabel}</span>
                        )}
                      </td>
                      <td data-label="SKU" className="py-3 pr-3 font-mono text-xs text-stone-600">
                        {item.sku}
                      </td>
                      <td
                        data-label="Piezas"
                        className="py-3 pr-3 text-right font-semibold tabular-nums"
                      >
                        {item.quantity}
                      </td>
                      <td
                        data-label="Mínimo"
                        className="py-3 pr-3 text-right text-stone-600 tabular-nums"
                      >
                        {item.minStock}
                      </td>
                      <td data-label="Estado" className="py-3 pr-3">
                        <StatusBadge level={item.level} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {isPending && (
        <p role="status" className="sr-only">
          Cargando piezas en alerta…
        </p>
      )}

      {!isPending && !isError && shown === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <CircleCheck className="size-5" aria-hidden="true" />
          </span>
          <p className="font-medium text-stone-900">Todo en orden</p>
          <p className="max-w-xs text-sm text-stone-500">
            Ninguna pieza está sin stock ni por debajo de su mínimo.
          </p>
        </div>
      )}

      {!isPending && !isError && shown > 0 && (
        <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
          <span>
            Mostrando {shown} de {total} {total === 1 ? 'pieza' : 'piezas'}
            {shown < total && ' (se ordenan las cargadas)'}
          </span>
          <Link
            to="/inventario"
            className="inline-flex min-h-10 items-center rounded-md px-1 font-medium text-brand-700 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          >
            Ver inventario completo →
          </Link>
        </p>
      )}
    </div>
  );
}
