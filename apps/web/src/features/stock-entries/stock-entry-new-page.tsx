import type { CreateStockEntryInput } from '@joyeria/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../../lib/api-client.ts';
import { StockEntryHeaderForm } from './stock-entry-header-form.tsx';
import { useCreateStockEntry } from './use-stock-entries.ts';

/** Paso 1: datos del proveedor y del documento. Los ítems se agregan en el borrador creado. */
export function StockEntryNewPage() {
  const navigate = useNavigate();
  const create = useCreateStockEntry();
  const [error, setError] = useState('');

  async function submit(input: CreateStockEntryInput) {
    setError('');
    try {
      const entry = await create.mutateAsync(input);
      await navigate(`/ingresos/${entry.id}`, { replace: true });
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'No se pudo crear el ingreso.');
    }
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <Link
          to="/ingresos"
          className="inline-flex min-h-10 items-center text-sm text-brand-700 underline"
        >
          ← Ingresos de mercadería
        </Link>
        <h1 className="text-2xl font-semibold">Nuevo ingreso</h1>
        <p className="text-sm text-stone-600">
          Se crea como borrador: no cambia el stock hasta que lo confirme.
        </p>
      </div>
      <StockEntryHeaderForm
        editable
        submitLabel="Crear borrador"
        pending={create.isPending}
        serverError={error}
        onSubmit={submit}
      />
    </section>
  );
}
