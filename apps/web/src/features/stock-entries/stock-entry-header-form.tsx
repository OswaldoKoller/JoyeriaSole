import {
  PERMISSIONS,
  STOCK_ENTRY_CURRENCY_LABELS,
  SUPPLIER_CURRENCY_LABELS,
  createStockEntrySchema,
  documentDateBounds,
  type CreateStockEntryInput,
  type StockEntryCurrency,
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
  currency: 'Moneda',
  exchangeRate: 'Tipo de cambio',
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

/** Cabecera del ingreso: proveedor, documento de respaldo, moneda de compra y tipo de cambio. */
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
  const canReadCosts = useHasPermission(PERMISSIONS.COSTS_READ);
  const suppliers = useActiveSuppliers(canReadSuppliers);
  const initial = {
    supplierId: entry?.supplierId ?? '',
    documentType: entry?.documentType ?? '',
    documentNumber: entry?.documentNumber ?? '',
    documentDate: entry?.documentDate ?? '',
    currency: entry?.currency ?? 'BOB',
    exchangeRate: entry?.exchangeRate ?? '',
    notes: entry?.notes ?? '',
  };
  const [values, setValues] = useState(initial);
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [error, setError] = useState('');
  const bounds = documentDateBounds();

  const change = (patch: Partial<typeof values>) => {
    const next = { ...values, ...patch };
    setValues(next);
    onDirtyChange?.(JSON.stringify(next) !== JSON.stringify(initial));
  };

  // El proveedor actual puede estar inactivo y no figurar en la lista de activos.
  const options = [...(suppliers.data ?? [])];
  if (entry && !options.some((supplier) => supplier.id === entry.supplierId)) {
    options.unshift({ id: entry.supplierId, name: entry.supplierName } as (typeof options)[number]);
  }
  const selected = options.find((supplier) => supplier.id === values.supplierId);

  function chooseSupplier(supplierId: string) {
    const supplier = options.find((item) => item.id === supplierId);
    // Sugerencia: la moneda habitual del proveedor, mientras no se haya elegido otra a mano.
    if (!entry && !currencyTouched && supplier?.defaultCurrency && canReadCosts) {
      change({
        supplierId,
        currency: supplier.defaultCurrency,
        exchangeRate: supplier.defaultCurrency === 'USD' ? values.exchangeRate : '',
      });
    } else {
      change({ supplierId });
    }
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const parsed = createStockEntrySchema.safeParse({
      ...values,
      documentDate: values.documentDate || null,
      exchangeRate: values.currency === 'USD' ? values.exchangeRate.trim() || null : null,
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
    if (values.documentDate && values.documentDate < bounds.min) {
      setError('La fecha del documento no puede ser anterior a 30 días.');
      return;
    }
    if (values.documentDate && values.documentDate > bounds.max) {
      setError('La fecha del documento no puede ser futura.');
      return;
    }
    await onSubmit(parsed.data);
  }

  const disabled = !editable || pending;
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
              chooseSupplier(event.target.value);
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
            change({ documentType: event.target.value });
          }}
          placeholder="Factura, nota de remisión…"
          maxLength={40}
          disabled={disabled}
        />
        <Input
          label="Número de documento"
          value={values.documentNumber}
          onChange={(event) => {
            change({ documentNumber: event.target.value });
          }}
          maxLength={60}
          disabled={disabled}
        />
        <div className="space-y-1">
          <Input
            label="Fecha del documento"
            type="date"
            value={values.documentDate}
            min={bounds.min}
            max={bounds.max}
            onChange={(event) => {
              change({ documentDate: event.target.value });
            }}
            disabled={disabled}
          />
          <p className="text-xs text-stone-500">Hasta 30 días atrás; no puede ser futura.</p>
        </div>
      </div>

      {canReadCosts && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-stone-800">Moneda de la compra</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="entry-currency" className="block text-sm font-medium text-stone-700">
                Moneda
              </label>
              <select
                id="entry-currency"
                value={values.currency}
                onChange={(event) => {
                  setCurrencyTouched(true);
                  const currency = event.target.value as StockEntryCurrency;
                  change({ currency, ...(currency === 'BOB' && { exchangeRate: '' }) });
                }}
                disabled={disabled}
                className="block min-h-10 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:bg-stone-50"
              >
                <option value="BOB">{STOCK_ENTRY_CURRENCY_LABELS.BOB}</option>
                <option value="USD">{STOCK_ENTRY_CURRENCY_LABELS.USD}</option>
              </select>
              {selected?.defaultCurrency && (
                <p className="text-xs text-stone-500">
                  Moneda habitual del proveedor:{' '}
                  {SUPPLIER_CURRENCY_LABELS[selected.defaultCurrency]}.
                </p>
              )}
            </div>
            {values.currency === 'USD' && (
              <div className="space-y-1">
                <Input
                  label="Tipo de cambio (Bs por USD)"
                  value={values.exchangeRate}
                  onChange={(event) => {
                    change({ exchangeRate: event.target.value });
                  }}
                  inputMode="decimal"
                  placeholder="6.96"
                  disabled={disabled}
                />
                <p className="text-xs text-stone-500">
                  Manual, mayor que cero, hasta 4 decimales. Queda fijo al confirmar.
                </p>
              </div>
            )}
          </div>
          <p className="text-xs text-stone-500">
            Los precios de compra se digitan en esta moneda. Costos, stock y precios del sistema se
            llevan en bolivianos.
          </p>
        </fieldset>
      )}

      <div className="space-y-1">
        <label htmlFor="entry-notes" className="block text-sm font-medium text-stone-700">
          Observaciones
        </label>
        <textarea
          id="entry-notes"
          value={values.notes}
          onChange={(event) => {
            change({ notes: event.target.value });
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
