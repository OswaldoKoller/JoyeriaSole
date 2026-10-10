import {
  PERMISSIONS,
  configureAxesSchema,
  createVariantSchema,
  type Product,
} from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useHasPermission } from '../auth/use-auth.ts';
import { useAttributes } from './use-attributes.ts';
import { useConfigureAxes, useCreateVariant } from './use-products.ts';

export function ConfigureAxesForm({ product, onClose }: { product: Product; onClose: () => void }) {
  const attributes = useAttributes();
  const configure = useConfigureAxes();
  const [axes, setAxes] = useState([{ attributeId: '', optionId: '' }]);
  const [error, setError] = useState('');
  const choices =
    attributes.data?.data.filter(
      (item) => item.dataType === 'OPTION' && item.options.some((option) => option.isActive),
    ) ?? [];

  function update(index: number, attributeId: string, optionId: string) {
    setAxes((current) =>
      current.map((axis, position) => (position === index ? { attributeId, optionId } : axis)),
    );
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = configureAxesSchema.safeParse({ axes });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Seleccione atributos y valores');
      return;
    }
    setError('');
    try {
      await configure.mutateAsync({ productId: product.id, input: parsed.data });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron configurar las variantes');
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="mt-4 space-y-3 rounded-lg border border-brand-100 bg-brand-50 p-4"
    >
      <h3 className="font-semibold">Ejes de variante para {product.name}</h3>
      <p className="text-sm text-stone-600">
        Selecciona los valores de la pieza ya registrada. Después podrás añadir otras combinaciones.
      </p>
      {attributes.isPending && <p role="status">Cargando atributos…</p>}
      {choices.length === 0 && attributes.isSuccess && (
        <p className="text-sm text-amber-700">
          Agrega valores a un atributo de tipo lista antes de configurar variantes.
        </p>
      )}
      {axes.map((axis, index) => {
        const attribute = choices.find((item) => item.id === axis.attributeId);
        return (
          <div key={index} className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`axis-attribute-${index}`} className="text-sm font-medium">
                Atributo {index + 1}
              </label>
              <select
                id={`axis-attribute-${index}`}
                value={axis.attributeId}
                onChange={(event) => {
                  update(index, event.target.value, '');
                }}
                className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                required
              >
                <option value="">Seleccionar atributo</option>
                {choices.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor={`axis-option-${index}`} className="text-sm font-medium">
                Valor de la variante base
              </label>
              <select
                id={`axis-option-${index}`}
                value={axis.optionId}
                onChange={(event) => {
                  update(index, axis.attributeId, event.target.value);
                }}
                className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                required
              >
                <option value="">Seleccionar valor</option>
                {attribute?.options
                  .filter((option) => option.isActive)
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.value}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        );
      })}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={configure.isPending || choices.length === 0}>
          Guardar ejes
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setAxes((current) => [...current, { attributeId: '', optionId: '' }]);
          }}
          disabled={axes.length >= choices.length}
        >
          Agregar eje
        </Button>
        {axes.length > 1 && (
          <Button
            variant="secondary"
            onClick={() => {
              setAxes((current) => current.slice(0, -1));
            }}
          >
            Quitar último eje
          </Button>
        )}
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function CreateVariantForm({ product, onClose }: { product: Product; onClose: () => void }) {
  const canPrice = useHasPermission(PERMISSIONS.PRICES_MANAGE);
  const create = useCreateVariant();
  const [options, setOptions] = useState<Record<string, string>>({});
  const [barcode, setBarcode] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [minStock, setMinStock] = useState('0');
  const [error, setError] = useState('');

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createVariantSchema.safeParse({
      values: product.axes.map((axis) => ({
        attributeId: axis.attributeId,
        optionId: options[axis.attributeId] ?? '',
      })),
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
      await create.mutateAsync({ productId: product.id, input: parsed.data });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear la variante');
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="mt-4 space-y-3 rounded-lg border border-brand-100 bg-brand-50 p-4"
    >
      <h3 className="font-semibold">Nueva variante de {product.name}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {product.axes.map((axis) => (
          <div key={axis.attributeId} className="space-y-1">
            <label htmlFor={`variant-axis-${axis.attributeId}`} className="text-sm font-medium">
              {axis.name}
            </label>
            <select
              id={`variant-axis-${axis.attributeId}`}
              value={options[axis.attributeId] ?? ''}
              onChange={(event) => {
                setOptions((current) => ({ ...current, [axis.attributeId]: event.target.value }));
              }}
              className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              required
            >
              <option value="">Seleccionar valor</option>
              {axis.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.value}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Código del proveedor (si tiene)"
          value={barcode}
          onChange={(event) => {
            setBarcode(event.target.value);
          }}
          maxLength={64}
        />
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
        {canPrice && (
          <Input
            label="Precio de venta de la variante (Bs, opcional)"
            inputMode="decimal"
            value={salePrice}
            onChange={(event) => {
              setSalePrice(event.target.value);
            }}
          />
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending}>
          Guardar variante
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
