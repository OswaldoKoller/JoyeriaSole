import { PERMISSIONS, type Product } from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useHasPermission } from '../auth/use-auth.ts';
import { BarcodePreview } from './barcode-preview.tsx';
import { ProductForm } from './product-form.tsx';
import { ConfigureAxesForm, CreateVariantForm } from './variant-forms.tsx';
import {
  useAssignBarcode,
  useGenerateBarcode,
  useProducts,
  useUpdateProduct,
  useUpdateVariantStatus,
} from './use-products.ts';

const currency = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' });

/** P-22: con stock no se desactiva. Texto que acompaña al botón deshabilitado. */
function stockBlockMessage(subject: 'el producto' | 'la variante', pieces: number) {
  return `No se puede desactivar ${subject}: tiene ${pieces} ${pieces === 1 ? 'pieza' : 'piezas'} en stock. Registre primero un ajuste de salida hasta dejarlo en cero.`;
}

type Variant = Product['variants'][number];

function variantBlocked(variant: Variant) {
  return variant.status === 'ACTIVE' && (variant.stockQuantity ?? 0) > 0;
}

function productStock(product: Product) {
  return product.variants.reduce((sum, variant) => sum + (variant.stockQuantity ?? 0), 0);
}

function productBlocked(product: Product) {
  return product.status !== 'INACTIVE' && productStock(product) > 0;
}

