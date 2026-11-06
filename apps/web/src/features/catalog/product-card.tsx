import { PERMISSIONS, type Product } from '@joyeria/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { useHasPermission } from '../auth/use-auth.ts';
import { PhotoGallery } from './photos/photo-gallery.tsx';
import { ProductThumb } from './photos/product-thumb.tsx';
import { ProductBadges } from './product-badges.tsx';
import { useDeleteProduct, useUpdateProduct } from './use-products.ts';
import { ConfigureAxesForm, CreateVariantForm } from './variant-forms.tsx';
import { stockBlockMessage } from './stock-messages.ts';
import { VariantRow } from './variant-row.tsx';

function productStock(product: Product) {
  return product.variants.reduce((sum, variant) => sum + (variant.stockQuantity ?? 0), 0);
}

const currency = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' });

/** Precio de venta: uno solo, un rango entre variantes activas o «Sin definir». */
function priceLabel(product: Product) {
  const prices = product.variants
    .filter((variant) => variant.status === 'ACTIVE')
    .map((variant) => Number(variant.salePrice))
    .filter((price) => price > 0);
  if (prices.length === 0) return 'Sin definir';
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return low === high ? currency.format(low) : `${currency.format(low)} – ${currency.format(high)}`;
}

function productBlocked(product: Product) {
  return product.status !== 'INACTIVE' && productStock(product) > 0;
}

type Props = {
  product: Product;
  canManage: boolean;
  canReadInventory: boolean;
  onEdit: (product: Product) => void;
  onError: (message: string) => void;
  onWarnings: (warnings: string[]) => void;
  /** Abre la ficha completa al mostrarla (p. ej. cuando la búsqueda deja un solo producto). */
  defaultOpen?: boolean;
};

/** Ficha de producto: datos, características, variantes y acciones según los permisos. */
export function ProductCard({
  product,
  canManage,
  canReadInventory,
  onEdit,
  onError,
  onWarnings,
  defaultOpen = false,
}: Props) {
  const canDelete = useHasPermission(PERMISSIONS.CATALOG_DELETE);
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const [mode, setMode] = useState<'axes' | 'variant' | 'delete' | null>(null);
  const [showPhotos, setShowPhotos] = useState(false);
  // Lo que la persona eligió manda; si no ha tocado nada, se abre sola cuando hay un único resultado.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = manualOpen ?? defaultOpen;
  const skus = product.variants.map((variant) => variant.sku).join(',');

  async function toggle() {
    onError('');
    try {
      await updateProduct.mutateAsync({
        id: product.id,
        input: { status: product.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE' },
      });
    } catch (cause) {
      // Incluye el mensaje de la API cuando hay stock (STOCK_BLOCKS_DEACTIVATION).
      onError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado');
    }
  }

  async function markComplete() {
    onError('');
    try {
      await updateProduct.mutateAsync({ id: product.id, input: { profileIncomplete: false } });
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'No se pudo actualizar la ficha');
    }
  }

  async function remove() {
    onError('');
    try {
      await deleteProduct.mutateAsync(product.id);
    } catch (cause) {
      // B11: si tiene historial, la API explica que debe desactivarse.
      setMode(null);
      onError(cause instanceof Error ? cause.message : 'No se pudo eliminar el producto');
    }
  }

  const cardId = `detail-${product.id}`;
  const stock = canReadInventory ? productStock(product) : null;

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xs ${
        open ? 'sm:col-span-2 lg:col-span-3 xl:col-span-4' : ''
      }`}
    >
      <div className={open ? 'flex flex-wrap items-start gap-4 p-4' : 'flex flex-1 flex-col'}>
        <ProductThumb
          product={product}
          className={
            open ? 'size-28 sm:size-36' : 'aspect-square h-auto w-full rounded-none! border-0!'
          }
        />
        <div className={`flex min-w-0 flex-1 flex-col gap-2 ${open ? '' : 'p-3'}`}>
          <h2 className="flex flex-wrap items-center gap-2 font-semibold">
            <span>{product.name}</span>
            <ProductBadges product={product} />
          </h2>
          <p className="text-sm text-stone-600">
            {product.categoryName}
            {product.model ? ` · ${product.model}` : ''}
          </p>
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <div className="flex gap-1">
              <dt className="text-stone-600">Precio:</dt>
              <dd className="font-medium text-stone-900">{priceLabel(product)}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-stone-600">Variantes:</dt>
              <dd className="font-medium text-stone-900">{product.variants.length}</dd>
            </div>
            {stock !== null && (
              <div className="flex gap-1">
                <dt className="text-stone-600">Stock:</dt>
                <dd className="font-medium text-stone-900">{stock}</dd>
              </div>
            )}
          </dl>
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <Button
              variant="secondary"
              aria-expanded={open}
              aria-controls={cardId}
              onClick={() => {
                setManualOpen(!open);
              }}
            >
              {open ? 'Ocultar' : 'Ver'} detalle de {product.name}
            </Button>
            {canManage && (
              <Button
                variant="secondary"
                onClick={() => {
                  onEdit(product);
                }}
              >
                Editar {product.name}
              </Button>
            )}
          </div>
        </div>
      </div>
      {open && (
        <div id={cardId} className="space-y-3 border-t border-stone-100 p-4">
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/catalogo/etiquetas?codes=${encodeURIComponent(skus)}`}
              className="inline-flex min-h-10 items-center rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              aria-label={`Imprimir etiquetas de ${product.name}`}
            >
              Imprimir etiquetas
            </Link>
            {canManage && (
              <Button
                variant={product.status === 'INACTIVE' ? 'secondary' : 'danger'}
                disabled={updateProduct.isPending || productBlocked(product)}
                aria-describedby={productBlocked(product) ? `block-${product.id}` : undefined}
                onClick={() => void toggle()}
              >
                {product.status === 'INACTIVE' ? 'Activar' : 'Desactivar'} {product.name}
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
            {canManage && product.profileIncomplete && product.status !== 'INACTIVE' && (
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
          {mode === 'delete' && canDelete && (
            <div
              role="alertdialog"
              aria-label={`Confirmar eliminación de ${product.name}`}
              className="mt-3 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
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
          {product.description && (
            <p className="mt-2 text-sm text-stone-600">{product.description}</p>
          )}
          {product.attributes.length > 0 && (
            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
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
          {(canManage || product.photos.length > 0) && (
            <div className="mt-3">
              <Button
                variant="secondary"
                aria-expanded={showPhotos}
                aria-controls={`photos-${product.id}`}
                onClick={() => {
                  setShowPhotos((value) => !value);
                }}
              >
                Fotos de {product.name} ({product.photos.length})
              </Button>
              {showPhotos && (
                <div id={`photos-${product.id}`}>
                  <PhotoGallery product={product} canManage={canManage} />
                </div>
              )}
            </div>
          )}
          {canManage && (
            <div className="mt-3 flex flex-wrap gap-2">
              {product.axes.length === 0 ? (
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
              )}
            </div>
          )}
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
              onClose={(warnings) => {
                setMode(null);
                if (warnings && warnings.length > 0) onWarnings(warnings);
              }}
            />
          )}
          <div className="mt-3 space-y-3">
            {product.variants.map((variant) => (
              <VariantRow
                key={variant.id}
                product={product}
                variant={variant}
                canManage={canManage}
                canReadInventory={canReadInventory}
                onError={onError}
                onWarnings={onWarnings}
              />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
