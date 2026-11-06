import { PERMISSIONS } from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { ApiError } from '../../lib/api-client.ts';
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

export function ProductsPage() {
  const canManage = useHasPermission(PERMISSIONS.CATALOG_MANAGE);
  const canReadInventory = useHasPermission(PERMISSIONS.INVENTORY_READ);
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState(params.get('q') ?? '');
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [quality, setQuality] = useState<QualityFilter>(
    params.get('incomplete') === '1'
      ? 'incomplete'
      : params.get('withoutPrice') === '1'
        ? 'withoutPrice'
        : 'all',
  );
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

  /**
   * Búsqueda unificada: primero se prueba el texto como código exacto (SKU, código de barras o
   * del proveedor; el lector escribe el código y pulsa Enter) y, si no existe, se busca por texto.
   */
  async function submitSearch(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = draftSearch.trim();
    setPage(1);
    setFound(null);
    if (term) {
      try {
        const { data } = await lookupVariant(term);
        setFound({
          text: `Encontrada por ${MATCH_LABEL[data.matchedBy]}: ${data.productName}${data.label && data.label !== 'Única' ? ` · ${data.label}` : ''} (${data.sku}).`,
          variantId: data.variantId,
        });
        setSearch(data.sku);
        return;
      } catch (cause) {
        // 404: no es un código exacto, se busca por texto. 409: código de varios proveedores.
        if (cause instanceof ApiError && cause.status === 409) {
          setFound({ text: cause.message, variantId: null });
        }
      }
    }
    setSearch(term);
  }

  function changeQuality(value: QualityFilter) {
    setQuality(value);
    setPage(1);
    const next = new URLSearchParams(params);
    next.delete('incomplete');
    next.delete('withoutPrice');
    if (value === 'incomplete') next.set('incomplete', '1');
    if (value === 'withoutPrice') next.set('withoutPrice', '1');
    setParams(next, { replace: true });
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
                setCategoryId(event.target.value);
                setPage(1);
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
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} canReadInventory={canReadInventory} />
            ))}
          </div>
        )}
        {list.isSuccess && total > 25 && (
          <div className="mt-4 flex items-center gap-3 text-sm">
            <Button
              variant="secondary"
              disabled={page === 1}
              onClick={() => {
                setPage(page - 1);
              }}
            >
              Anterior
            </Button>
            <span>
              Página {page} · {total} productos
            </span>
            <Button
              variant="secondary"
              disabled={page * 25 >= total}
              onClick={() => {
                setPage(page + 1);
              }}
            >
              Siguiente
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
