import {
  updateBusinessSettingsSchema,
  type BusinessSettings,
  type UpdateBusinessSettingsInput,
} from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { formatDateTime } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { useBusinessSettings, useUpdateBusinessSettings } from './use-business-settings.ts';

type Field = keyof UpdateBusinessSettingsInput;
const FIELDS: readonly Field[] = ['tradeName', 'address', 'phone', 'taxId', 'receiptShowSeller'];

/**
 * Datos del negocio (`/configuracion/negocio`, solo Administrador): nombre comercial, dirección,
 * teléfono, NIT opcional y si el comprobante imprime el nombre de quien atendió. Los comprobantes
 * (también las reimpresiones) muestran los datos vigentes; los importes de las ventas no cambian.
 */
export function BusinessSettingsPage() {
  useDocumentTitle('Datos del negocio');
  const settings = useBusinessSettings();
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Datos del negocio</h1>
        <p className="text-sm text-stone-600">
          Aparecen en el encabezado del comprobante interno. Cambiarlos no modifica ninguna venta.
        </p>
      </div>
      {settings.isPending && (
        <p role="status" className="text-sm">
          Cargando…
        </p>
      )}
      {settings.isError && (
        <p role="alert" className="text-sm text-red-700">
          No se pudieron cargar los datos del negocio.
        </p>
      )}
      {settings.data && <SettingsForm settings={settings.data} />}
    </section>
  );
}

function SettingsForm({ settings }: { settings: BusinessSettings }) {
  const update = useUpdateBusinessSettings();
  const [tradeName, setTradeName] = useState(settings.tradeName);
  const [address, setAddress] = useState(settings.address ?? '');
  const [phone, setPhone] = useState(settings.phone ?? '');
  const [taxId, setTaxId] = useState(settings.taxId ?? '');
  const [showSeller, setShowSeller] = useState(settings.receiptShowSeller);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    const parsed = updateBusinessSettingsSchema.safeParse({
      tradeName,
      address,
      phone,
      taxId,
      receiptShowSeller: showSeller,
    });
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = FIELDS.find((name) => name === issue.path[0]);
        if (field && !next[field]) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    try {
      await update.mutateAsync(parsed.data);
      setNotice('Datos guardados. Los comprobantes mostrarán estos datos desde ahora.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No se pudieron guardar los datos.');
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="max-w-xl space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
    >
      {settings.updatedAt === null && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
          Valores provisionales: revíselos antes de usar el comprobante con clientes.
        </p>
      )}
      <Input
        label="Nombre comercial"
        value={tradeName}
        maxLength={120}
        onChange={(event) => {
          setTradeName(event.target.value);
        }}
        error={errors.tradeName}
      />
      <Input
        label="Dirección (opcional)"
        value={address}
        maxLength={200}
        onChange={(event) => {
          setAddress(event.target.value);
        }}
        error={errors.address}
      />
      <Input
        label="Teléfono (opcional)"
        value={phone}
        maxLength={40}
        onChange={(event) => {
          setPhone(event.target.value);
        }}
        error={errors.phone}
      />
      <Input
        label="NIT (opcional)"
        value={taxId}
        maxLength={20}
        onChange={(event) => {
          setTaxId(event.target.value);
        }}
        error={errors.taxId}
      />
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showSeller}
          onChange={(event) => {
            setShowSeller(event.target.checked);
          }}
          className="size-4 accent-brand-700"
        />
        Imprimir en el comprobante el nombre de quien atendió
      </label>
      {settings.updatedBy && (
        <p className="text-xs text-stone-600">
          Última modificación: {settings.updatedBy.name} · {formatDateTime(settings.updatedAt)}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <Button type="submit" disabled={update.isPending}>
        {update.isPending ? 'Guardando…' : 'Guardar datos'}
      </Button>
    </form>
  );
}
