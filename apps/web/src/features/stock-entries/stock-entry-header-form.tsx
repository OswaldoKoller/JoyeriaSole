import {
  PERMISSIONS,
  createStockEntrySchema,
  type CreateStockEntryInput,
  type StockEntryDetail,
} from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useHasPermission } from '../auth/use-auth.ts';
import { useActiveSuppliers } from './use-stock-entries.ts';

const FIELD_LABELS: Record<string, string> = {
  supplierId: 'Proveedor',
  documentType: 'Tipo de documento',
  documentNumber: 'Número de documento',
  documentDate: 'Fecha del documento',
  freightCost: 'Transporte',
  packagingCost: 'Embolsado',
  otherCosts: 'Valores extras',
  notes: 'Observaciones',
};

interface HeaderFormProps {
  entry?: StockEntryDetail;
  /** Si es falso, los campos se muestran deshabilitados (ingreso confirmado o cancelado). */
  editable: boolean;
  submitLabel: string;
  pending: boolean;
  serverError: string;
  onSubmit: (input: CreateStockEntryInput) => Promise<void>;
  /** Avisa si hay cambios sin guardar (para no confirmar con datos desactualizados). */
  onDirtyChange?: (dirty: boolean) => void;
}

/** Cabecera del ingreso: proveedor, documento de respaldo y costos adicionales (P-03/P-07). */
export function StockEntryHeaderForm({
  entry,
  editable,
  submitLabel,
  pending,
  serverError,
  onSubmit,
  onDirtyChange,
}: HeaderFormProps) {
  const canReadSuppliers = useHasPermission(PERMISSIONS.SUPPLIERS_READ);
  const suppliers = useActiveSuppliers(canReadSuppliers);
  const initial = {
    supplierId: entry?.supplierId ?? '',
    documentType: entry?.documentType ?? '',
    documentNumber: entry?.documentNumber ?? '',
    documentDate: entry?.documentDate ?? '',
    freightCost: entry?.freightCost ?? '0.00',
    packagingCost: entry?.packagingCost ?? '0.00',
    otherCosts: entry?.otherCosts ?? '0.00',
    notes: entry?.notes ?? '',
  };
  const [values, setValues] = useState(initial);
  const [error, setError] = useState('');

  const set = (field: keyof typeof values) => (value: string) => {
    const next = { ...values, [field]: value };
    setValues(next);
    onDirtyChange?.(JSON.stringify(next) !== JSON.stringify(initial));
  };

  // El proveedor actual puede estar inactivo y no figurar en la lista de activos.
  const options = [...(suppliers.data ?? [])];
  if (entry && !options.some((supplier) => supplier.id === entry.supplierId)) {
    options.unshift({ id: entry.supplierId, name: entry.supplierName } as (typeof options)[number]);
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const parsed = createStockEntrySchema.safeParse({
      ...values,
      documentDate: values.documentDate || null,
      freightCost: values.freightCost.trim() || '0',
      packagingCost: values.packagingCost.trim() || '0',
      otherCosts: values.otherCosts.trim() || '0',
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = String(issue?.path[0] ?? '');
      setError(
        field === 'supplierId'
          ? 'Seleccione un proveedor.'
          : `${FIELD_LABELS[field] ?? 'Dato'}: ${issue?.message ?? 'valor inválido'}.`,
      );
      return;
    }
    await onSubmit(parsed.data);
  }

  const disabled = !editable || pending;
  const money = (field: 'freightCost' | 'packagingCost' | 'otherCosts', label: string) => (
    <Input
      label={label}
      value={values[field]}
      onChange={(event) => {
        set(field)(event.target.value);
      }}
      inputMode="decimal"
      disabled={disabled}
    />
  );

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-label="Cabecera del ingreso"
      className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
    >
      <h2 className="text-lg font-semibold">Proveedor y documento</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="entry-supplier" className="block text-sm font-medium text-stone-700">
            Proveedor
          </label>
          <select
            id="entry-supplier"
            value={values.supplierId}
            onChange={(event) => {
              set('supplierId')(event.target.value);
            }}
            disabled={disabled}
            className="block min-h-10 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:bg-stone-50"
          >
            <option value="">Seleccionar proveedor</option>
            {options.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
          {!canReadSuppliers && !entry && (
            <p className="text-xs text-stone-500">
              Su cuenta no puede consultar proveedores: pida acceso para crear ingresos.
            </p>
          )}
        </div>
        <Input
          label="Tipo de documento"
          value={values.documentType}
          onChange={(event) => {
            set('documentType')(event.target.value);
          }}
          placeholder="Factura, nota de remisión…"
          maxLength={40}
          disabled={disabled}
        />
        <Input
          label="Número de documento"
          value={values.documentNumber}
          onChange={(event) => {
            set('documentNumber')(event.target.value);
          }}
          maxLength={60}
          disabled={disabled}
        />
        <Input
          label="Fecha del documento"
          type="date"
          value={values.documentDate}
          onChange={(event) => {
            set('documentDate')(event.target.value);
          }}
          disabled={disabled}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-stone-800">
          Costos adicionales del ingreso (Bs)
        </legend>
        <p className="text-xs text-stone-500">
          Se reparten entre los ítems en proporción a su valor de compra al confirmar.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {money('freightCost', 'Transporte')}
          {money('packagingCost', 'Embolsado')}
          {money('otherCosts', 'Valores extras')}
        </div>
      </fieldset>

      <div className="space-y-1">
        <label htmlFor="entry-notes" className="block text-sm font-medium text-stone-700">
          Observaciones
        </label>
        <textarea
          id="entry-notes"
          value={values.notes}
          onChange={(event) => {
            set('notes')(event.target.value);
          }}
          rows={2}
          maxLength={2000}
          disabled={disabled}
          className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:bg-stone-50"
        />
      </div>

      {(error || serverError) && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error || serverError}
        </p>
      )}
      {editable && (
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : submitLabel}
        </Button>
      )}
    </form>
  );
}
