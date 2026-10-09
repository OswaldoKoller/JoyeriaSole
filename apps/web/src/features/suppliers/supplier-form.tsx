import { createSupplierSchema, type CreateSupplierInput, type Supplier } from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';

type Field = 'name' | 'taxId' | 'contactName' | 'phone' | 'email' | 'address' | 'notes';
type Values = Record<Field, string>;

function valuesFrom(supplier?: Supplier): Values {
  return {
    name: supplier?.name ?? '',
    taxId: supplier?.taxId ?? '',
    contactName: supplier?.contactName ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    address: supplier?.address ?? '',
    notes: supplier?.notes ?? '',
  };
}

export function SupplierForm({
  supplier,
  isPending,
  onSave,
  onCancel,
}: {
  supplier?: Supplier;
  isPending: boolean;
  onSave: (input: CreateSupplierInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(() => valuesFrom(supplier));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  function set(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = createSupplierSchema.safeParse({
      name: values.name,
      taxId: values.taxId || null,
      contactName: values.contactName || null,
      phone: values.phone || null,
      email: values.email || null,
      address: values.address || null,
      notes: values.notes || null,
    });
    if (!result.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as Field;
        next[field] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    await onSave(result.data);
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
    >
      <h2 className="text-lg font-semibold">{supplier ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
      <p className="text-sm text-stone-600">
        El nombre es obligatorio; los demás datos son opcionales.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Nombre"
          required
          maxLength={200}
          value={values.name}
          onChange={(e) => {
            set('name', e.target.value);
          }}
          error={errors.name}
        />
        <Input
          label="NIT o identificador"
          maxLength={30}
          value={values.taxId}
          onChange={(e) => {
            set('taxId', e.target.value);
          }}
          error={errors.taxId}
        />
        <Input
          label="Persona de contacto"
          maxLength={120}
          value={values.contactName}
          onChange={(e) => {
            set('contactName', e.target.value);
          }}
          error={errors.contactName}
        />
        <Input
          label="Teléfono"
          maxLength={40}
          value={values.phone}
          onChange={(e) => {
            set('phone', e.target.value);
          }}
          error={errors.phone}
        />
        <Input
          label="Correo electrónico"
          type="email"
          maxLength={254}
          value={values.email}
          onChange={(e) => {
            set('email', e.target.value);
          }}
          error={errors.email}
        />
        <Input
          label="Dirección"
          maxLength={300}
          value={values.address}
          onChange={(e) => {
            set('address', e.target.value);
          }}
          error={errors.address}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="supplier-notes" className="block text-sm font-medium text-stone-700">
          Notas
        </label>
        <textarea
          id="supplier-notes"
          maxLength={2000}
          value={values.notes}
          onChange={(e) => {
            set('notes', e.target.value);
          }}
          aria-invalid={!!errors.notes}
          aria-describedby={errors.notes ? 'supplier-notes-error' : undefined}
          className="block min-h-24 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-100 focus:outline-brand-500"
        />
        {errors.notes && (
          <p id="supplier-notes-error" className="text-xs text-red-600">
            {errors.notes}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Guardando…' : 'Guardar proveedor'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
