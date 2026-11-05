import {
  quickCreateStockEntryItemSchema,
  type StockEntryCurrency,
  type StockEntryDetail,
} from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { useCategories } from '../catalog/use-categories.ts';
import { useQuickCreateItem } from './use-stock-entries.ts';

/** Estado que vive en la página (no aquí): el editor se reinicia al guardar y no debe perderlo. */
export interface QuickCreateState {
  open: boolean;
  notice: { sku: string; warnings: string[] } | null;
}

interface Props {
  entryId: string;
  state: QuickCreateState;
  onStateChange: (state: QuickCreateState) => void;
  currency: StockEntryCurrency;
  /** Si hay cambios sin guardar en los ítems, el alta rápida se bloquea para no perderlos. */
  blockedReason: string | null;
  onCreated: (entry: StockEntryDetail) => void;
}

/**
 * Alta rápida de una pieza nueva dentro del ingreso (C1 / P-24): datos mínimos. Crea el producto
 * activo con ficha incompleta, una variante con SKU correlativo y precio de venta 0, y la agrega
 * como ítem del borrador. La ficha se completa después en Productos.
 */
export function QuickCreatePiece({
  entryId,
  state,
  onStateChange,
  currency,
  blockedReason,
  onCreated,
}: Props) {
  const categories = useCategories();
  const create = useQuickCreateItem(entryId);
  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const [supplierCode, setSupplierCode] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [error, setError] = useState('');

  const active = categories.data?.data.filter((item) => item.isActive) ?? [];
  const byId = new Map(active.map((item) => [item.id, item]));
  const pathOf = (id: string) => {
    const category = byId.get(id);
    const parent = category?.parentId ? byId.get(category.parentId) : undefined;
    return parent ? `${parent.name} › ${category?.name ?? ''}` : (category?.name ?? '');
  };
  const priceLabel = `Precio de compra (${currency === 'USD' ? 'USD' : 'Bs'})`;

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    onStateChange({ ...state, notice: null });
    const parsed = quickCreateStockEntryItemSchema.safeParse({
      categoryId,
      name,
      supplierCode,
      receivedQty: quantity.trim() === '' ? Number.NaN : Number(quantity),
      unitPrice: unitPrice.trim(),
    });
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      setError(
        field === 'categoryId'
          ? 'Seleccione la categoría.'
          : field === 'name'
            ? 'Escriba el nombre de la pieza.'
            : field === 'receivedQty'
              ? 'La cantidad debe ser un entero de 1 o más.'
              : field === 'unitPrice'
                ? 'El precio de compra admite hasta 4 decimales.'
                : 'Revise los datos de la pieza.',
      );
      return;
    }
    try {
      const result = await create.mutateAsync(parsed.data);
      const created = result.data.items.find((item) => item.variantId === result.meta.variantId);
      onStateChange({
        open: true,
        notice: { sku: created?.sku ?? '', warnings: result.meta.warnings },
      });
      setName('');
      setSupplierCode('');
      setQuantity('1');
      setUnitPrice('');
      onCreated(result.data);
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : 'No se pudo crear la pieza. Intente de nuevo.',
      );
    }
  }

  return (
    <section
      aria-labelledby="quick-create-title"
      className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="quick-create-title" className="text-lg font-semibold">
            Pieza nueva
          </h2>
          <p className="text-xs text-stone-500">
            ¿Llegó una pieza que aún no está en el catálogo? Cárguela con los datos mínimos y
            complete su ficha después.
          </p>
        </div>
        <Button
          variant="secondary"
          aria-expanded={state.open}
          aria-controls="quick-create-form"
          onClick={() => {
            onStateChange({ ...state, open: !state.open });
          }}
        >
          {state.open ? 'Ocultar alta rápida' : 'Alta rápida de pieza nueva'}
        </Button>
      </div>

      {state.notice && (
        <div
          role="status"
          className="space-y-1 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          <p>
            Pieza creada con el SKU <strong className="font-mono">{state.notice.sku}</strong> y
            agregada al ingreso. Su ficha quedó marcada como incompleta; el precio de venta es 0.
          </p>
          {state.notice.warnings.map((warning) => (
            <p key={warning} className="text-amber-800">
              Aviso: {warning}
            </p>
          ))}
        </div>
      )}

      {state.open && (
        <form
          id="quick-create-form"
          onSubmit={(event) => void submit(event)}
          noValidate
          aria-label="Alta rápida de pieza nueva"
          className="space-y-4"
        >
          {blockedReason && (
            <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              {blockedReason}
            </p>
          )}
          <fieldset disabled={blockedReason !== null || create.isPending} className="space-y-4">
            <legend className="sr-only">Datos mínimos de la pieza</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label
                  htmlFor="quick-category"
                  className="block text-sm font-medium text-stone-700"
                >
                  Categoría de la pieza nueva
                </label>
                <select
                  id="quick-category"
                  value={categoryId}
                  onChange={(event) => {
                    setCategoryId(event.target.value);
                  }}
                  className="block min-h-10 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                >
                  <option value="">Seleccionar categoría</option>
                  {active.map((item) => (
                    <option key={item.id} value={item.id}>
                      {pathOf(item.id)}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Nombre de la pieza nueva"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                maxLength={200}
              />
              <Input
                label="Código del proveedor (opcional)"
                value={supplierCode}
                onChange={(event) => {
                  setSupplierCode(event.target.value);
                }}
                maxLength={64}
              />
              <Input
                label="Cantidad recibida de la pieza nueva"
                value={quantity}
                onChange={(event) => {
                  setQuantity(event.target.value);
                }}
                inputMode="numeric"
              />
              <Input
                label={`${priceLabel} de la pieza nueva`}
                value={unitPrice}
                onChange={(event) => {
                  setUnitPrice(event.target.value);
                }}
                inputMode="decimal"
              />
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" disabled={blockedReason !== null || create.isPending}>
            {create.isPending ? 'Creando…' : 'Crear pieza y agregar al ingreso'}
          </Button>
        </form>
      )}
    </section>
  );
}
