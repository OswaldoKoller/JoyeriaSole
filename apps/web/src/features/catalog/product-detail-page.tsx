import { PERMISSIONS, type Product } from '@joyeria/shared';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { useHasPermission } from '../auth/use-auth.ts';
import { PhotoGallery } from './photos/photo-gallery.tsx';
import { ProductThumb } from './photos/product-thumb.tsx';
import { ProductBadges } from './product-badges.tsx';
import { ProductForm } from './product-form.tsx';
import { ProductPrice } from './product-price.tsx';
import { availability, productStock } from './product-summary.ts';
import { stockBlockMessage } from './stock-messages.ts';
import { useDeleteProduct, useProduct, useUpdateProduct } from './use-products.ts';
import { VariantRow } from './variant-row.tsx';
import { ConfigureAxesForm, CreateVariantForm } from './variant-forms.tsx';

const linkButton =
  'inline-flex min-h-10 items-center rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500';

function productBlocked(product: Product) {
  return product.status !== 'INACTIVE' && productStock(product) > 0;
}

/** Ficha completa de un producto: foto principal, datos, fotos, variantes y acciones por permiso. */
export function ProductDetailPage() {
  const { id = '' } = useParams();
  const query = useProduct(id);
  const { state } = useLocation() as { state: { productsSearch?: unknown } | null };
  // El listado deja su búsqueda en el estado de la navegación: al volver se conserva el contexto.
  const productsSearch =
    typeof state?.productsSearch === 'string' && state.productsSearch.startsWith('?')
      ? state.productsSearch
      : '';
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  useDocumentTitle(query.data?.name ?? 'Producto');

  return (
    <section className="space-y-6">
      <Link
        to={`/productos${productsSearch}`}
        className="inline-flex min-h-10 items-center text-sm underline"
      >
        ← Volver a Productos
      </Link>
      {query.isPending && (
        <p role="status" className="py-6 text-sm">
          Cargando producto…
        </p>
      )}
      {query.isError && !query.data && (
        <p role="alert" className="py-6 text-sm text-red-700">
          {notFound ? (
            'Este producto no existe o fue eliminado.'
          ) : (
            <>
              No se pudo cargar el producto.{' '}
              <button className="underline" onClick={() => void query.refetch()}>
                Reintentar
              </button>
            </>
          )}
        </p>
      )}
      {query.data && <ProductDetail key={query.data.id} product={query.data} />}
    </section>
  );
}

