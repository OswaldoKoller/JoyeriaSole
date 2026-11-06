import {
  PERMISSIONS,
  createProductSchema,
  updateProductSchema,
  type Attribute,
  type Product,
} from '@joyeria/shared';
import { useMemo, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useHasPermission } from '../auth/use-auth.ts';
import { useSuppliers } from '../suppliers/use-suppliers.ts';
import { AttributeFields } from './attribute-fields.tsx';
import {
  attributeLabel,
  buildAttributeInputs,
  draftFromProduct,
  missingRequired,
  sortBySuggestedUse,
  type AttributeDraft,
} from './attribute-values.ts';
import { useAttributes } from './use-attributes.ts';
import { categoryPath, effectiveCategoryAttributes, useCategories } from './use-categories.ts';
import { useCreateProduct, useUpdateProduct } from './use-products.ts';

const select =
  'block min-h-10 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none';

/** B4: ayuda de nomenclatura del nombre del producto. */
export const NAME_HINT =
  'Formato sugerido: <Tipo de pieza> <rasgo principal> <modelo>, sin repetir material, talla ni otros atributos. Ejemplos: «Anillo corazón con circonia», «Cadena cubana».';

function AxisPicker({
  attributes,
  chosen,
  values,
  onToggle,
  onValue,
}: {
  attributes: Attribute[];
  chosen: ReadonlySet<string>;
  values: Record<string, string>;
  onToggle: (attributeId: string, checked: boolean) => void;
  onValue: (attributeId: string, optionId: string) => void;
}) {
  const row = (attribute: Attribute) => {
    const active = attribute.options.filter((option) => option.isActive);
    return (
      <div key={attribute.id} className="grid gap-2 sm:grid-cols-2 sm:items-end">
        <label className="flex min-h-10 items-center gap-2 text-sm font-medium text-stone-700">
          <input
            type="checkbox"
            checked={chosen.has(attribute.id)}
            disabled={active.length === 0}
            onChange={(event) => {
              onToggle(attribute.id, event.target.checked);
            }}
            className="size-4 rounded border-stone-300"
          />
          Variante por {attribute.name}
          {active.length === 0 && (
            <span className="text-xs font-normal text-stone-500">(sin valores cargados)</span>
          )}
        </label>
        {chosen.has(attribute.id) && (
          <div className="space-y-1">
            <label
              htmlFor={`axis-value-${attribute.id}`}
              className="block text-sm font-medium text-stone-700"
            >
              {`Valor de ${attribute.name} (primera variante)`}
            </label>
            <select
              id={`axis-value-${attribute.id}`}
              value={values[attribute.id] ?? ''}
              onChange={(event) => {
                onValue(attribute.id, event.target.value);
              }}
              className={select}
            >
              <option value="">Seleccionar valor</option>
              {active.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.value}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  };
  const suggested = attributes.filter((attribute) => attribute.suggestedUse === 'VARIANT_AXIS');
  const others = attributes.filter((attribute) => attribute.suggestedUse !== 'VARIANT_AXIS');
  return (
    <fieldset className="space-y-3 rounded-lg border border-stone-200 p-4">
      <legend className="px-1 text-sm font-semibold text-stone-800">Variantes de la pieza</legend>
      <p className="text-sm text-stone-600">
        Cada combinación de estos atributos tiene su propio SKU y su propio stock. Si la pieza es
        única, déjelos sin marcar. Después podrá agregar las demás combinaciones.
      </p>
      {suggested.map(row)}
      {others.length > 0 && (
        <details className="space-y-3">
          <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium text-brand-700">
            Otros atributos de lista
          </summary>
          <div className="space-y-3 pt-1">{others.map(row)}</div>
        </details>
      )}
    </fieldset>
  );
}

export function ProductForm({
  editing,
  onClose,
}: {
  editing?: Product;
  /** `warnings`: avisos no bloqueantes de la operación (p. ej. código del proveedor repetido). */
  onClose: (warnings?: string[]) => void;
}) {
  const canPrice = useHasPermission(PERMISSIONS.PRICES_APPROVE);
  const categories = useCategories();
  const attributes = useAttributes();
  const suppliers = useSuppliers(1, '', 'active');
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '');
  const [name, setName] = useState(editing?.name ?? '');
  const [model, setModel] = useState(editing?.model ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [barcode, setBarcode] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [minStock, setMinStock] = useState('0');
  const [axisIds, setAxisIds] = useState<ReadonlySet<string>>(new Set());
  const [axisValues, setAxisValues] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<AttributeDraft>(editing ? draftFromProduct(editing) : {});
  const [error, setError] = useState('');

  const allCategories = useMemo(() => categories.data?.data ?? [], [categories.data]);
  const activeCategories = allCategories.filter((item) => item.isActive);
  const category = allCategories.find((item) => item.id === (editing?.categoryId ?? categoryId));
  const assigned = useMemo(
    () => effectiveCategoryAttributes(category, allCategories),
    [category, allCategories],
  );
  const requiredIds = useMemo(
    () => new Set(assigned.filter((item) => item.isRequired).map((item) => item.attributeId)),
    [assigned],
  );

  const all = attributes.data?.data ?? [];
  const lists = all.filter(
    (attribute) => attribute.dataType === 'OPTION' && attribute.options.some((o) => o.isActive),
  );
  const editingAxisIds = new Set(editing?.axes.map((axis) => axis.attributeId));
  // Características: todo atributo que no sea eje de variante de esta ficha.
  const characteristics = all.filter(
    (attribute) => !(editing ? editingAxisIds : axisIds).has(attribute.id),
  );
  const descriptive = characteristics.filter(
    (attribute) => attribute.suggestedUse === 'DESCRIPTIVE',
  );
  const otherCharacteristics = characteristics.filter(
    (attribute) => attribute.suggestedUse !== 'DESCRIPTIVE',
  );

  function changeCategory(id: string) {
    setCategoryId(id);
    const chosen = allCategories.find((item) => item.id === id);
    const defaults = effectiveCategoryAttributes(chosen, allCategories)
      .filter((item) => item.isVariantAxisDefault)
      .map((item) => item.attributeId)
      .filter((attributeId) => lists.some((attribute) => attribute.id === attributeId));
    setAxisIds(new Set(defaults));
  }

  function toggleAxis(attributeId: string, checked: boolean) {
    setAxisIds((current) => {
      const next = new Set(current);
      if (checked) next.add(attributeId);
      else next.delete(attributeId);
      return next;
    });
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing = missingRequired(characteristics, requiredIds, draft);
    if (missing.length > 0) {
      setError(`Complete las características obligatorias de la categoría: ${missing.join(', ')}.`);
      return;
    }
    const common = {
      name,
      model: model || null,
      description: description || null,
      attributes: buildAttributeInputs(characteristics, draft),
    };
    const axes = [...axisIds].map((attributeId) => ({
      attributeId,
      optionId: axisValues[attributeId] ?? '',
    }));
    const input = editing
      ? updateProductSchema.safeParse(common)
      : createProductSchema.safeParse({
          ...common,
          categoryId,
          barcode: barcode || null,
          supplierId: barcode && supplierId ? supplierId : null,
          minStock: Number(minStock),
          ...(axes.length > 0 ? { axes } : {}),
          ...(canPrice && salePrice ? { salePrice } : {}),
        });
    if (!input.success) {
      const unselected = axes.find((axis) => !axis.optionId);
      setError(
        unselected
          ? 'Seleccione el valor de cada atributo marcado como variante.'
          : (input.error.issues[0]?.message ?? 'Datos inválidos'),
      );
      return;
    }
    setError('');
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input: updateProductSchema.parse(common) });
        onClose();
      } else {
        const result = await create.mutateAsync(createProductSchema.parse(input.data));
        onClose(result.meta.warnings);
      }
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
                changeCategory(event.target.value);
              }}
              className={select}
              required
            >
              <option value="">Seleccionar categoría</option>
              {activeCategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {categoryPath(item, allCategories)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <Input
            label="Nombre del producto"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            placeholder="Ej.: Anillo corazón con circonia"
            aria-describedby="product-name-hint"
            maxLength={200}
            required
          />
          <p id="product-name-hint" className="text-xs text-stone-600">
            {NAME_HINT}
          </p>
        </div>
        <Input
          label="Modelo (opcional)"
          value={model}
          onChange={(event) => {
            setModel(event.target.value);
          }}
          maxLength={100}
        />
        {!editing && (
          <div className="space-y-1">
            <Input
              label="Stock mínimo en piezas"
              type="number"
              min={0}
              step={1}
              value={minStock}
              aria-describedby="product-min-stock-hint"
              onChange={(event) => {
                setMinStock(event.target.value);
              }}
            />
            <p id="product-min-stock-hint" className="text-xs text-stone-600">
              0 desactiva la alerta de stock bajo para esta pieza.
            </p>
          </div>
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
        {!editing && barcode.trim() !== '' && (
          <div className="space-y-1">
            <label htmlFor="product-supplier" className="block text-sm font-medium text-stone-700">
              Proveedor de ese código (opcional)
            </label>
            <select
              id="product-supplier"
              value={supplierId}
              onChange={(event) => {
                setSupplierId(event.target.value);
              }}
              className={select}
            >
              <option value="">Sin proveedor</option>
              {suppliers.data?.data.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {!editing && canPrice && (
          <div className="space-y-1">
            <Input
              label="Precio de venta inicial (neto)"
              inputMode="decimal"
              value={salePrice}
              onChange={(event) => {
                setSalePrice(event.target.value);
              }}
              aria-describedby="product-price-hint"
              placeholder="0.00"
            />
            <p id="product-price-hint" className="text-xs text-stone-600">
              En bolivianos, antes de impuestos. Puede quedar en 0; después solo cambia desde
              Precios.
            </p>
          </div>
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
      {!editing && lists.length > 0 && (
        <AxisPicker
          attributes={sortBySuggestedUse(lists, 'VARIANT_AXIS')}
          chosen={axisIds}
          values={axisValues}
          onToggle={toggleAxis}
          onValue={(attributeId, optionId) => {
            setAxisValues((current) => ({ ...current, [attributeId]: optionId }));
          }}
        />
      )}
      {characteristics.length > 0 && (
        <fieldset className="space-y-3 rounded-lg border border-stone-200 p-4">
          <legend className="px-1 text-sm font-semibold text-stone-800">
            Características (opcional)
          </legend>
          <p className="text-sm text-stone-600">
            Datos informativos de la ficha. Una ficha sin descripción ni características queda
            marcada como incompleta hasta que se complete.
          </p>
          <AttributeFields
            attributes={descriptive}
            draft={draft}
            requiredIds={requiredIds}
            idPrefix="characteristic"
            onChange={(attributeId, value) => {
              setDraft((current) => ({ ...current, [attributeId]: value }));
            }}
          />
          {otherCharacteristics.length > 0 && (
            <details className="space-y-3">
              <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium text-brand-700">
                Otros atributos como característica
              </summary>
              <AttributeFields
                attributes={otherCharacteristics}
                draft={draft}
                requiredIds={requiredIds}
                idPrefix="characteristic"
                onChange={(attributeId, value) => {
                  setDraft((current) => ({ ...current, [attributeId]: value }));
                }}
              />
            </details>
          )}
          {[...requiredIds].some((id) => characteristics.some((a) => a.id === id)) && (
            <p className="text-xs text-stone-600">
              Obligatorias en esta categoría:{' '}
              {characteristics
                .filter((attribute) => requiredIds.has(attribute.id))
                .map((attribute) => attributeLabel(attribute, false))
                .join(', ')}
              .
            </p>
          )}
        </fieldset>
      )}
      {!editing && (
        <p className="text-sm text-stone-600">
          El SKU se asigna automáticamente. Si no hay código del proveedor, podrás generar uno
          propio después de guardar. La etiqueta impresa lleva siempre el SKU.{' '}
          {canPrice
            ? 'El precio de venta inicial queda registrado en el historial; después solo cambia desde Precios.'
            : 'El precio de venta se define después desde Precios (lo fija el Administrador).'}
        </p>
      )}
      {editing && (
        <p className="text-sm text-stone-600">
          El precio de venta no se edita aquí: se cambia desde{' '}
          <Link to="/precios" className="text-brand-700 underline">
            Precios
          </Link>
          .
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
        <Button
          variant="secondary"
          onClick={() => {
            onClose();
          }}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