export function ProductsPage() {
  const canManage = useHasPermission(PERMISSIONS.CATALOG_MANAGE);
  const canReadInventory = useHasPermission(PERMISSIONS.INVENTORY_READ);
  const [page, setPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [barcodeFor, setBarcodeFor] = useState<string | null>(null);
  const [axesFor, setAxesFor] = useState<string | null>(null);
  const [variantFor, setVariantFor] = useState<string | null>(null);
  const [barcodeDraft, setBarcodeDraft] = useState('');
  const [error, setError] = useState('');
  const list = useProducts(page, search);
  const assign = useAssignBarcode();
  const generate = useGenerateBarcode();
  const updateProduct = useUpdateProduct();
  const updateVariant = useUpdateVariantStatus();
  const products = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;

  function submitSearch(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
  }

  async function assignCode(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!barcodeFor) return;
    setError('');
    try {
      await assign.mutateAsync({ variantId: barcodeFor, input: { barcode: barcodeDraft.trim() } });
      setBarcodeFor(null);
      setBarcodeDraft('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar el código');
    }
  }

  async function generateCode(variantId: string) {
    setError('');
    try {
      await generate.mutateAsync(variantId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo generar el código');
    }
  }

  async function toggleProduct(product: Product) {
    const status = product.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
    setError('');
    try {
      await updateProduct.mutateAsync({ id: product.id, input: { status } });
    } catch (cause) {
      // Incluye el mensaje de la API cuando hay stock (STOCK_BLOCKS_DEACTIVATION).
      setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado');
    }
  }

  async function toggleVariant(variantId: string, current: 'ACTIVE' | 'INACTIVE') {
    setError('');
    try {
      await updateVariant.mutateAsync({
        variantId,
        input: { status: current === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado');
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Productos</h1>
          <p className="text-sm text-stone-600">
            Fichas, códigos y disponibilidad por variante. Consulta los movimientos en Inventario.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setCreating(true);
              setEditing(null);
            }}
          >
            Nuevo producto
          </Button>
        )}
      </div>
      {creating && canManage && (
        <ProductForm
          onClose={() => {
            setCreating(false);
          }}
        />
      )}
      {editing && canManage && (
        <ProductForm
          key={editing.id}
          editing={editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        <form onSubmit={submitSearch} className="flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1">
            <Input
              label="Buscar por nombre, SKU o código de barras"
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
        </form>
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
          <div className="mt-4 space-y-4">
            {products.map((product) => (
              <article key={product.id} className="rounded-lg border border-stone-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">
                      {product.name}
                      {product.status !== 'ACTIVE' && (
                        <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700">
                          {product.status === 'INACTIVE' ? 'Inactivo' : 'Borrador'}
                        </span>
                      )}
                    </h2>
                    <p className="text-sm text-stone-600">
                      {product.categoryName}
                      {product.model ? ` · ${product.model}` : ''}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setEditing(product);
                          setCreating(false);
                        }}
                      >
                        Editar {product.name}
                      </Button>
                      <Button
                        variant={product.status === 'INACTIVE' ? 'secondary' : 'danger'}
                        disabled={updateProduct.isPending || productBlocked(product)}
                        aria-describedby={
                          productBlocked(product) ? `block-${product.id}` : undefined
                        }
                        onClick={() => void toggleProduct(product)}
                      >
                        {product.status === 'INACTIVE' ? 'Activar' : 'Desactivar'} {product.name}
                      </Button>
                    </div>
                  )}
                </div>
                {canManage && productBlocked(product) && (
                  <p id={`block-${product.id}`} className="mt-2 text-sm text-amber-800">
                    {stockBlockMessage('el producto', productStock(product))}
                  </p>
                )}
                {product.description && (
                  <p className="mt-2 text-sm text-stone-600">{product.description}</p>
                )}
                {canManage && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {product.axes.length === 0 ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setAxesFor(product.id);
                          setVariantFor(null);
                        }}
                      >
                        Configurar variantes de {product.name}
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setVariantFor(product.id);
                          setAxesFor(null);
                        }}
                      >
                        Nueva variante de {product.name}
                      </Button>
                    )}
                  </div>
                )}
                {axesFor === product.id && (
                  <ConfigureAxesForm
                    product={product}
                    onClose={() => {
                      setAxesFor(null);
                    }}
                  />
                )}
                {variantFor === product.id && (
                  <CreateVariantForm
                    product={product}
                    onClose={() => {
                      setVariantFor(null);
                    }}
                  />
                )}
                <div className="mt-3 space-y-3">
                  {product.variants.map((variant) => (
                    <div key={variant.id} className="rounded-lg bg-stone-50 p-3 text-sm">
                      <p>
                        <strong>SKU:</strong> {variant.sku}
                        {variant.label && variant.label !== 'Única' ? ` · ${variant.label}` : ''}
                      </p>
                      {canReadInventory && variant.stockQuantity !== undefined && (
                        <p>
                          <strong>Stock:</strong> {variant.stockQuantity} piezas
                          {variant.stockLevel === 'OUT'
                            ? ' · Sin stock'
                            : variant.stockLevel === 'LOW'
                              ? ' · Bajo mínimo'
                              : ''}{' '}
                          <Link
                            to={`/inventario?sku=${encodeURIComponent(variant.sku)}`}
                            className="inline-block py-1 text-brand-700 underline"
                          >
                            Ver en inventario
                          </Link>
                        </p>
                      )}
                      <p>
                        <strong>Precio:</strong>{' '}
                        {Number(variant.salePrice) > 0
                          ? currency.format(Number(variant.salePrice))
                          : 'Sin precio definido'}
                      </p>
                      <p>
                        <strong>Código de barras:</strong> {variant.barcode ?? 'Sin código'}
                      </p>
                      {variant.barcode?.startsWith('SOLE-') && (
                        <BarcodePreview value={variant.barcode} />
                      )}
                      {variant.status === 'INACTIVE' && (
                        <p className="font-medium text-stone-700">Variante inactiva</p>
                      )}
                      {canManage && (
                        <div className="mt-3">
                          <Button
                            variant="secondary"
                            disabled={updateVariant.isPending || variantBlocked(variant)}
                            aria-describedby={
                              variantBlocked(variant) ? `block-${variant.id}` : undefined
                            }
                            onClick={() => void toggleVariant(variant.id, variant.status)}
                          >
                            {variant.status === 'ACTIVE' ? 'Desactivar' : 'Activar'} variante{' '}
                            {variant.sku}
                          </Button>
                          {variantBlocked(variant) && (
                            <p id={`block-${variant.id}`} className="mt-1 text-amber-800">
                              {stockBlockMessage('la variante', variant.stockQuantity ?? 0)}
                            </p>
                          )}
                        </div>
                      )}
                      {!variant.barcode && canManage && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            disabled={generate.isPending}
                            onClick={() => void generateCode(variant.id)}
                          >
                            Generar código propio
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setBarcodeFor(variant.id);
                              setBarcodeDraft('');
                            }}
                          >
                            Registrar código del proveedor
                          </Button>
                        </div>
                      )}
                      {barcodeFor === variant.id && (
                        <form
                          onSubmit={(event) => void assignCode(event)}
                          className="mt-3 flex flex-wrap items-end gap-2"
                        >
                          <div className="min-w-52 flex-1">
                            <Input
                              label="Código de barras del proveedor"
                              value={barcodeDraft}
                              onChange={(event) => {
                                setBarcodeDraft(event.target.value);
                              }}
                              maxLength={64}
                              required
                            />
                          </div>
                          <Button type="submit" disabled={assign.isPending}>
                            Guardar código
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setBarcodeFor(null);
                            }}
                          >
                            Cancelar
                          </Button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              </article>
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