function ProductDetail({ product }: { product: Product }) {
  const navigate = useNavigate();
  const canManage = useHasPermission(PERMISSIONS.CATALOG_MANAGE);
  const canDelete = useHasPermission(PERMISSIONS.CATALOG_DELETE);
  const canReadInventory = useHasPermission(PERMISSIONS.INVENTORY_READ);
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const [mode, setMode] = useState<'edit' | 'axes' | 'variant' | 'delete' | null>(null);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const skus = product.variants.map((variant) => variant.sku).join(',');
  const state = availability(product, canReadInventory);
  const inactive = product.status === 'INACTIVE';

  async function toggle() {
    setError('');
    try {
      await updateProduct.mutateAsync({
        id: product.id,
        input: { status: inactive ? 'ACTIVE' : 'INACTIVE' },
      });
    } catch (cause) {
      // Incluye el mensaje de la API cuando hay stock (STOCK_BLOCKS_DEACTIVATION).
      setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado');
    }
  }

  async function markComplete() {
    setError('');
    try {
      await updateProduct.mutateAsync({ id: product.id, input: { profileIncomplete: false } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar la ficha');
    }
  }

  async function remove() {
    setError('');
    try {
      await deleteProduct.mutateAsync(product.id);
      await navigate('/productos');
    } catch (cause) {
      // B11: si tiene historial, la API explica que debe desactivarse.
      setMode(null);
      setError(cause instanceof Error ? cause.message : 'No se pudo eliminar el producto');
    }
  }

  return (
    <article aria-label={`Ficha de ${product.name}`} className="space-y-6">
      <div className="flex flex-wrap items-start gap-5 rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        <ProductThumb product={product} priority className="size-40 sm:size-56" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            <span>{product.name}</span>
            <ProductBadges product={product} />
          </h1>
          <p className="text-sm text-stone-600">
            {product.categoryName}
            {product.model ? ` · ${product.model}` : ''}
          </p>
          <ProductPrice product={product} className="text-xl font-semibold text-stone-900" />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {state && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${state.tone}`}>
                {state.label}
              </span>
            )}
            {canReadInventory && (
              <span className="text-stone-600">
                Stock: <span className="font-medium text-stone-900">{productStock(product)}</span>
              </span>
            )}
            <span className="text-stone-600">
              Variantes:{' '}
              <span className="font-medium text-stone-900">{product.variants.length}</span>
            </span>
          </div>
          {product.description && <p className="text-sm text-stone-600">{product.description}</p>}
          {product.attributes.length > 0 && (
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {product.attributes.map((value) => (
                <div key={value.attributeId} className="flex gap-1">
                  <dt className="font-medium text-stone-700">{value.name}:</dt>
                  <dd className="text-stone-600">
                    {value.displayValue}
                    {value.unit && value.dataType === 'NUMBER' ? ` ${value.unit}` : ''}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            {canManage && (
              <Button
                variant="secondary"
                onClick={() => {
                  setMode('edit');
                }}
              >
                Editar {product.name}
              </Button>
            )}
            <Link
              to={`/catalogo/etiquetas?codes=${encodeURIComponent(skus)}`}
              className={linkButton}
              aria-label={`Imprimir etiquetas de ${product.name}`}
            >
              Imprimir etiquetas
            </Link>
            {canManage && (
              <Button
                variant={inactive ? 'secondary' : 'danger'}
                disabled={updateProduct.isPending || productBlocked(product)}
                aria-describedby={productBlocked(product) ? `block-${product.id}` : undefined}
                onClick={() => void toggle()}
              >
                {inactive ? 'Activar' : 'Desactivar'} {product.name}
              </Button>
            )}
            {canDelete && (
              <Button
                variant="secondary"
                className="border-red-300 text-red-700"
                onClick={() => {
                  setMode('delete');
                }}
              >
                Eliminar {product.name}
              </Button>
            )}
            {canManage && product.profileIncomplete && !inactive && (
              <button
                type="button"
                className="min-h-10 text-sm text-brand-700 underline"
                disabled={updateProduct.isPending}
                onClick={() => void markComplete()}
              >
                Marcar ficha de {product.name} como completa
              </button>
            )}
          </div>
          {canManage && productBlocked(product) && (
            <p id={`block-${product.id}`} className="text-sm text-amber-800">
              {stockBlockMessage('el producto', productStock(product))}
            </p>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
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
      {mode === 'delete' && canDelete && (
        <div
          role="alertdialog"
          aria-label={`Confirmar eliminación de ${product.name}`}
          className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
        >
          <p>
            ¿Eliminar definitivamente «{product.name}» y sus {product.variants.length}{' '}
            {product.variants.length === 1 ? 'variante' : 'variantes'}? Esta acción no se puede
            deshacer. Solo es posible si la ficha no tiene movimientos de inventario, stock,
            ingresos ni conteos; si los tiene, debe desactivarla.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              disabled={deleteProduct.isPending}
              onClick={() => void remove()}
            >
              Sí, eliminar definitivamente
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setMode(null);
              }}
            >
              Cancelar eliminación
            </Button>
          </div>
        </div>
      )}
      {mode === 'edit' && canManage && (
        <ProductForm
          key={product.id}
          editing={product}
          onClose={() => {
            setMode(null);
          }}
        />
      )}
      {(canManage || product.photos.length > 0) && (
        <section className="space-y-2 rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
          <h2 className="font-semibold">Fotos de {product.name}</h2>
          <PhotoGallery product={product} canManage={canManage} />
        </section>
      )}
      <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Variantes</h2>
          {canManage &&
            (product.axes.length === 0 ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setMode('axes');
                }}
              >
                Configurar variantes de {product.name}
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  setMode('variant');
                }}
              >
                Nueva variante de {product.name}
              </Button>
            ))}
        </div>
        {mode === 'axes' && (
          <ConfigureAxesForm
            product={product}
            onClose={() => {
              setMode(null);
            }}
          />
        )}
        {mode === 'variant' && (
          <CreateVariantForm
            product={product}
            onClose={(created) => {
              setMode(null);
              if (created && created.length > 0) setWarnings(created);
            }}
          />
        )}
        <div className="space-y-3">
          {product.variants.map((variant) => (
            <VariantRow
              key={variant.id}
              product={product}
              variant={variant}
              canManage={canManage}
              canReadInventory={canReadInventory}
              onError={setError}
              onWarnings={setWarnings}
            />
          ))}
        </div>
      </section>
    </article>
  );
}
