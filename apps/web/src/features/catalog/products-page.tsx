import { PERMISSIONS } from '@joyeria/shared';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Pagination } from '../../components/ui/pagination.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { PAGE_SIZE } from '../../lib/paging.ts';
import { PendingSearchParams } from '../../lib/pending-search-params.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { useHasPermission } from '../auth/use-auth.ts';
import { PieceImage } from './photos/piece-image.tsx';
import { ProductCard } from './product-card.tsx';
import { ProductForm } from './product-form.tsx';
import { categoryPath, useCategories } from './use-categories.ts';
import { lookupVariant, useProducts } from './use-products.ts';

const MATCH_LABEL = {
  SKU: 'el SKU',
  BARCODE: 'el código de barras',
  SUPPLIER_CODE: 'el código del proveedor',
} as const;

type QualityFilter = 'all' | 'incomplete' | 'withoutPrice';

/** Página de la URL (`?page=`): entero positivo; cualquier otro valor se trata como la primera. */
function pageFromParam(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function ProductsPage() {
  useDocumentTitle('Productos');
  const canManage = useHasPermission(PERMISSIONS.CATALOG_MANAGE);
  const canReadInventory = useHasPermission(PERMISSIONS.INVENTORY_READ);
  // Búsqueda, rubro, estado de la ficha y página viven en la URL: se conservan al volver desde
  // una ficha, al recargar y al compartir el enlace.
  const [params, setParams] = useSearchParams();
  const { search: currentSearch, key: locationKey } = useLocation();
  const pendingParams = useRef(new PendingSearchParams(params));
  useEffect(() => {
    pendingParams.current.observe(params, locationKey);
  });
  const search = params.get('q') ?? '';
  const categoryId = params.get('categoryId') ?? '';
  const page = pageFromParam(params.get('page'));
  const quality: QualityFilter =
    params.get('incomplete') === '1'
      ? 'incomplete'
      : params.get('withoutPrice') === '1'
        ? 'withoutPrice'
        : 'all';
  const [draftSearch, setDraftSearch] = useState(search);
  const [syncedSearch, setSyncedSearch] = useState(search);
  const searchRef = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [found, setFound] = useState<{ text: string; variantId: string | null } | null>(null);
  const categories = useCategories();
  const list = useProducts({
    page,
    q: search,
    categoryId,
    incomplete: quality === 'incomplete',
    withoutPrice: quality === 'withoutPrice',
  });
  const products = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;

  // Si la búsqueda cambia desde fuera (botón «Atrás», enlace), el campo la refleja.
  if (search !== syncedSearch) {
    setSyncedSearch(search);
    setDraftSearch(search);
  }

  // Tras una coincidencia exacta (lector de códigos) el texto queda seleccionado: la siguiente
  // lectura lo reemplaza en vez de pegarse al código anterior. Se repite cuando la búsqueda de
  // la URL pasa a ser el SKU, porque el campo se reescribe con ese valor.
  useEffect(() => {
    if (!found?.variantId) return;
    searchRef.current?.focus();
    searchRef.current?.select();
  }, [found, search]);

  /**
   * Cambia parámetros de la URL; por defecto vuelve a la primera página. Parte del último cambio
   * pedido (`PendingSearchParams`), no de la URL del render que creó esta función ni de la del
   * último render: una búsqueda por código que termina tarde no debe borrar un filtro cambiado
   * mientras esperaba, y un cambio de URL aún no aplicado por React Router (es diferido) tampoco
   * debe perderse. (La forma funcional de `setSearchParams` NO sirve: parte de los parámetros de su
   * propio render.)
   */
  function updateParams(changes: Record<string, string | null>, keepPage = false) {
    const next = pendingParams.current.base();
    for (const [name, value] of Object.entries(changes)) {
      if (value) next.set(name, value);
      else next.delete(name);
    }
    if (!keepPage) next.delete('page');
    pendingParams.current.push(next); // varias llamadas seguidas se componen
    setParams(next, { replace: true });
  }

  /**
   * Búsqueda unificada: primero se prueba el texto como código exacto (SKU, código de barras o
   * del proveedor; el lector escribe el código y pulsa Enter) y, si no existe, se busca por texto.
   */
  async function submitSearch(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = draftSearch.trim();
    setFound(null);
    if (term) {
      try {
        const { data } = await lookupVariant(term);
        setFound({
          text: `Encontrada por ${MATCH_LABEL[data.matchedBy]}: ${data.productName}${data.label && data.label !== 'Única' ? ` · ${data.label}` : ''} (${data.sku}).`,
          variantId: data.variantId,
        });
        updateParams({ q: data.sku });
        return;
      } catch (cause) {
        // 404: no es un código exacto, se busca por texto. 409: código de varios proveedores.
        if (cause instanceof ApiError && cause.status === 409) {
          setFound({ text: cause.message, variantId: null });
        }
      }
    }
    updateParams({ q: term });
  }

  function changeQuality(value: QualityFilter) {
    updateParams({
      incomplete: value === 'incomplete' ? '1' : null,
      withoutPrice: value === 'withoutPrice' ? '1' : null,
    });
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Productos</h1>
          <p className="text-sm text-stone-600">
            Toca un producto para ver su ficha completa. Consulta los movimientos en Inventario.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/catalogo/etiquetas"
            className="inline-flex min-h-10 items-center rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            Etiquetas
          </Link>
          {canManage && (
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              Nuevo producto
            </Button>
          )}
        </div>
      </div>
      {creating && canManage && (
        <ProductForm
          onClose={(created) => {
            setCreating(false);
            if (created && created.length > 0) setWarnings(created);
          }}
        />
      )}
      {warnings.length > 0 && (
        <div role="status" className="space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          <button
            type="button"
            className="min-h-10 underline"
            onClick={() => {
              setWarnings([]);
            }}
          >
            Entendido
          </button>
        </div>
      )}
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        <form
          onSubmit={(event) => void submitSearch(event)}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="min-w-52 flex-1">
            <Input
              ref={searchRef}
              label="Buscar por nombre, SKU o código de barras"
              value={draftSearch}
              onChange={(event) => {
                setDraftSearch(event.target.value);
              }}
              aria-describedby="product-search-hint"
              maxLength={100}
            />
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
        <p id="product-search-hint" className="mt-1 text-xs text-stone-600">
          También encuentra el código del proveedor. Un lector de códigos escribe el código y pulsa
          Enter.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <div className="space-y-1">
            <label htmlFor="filter-category" className="block text-sm font-medium text-stone-700">
              Filtrar por rubro
            </label>
            <select
              id="filter-category"
              value={categoryId}
              onChange={(event) => {
                updateParams({ categoryId: event.target.value });
              }}
              className="block min-h-10 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              {(categories.data?.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {categoryPath(item, categories.data?.data ?? [])}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="filter-quality" className="block text-sm font-medium text-stone-700">
              Estado de la ficha
            </label>
            <select
              id="filter-quality"
              value={quality}
              onChange={(event) => {
                changeQuality(event.target.value as QualityFilter);
              }}
              className="block min-h-10 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">Todas</option>
              <option value="incomplete">Fichas incompletas</option>
              <option value="withoutPrice">Sin precio</option>
            </select>
          </div>
        </div>
        {found && (
          <div
            role="status"
            className="mt-3 flex items-center gap-3 rounded-lg bg-brand-50 p-3 text-sm text-stone-800"
          >
            {found.variantId && <PieceImage variantId={found.variantId} className="size-14" />}
            <p>{found.text}</p>
          </div>
        )}
        {list.isPending && (
          <p role="status" className="py-6 text-sm">
            Cargando productos…
          </p>
        )}
        {list.isError && (
          <p role="alert" className="py-6 text-sm text-red-700">
            No se pudieron cargar los productos.{' '}
            <button className="underline" onClick={() => void list.refetch()}>
              Reintentar
            </button>
          </p>
        )}
        {list.isSuccess && products.length === 0 && (
          <p className="py-6 text-sm text-stone-600">No se encontraron productos.</p>
        )}
        {list.isSuccess && products.length > 0 && (
          // Cuadrícula por ancho del contenido (no de la pantalla): el panel lateral fijo le resta
          // espacio. 2 columnas en teléfono y hasta 5 en pantalla ancha.
          <ul
            aria-label="Productos"
            aria-busy={list.isPlaceholderData}
            className={`mt-4 grid grid-cols-2 gap-3 @xl:grid-cols-3 @2xl:grid-cols-4 @4xl:grid-cols-5 ${
              list.isPlaceholderData ? 'opacity-60' : ''
            }`}
          >
            {products.map((product) => (
              <li key={product.id}>
                <ProductCard
                  product={product}
                  canReadInventory={canReadInventory}
                  from={currentSearch}
                />
              </li>
            ))}
          </ul>
        )}
        {list.isSuccess && (
          <Pagination
            page={page}
            total={total}
            pageSize={PAGE_SIZE}
            noun="productos"
            onPageChange={(next) => {
              updateParams({ page: next > 1 ? String(next) : null }, true);
            }}
          />
        )}
      </div>
    </section>
  );
}
