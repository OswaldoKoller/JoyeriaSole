import type { Product, ProductVariant } from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useSuppliers } from '../suppliers/use-suppliers.ts';
import {
  useAssignBarcode,
  useGenerateBarcode,
  useUpdateVariant,
  useUpdateVariantStatus,
} from './use-products.ts';
import { stockBlockMessage } from './stock-messages.ts';

const currency = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' });

function variantBlocked(variant: ProductVariant) {
  return variant.status === 'ACTIVE' && (variant.stockQuantity ?? 0) > 0;
}

type Props = {
  product: Product;
  variant: ProductVariant;
  canManage: boolean;
  canReadInventory: boolean;
  onError: (message: string) => void;
  onWarnings: (warnings: string[]) => void;
};

/** Datos de una variante dentro de la ficha: precio neto, códigos, stock mínimo y etiqueta. */
export function VariantRow({
  product,
  variant,
  canManage,
  canReadInventory,
  onError,
  onWarnings,
}: Props) {
  const assign = useAssignBarcode();
  const generate = useGenerateBarcode();
  const updateVariant = useUpdateVariant();
  const updateStatus = useUpdateVariantStatus();
  const suppliers = useSuppliers(1, '', 'active');
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeDraft, setCodeDraft] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [minStock, setMinStock] = useState(String(variant.minStock));
  const fail = (cause: unknown, fallback: string) => {
    onError(cause instanceof Error ? cause.message : fallback);
  };

  async function saveCode(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    onError('');
    try {
      const result = await assign.mutateAsync({
        variantId: variant.id,
        input: { barcode: codeDraft.trim(), supplierId: supplierId || null },
      });
      if (result.meta.warnings.length > 0) onWarnings(result.meta.warnings);
      setCodeOpen(false);
      setCodeDraft('');
    } catch (cause) {
      // 409: el código ya es de otra pieza (Q-10); el mensaje de la API lo explica.
      fail(cause, 'No se pudo registrar el código');
    }
  }

  async function saveMinStock(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    onError('');
    const value = Number(minStock);
    if (!Number.isInteger(value) || value < 0) {
      onError('El stock mínimo debe ser un número entero de 0 o más.');
      return;
    }
    try {
      await updateVariant.mutateAsync({ variantId: variant.id, input: { minStock: value } });
    } catch (cause) {
      fail(cause, 'No se pudo guardar el stock mínimo');
    }
  }

  return (
    <div className="rounded-lg bg-stone-50 p-3 text-sm">
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
        <strong>Precio de venta (neto):</strong>{' '}
        {Number(variant.salePrice) > 0
          ? currency.format(Number(variant.salePrice))
          : 'Sin precio definido'}
      </p>
      <p>
        <strong>Stock mínimo:</strong>{' '}
        {variant.minStock > 0 ? `${variant.minStock} piezas` : '0 (sin alerta)'}
      </p>
      <p>
        <strong>Código de barras:</strong> {variant.barcode ?? 'Sin código'}
      </p>
      {variant.status === 'INACTIVE' && (
        <p className="font-medium text-stone-700">Variante inactiva</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to={`/catalogo/etiquetas?codes=${encodeURIComponent(variant.sku)}`}
          className="inline-flex min-h-10 items-center rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          aria-label={`Imprimir etiqueta de ${variant.sku}`}
        >
          Imprimir etiqueta
        </Link>
        {canManage && (
          <Button
            variant="secondary"
            disabled={updateStatus.isPending || variantBlocked(variant)}
            aria-describedby={variantBlocked(variant) ? `block-${variant.id}` : undefined}
            onClick={() => {
              onError('');
              updateStatus
                .mutateAsync({
                  variantId: variant.id,
                  input: { status: variant.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' },
                })
                .catch((cause: unknown) => {
                  fail(cause, 'No se pudo cambiar el estado');
                });
            }}
          >
            {variant.status === 'ACTIVE' ? 'Desactivar' : 'Activar'} variante {variant.sku}
          </Button>
        )}
        {canManage && !variant.barcode && (
          <>
            <Button
              variant="secondary"
              disabled={generate.isPending || product.status !== 'ACTIVE'}
              onClick={() => {
                onError('');
                generate.mutateAsync(variant.id).catch((cause: unknown) => {
                  fail(cause, 'No se pudo generar el código');
                });
              }}
            >
              Generar código propio
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setCodeOpen(true);
                setCodeDraft('');
              }}
            >
              Registrar código del proveedor
            </Button>
          </>
        )}
      </div>
      {canManage && variantBlocked(variant) && (
        <p id={`block-${variant.id}`} className="mt-1 text-amber-800">
          {stockBlockMessage('la variante', variant.stockQuantity ?? 0)}
        </p>
      )}
      {canManage && (
        <form
          onSubmit={(event) => void saveMinStock(event)}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <div className="w-44">
            <Input
              label={`Stock mínimo de ${variant.sku}`}
              type="number"
              min={0}
              step={1}
              value={minStock}
              onChange={(event) => {
                setMinStock(event.target.value);
              }}
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            disabled={updateVariant.isPending || Number(minStock) === variant.minStock}
            aria-label={`Guardar stock mínimo de ${variant.sku}`}
          >
            Guardar mínimo
          </Button>
        </form>
      )}
      {codeOpen && (
        <form
          onSubmit={(event) => void saveCode(event)}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <div className="min-w-52 flex-1">
            <Input
              label="Código de barras del proveedor"
              value={codeDraft}
              onChange={(event) => {
                setCodeDraft(event.target.value);
              }}
              maxLength={64}
              required
            />
          </div>
          <div className="min-w-44 space-y-1">
            <label
              htmlFor={`supplier-${variant.id}`}
              className="block text-sm font-medium text-stone-700"
            >
              Proveedor (opcional)
            </label>
            <select
              id={`supplier-${variant.id}`}
              value={supplierId}
              onChange={(event) => {
                setSupplierId(event.target.value);
              }}
              className="block min-h-10 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Sin proveedor</option>
              {suppliers.data?.data.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={assign.isPending}>
            Guardar código
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setCodeOpen(false);
            }}
          >
            Cancelar
          </Button>
        </form>
      )}
    </div>
  );
}
