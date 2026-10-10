import {
  PERMISSIONS,
  createProductSchema,
  updateProductSchema,
  type Product,
} from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useHasPermission } from '../auth/use-auth.ts';
import { useCategories } from './use-categories.ts';
import { useCreateProduct, useUpdateProduct } from './use-products.ts';

export function ProductForm({ editing, onClose }: { editing?: Product; onClose: () => void }) {
  const canPrice = useHasPermission(PERMISSIONS.PRICES_MANAGE);
  const categories = useCategories();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '');
  const [name, setName] = useState(editing?.name ?? '');
  const [model, setModel] = useState(editing?.model ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [barcode, setBarcode] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [minStock, setMinStock] = useState('0');
  const [error, setError] = useState('');
  const activeCategories = categories.data?.data.filter((item) => item.isActive) ?? [];

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const common = { name, model: model || null, description: description || null };
    const parsed = editing
      ? updateProductSchema.safeParse(common)
      : createProductSchema.safeParse({
          ...common,
          categoryId,
          barcode: barcode || null,
          minStock: Number(minStock),
          ...(canPrice && salePrice ? { salePrice } : {}),
        });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setError('');
    try {
      if (editing)
        await update.mutateAsync({ id: editing.id, input: updateProductSchema.parse(common) });
      else
        await create.mutateAsync(
          createProductSchema.parse({
            ...common,
            categoryId,
            barcode: barcode || null,
            minStock: Number(minStock),
            ...(canPrice && salePrice ? { salePrice } : {}),
          }),
        );
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el producto');
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
    >
      <h2 className="text-lg font-semibold">{editing ? 'Editar producto' : 'Nuevo producto'}</h2>
      {!editing && categories.isSuccess && activeCategories.length === 0 && (
        <p className="text-sm text-amber-700">
          Primero{' '}
          <Link to="/categorias" className="underline">
            crea una categoría
          </Link>
          .
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {!editing && (
          <div className="space-y-1">
            <label htmlFor="product-category" className="block text-sm font-medium text-stone-700">
              Categoría
            </label>
            <select
              id="product-category"
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value);
              }}
              className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              required
            >
              <option value="">Seleccionar categoría</option>
              {activeCategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <Input
          label="Nombre del producto"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          maxLength={200}
          required
        />
        <Input
          label="Modelo (opcional)"
          value={model}
          onChange={(event) => {
            setModel(event.target.value);
          }}
          maxLength={100}
        />
        {!editing && (
          <Input
            label="Stock mínimo en piezas"
            type="number"
            min={0}
            step={1}
            value={minStock}
            onChange={(event) => {
              setMinStock(event.target.value);
            }}
          />
        )}
        {!editing && (
          <Input
            label="Código del proveedor (si tiene)"
            value={barcode}
            onChange={(event) => {
              setBarcode(event.target.value);
            }}
            maxLength={64}
          />
        )}
        {!editing && canPrice && (
          <Input
            label="Precio de venta (Bs, opcional)"
            inputMode="decimal"
            value={salePrice}
            onChange={(event) => {
              setSalePrice(event.target.value);
            }}
            placeholder="0.00"
          />
        )}
      </div>
      <div className="space-y-1">
        <label htmlFor="product-description" className="block text-sm font-medium text-stone-700">
          Descripción (opcional)
        </label>
        <textarea
          id="product-description"
          maxLength={2000}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
          className="block min-h-20 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-brand-500"
        />
      </div>
      {!editing && (
        <p className="text-sm text-stone-600">
          El SKU se asigna automáticamente. Si no hay código del proveedor, podrás generar uno
          propio después de guardar.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={
            create.isPending || update.isPending || (!editing && activeCategories.length === 0)
          }
        >
          Guardar producto
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
