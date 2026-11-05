import { PERMISSIONS, type Product } from '@joyeria/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { useHasPermission } from '../auth/use-auth.ts';
import { ProductBadges } from './product-badges.tsx';
import { useDeleteProduct, useUpdateProduct } from './use-products.ts';
import { ConfigureAxesForm, CreateVariantForm } from './variant-forms.tsx';
import { stockBlockMessage } from './stock-messages.ts';
import { VariantRow } from './variant-row.tsx';

function productStock(product: Product) {
  return product.variants.reduce((sum, variant) => sum + (variant.stockQuantity ?? 0), 0);
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
};

/** Ficha de producto: datos, características, variantes y acciones según los permisos. */
export function ProductCard({
  product,
  canManage,
  canReadInventory,
  onEdit,
  onError,
  onWarnings,
}: Props) {
  const canDelete = useHasPermission(PERMISSIONS.CATALOG_DELETE);
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const [mode, setMode] = useState<'axes' | 'variant' | 'delete' | null>(null);
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

  return (
    <article className="rounded-lg border border-stone-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 font-semibold">
            <span>{product.name}</span>
            <ProductBadges product={product} />
          </h2>
          <p className="text-sm text-stone-600">
            {product.categoryName}
            {product.model ? ` · ${product.model}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/catalogo/etiquetas?codes=${encodeURIComponent(skus)}`}
            className="inline-flex min-h-10 items-center rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            aria-label={`Imprimir etiquetas de ${product.name}`}
          >
            Imprimir etiquetas
          </Link>
          {canManage && (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  onEdit(product);
                }}
              >
                Editar {product.name}
              </Button>
              <Button
                variant={product.status === 'INACTIVE' ? 'secondary' : 'danger'}
                disabled={updateProduct.isPending || productBlocked(product)}
                aria-describedby={productBlocked(product) ? `block-${product.id}` : undefined}
                onClick={() => void toggle()}
              >
                {product.status === 'INACTIVE' ? 'Activar' : 'Desactivar'} {product.name}
              </Button>
            </>
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
        </div>
      </div>
      {canManage && productBlocked(product) && (
        <p id={`block-${product.id}`} className="mt-2 text-sm text-amber-800">
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
      {product.description && <p className="mt-2 text-sm text-stone-600">{product.description}</p>}
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
    </article>
  );
}
