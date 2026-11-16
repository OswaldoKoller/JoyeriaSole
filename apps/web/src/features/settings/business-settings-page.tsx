import {
  MAX_LOGO_UPLOAD_BYTES,
  RECEIPT_FOOTER_NOTE_MAX_LENGTH,
  updateBusinessSettingsSchema,
  type BusinessSettings,
  type UpdateBusinessSettingsInput,
} from '@joyeria/shared';
import { useRef, useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { formatDateTime } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { logoUrl } from '../sales/logo-url.ts';
import {
  useBusinessSettings,
  useRemoveBusinessLogo,
  useUpdateBusinessSettings,
  useUploadBusinessLogo,
} from './use-business-settings.ts';

type Field = keyof UpdateBusinessSettingsInput;
const FIELDS: readonly Field[] = [
  'tradeName',
  'address',
  'phone',
  'taxId',
  'receiptShowSeller',
  'receiptFooterNote',
];

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Logo del negocio: se imprime en el encabezado de los comprobantes de venta y de cambio. Acepta
 * PNG, JPG o WebP de hasta 2 MB; el servidor lo reduce (máximo 600 × 300 px) y lo guarda como WebP.
 * Subir o quitar el logo se guarda al instante (no depende del botón «Guardar datos»).
 */
function LogoSection({ settings }: { settings: BusinessSettings }) {
  const upload = useUploadBusinessLogo();
  const remove = useRemoveBusinessLogo();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const busy = upload.isPending || remove.isPending;

  async function onFile(file: File | undefined) {
    setError('');
    setNotice('');
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      setError('Elija una imagen PNG, JPG o WebP.');
      return;
    }
    if (file.size > MAX_LOGO_UPLOAD_BYTES) {
      setError('El logo pesa más de 2 MB. Elija una imagen más liviana.');
      return;
    }
    try {
      await upload.mutateAsync(file);
      setNotice('Logo guardado. Los comprobantes lo mostrarán desde ahora.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No se pudo subir el logo.');
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  async function onRemove() {
    setError('');
    setNotice('');
    try {
      await remove.mutateAsync();
      setNotice('Logo quitado. Los comprobantes saldrán sin imagen.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No se pudo quitar el logo.');
    }
  }

  return (
    <div className="max-w-xl space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
      <h2 className="text-lg font-semibold">Logo del negocio</h2>
      {settings.logo ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white p-4 text-center">
          <img
            src={logoUrl(settings.logo.sha256)}
            alt={`Logo de ${settings.tradeName}`}
            className="mx-auto max-h-32 w-auto max-w-full object-contain"
          />
        </div>
      ) : (
        <p className="text-sm text-stone-700">
          Todavía no hay un logo: el comprobante sale solo con el nombre.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor="business-logo-file"
          className="inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-brand-700 px-4 text-sm font-medium text-white focus-within:ring-2 focus-within:ring-brand-500 focus-within:ring-offset-2 hover:bg-brand-800"
        >
          {busy ? 'Procesando…' : settings.logo ? 'Cambiar logo' : 'Subir logo'}
        </label>
        <input
          ref={input}
          id="business-logo-file"
          type="file"
          accept={LOGO_TYPES.join(',')}
          disabled={busy}
          className="sr-only"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        {settings.logo && (
          <Button variant="secondary" disabled={busy} onClick={() => void onRemove()}>
            Quitar logo
          </Button>
        )}
      </div>
      <p className="text-xs text-stone-600">
        PNG, JPG o WebP de hasta 2 MB. Mejor con fondo transparente o blanco y en blanco y negro si
        imprime en rollo térmico.
      </p>
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
    </div>
  );
}

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
      {settings.data && (
        <>
          <SettingsForm settings={settings.data} />
          <LogoSection settings={settings.data} />
        </>
      )}
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
  const [footerNote, setFooterNote] = useState(settings.receiptFooterNote ?? '');
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
      receiptFooterNote: footerNote,
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
      <div className="space-y-1">
        <label htmlFor="business-footer-note" className="block text-sm font-medium text-stone-700">
          Leyenda al pie del comprobante (opcional)
        </label>
        <textarea
          id="business-footer-note"
          value={footerNote}
          rows={3}
          maxLength={RECEIPT_FOOTER_NOTE_MAX_LENGTH}
          onChange={(event) => {
            setFooterNote(event.target.value);
          }}
          aria-invalid={!!errors.receiptFooterNote}
          aria-describedby="business-footer-help"
          className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none aria-invalid:border-red-500"
        />
        <p id="business-footer-help" className="text-xs text-stone-600">
          Política de la tienda que se imprime al final del comprobante de venta y de cambio, por
          ejemplo: no hay devoluciones, solo cambio de pieza. Déjela vacía para no imprimir nada.
        </p>
        {errors.receiptFooterNote && (
          <p className="text-xs text-red-600">{errors.receiptFooterNote}</p>
        )}
      </div>
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
