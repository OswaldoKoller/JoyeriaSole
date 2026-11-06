import { useState } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { ChangesTable } from './changes-table.tsx';
import { useVariantPriceHistory } from './use-pricing.ts';
import { Pagination } from '../../components/ui/pagination.tsx';
import { SMALL_PAGE_SIZE } from '../../lib/paging.ts';

/** Panel con el historial de precios de una variante (D5); la API responde 403 al Vendedor. */
export function PriceHistoryPanel({
  variantId,
  sku,
  id,
}: {
  variantId: string;
  sku: string;
  id?: string;
}) {
  const [page, setPage] = useState(1);
  const history = useVariantPriceHistory(variantId, page, true);
  const rows = history.data?.data ?? [];
  const total = history.data?.meta.total ?? 0;

  return (
    <section id={id} aria-label={`Historial de precios de ${sku}`} className="space-y-3">
      <h3 className="text-sm font-semibold">Historial de precios de {sku}</h3>
      {history.isPending && (
        <p role="status" className="text-sm">
          Cargando historial…
        </p>
      )}
      {history.isError && (
        <p role="alert" className="text-sm text-red-700">
          No se pudo cargar el historial de precios.
        </p>
      )}
      {history.isSuccess && rows.length === 0 && (
        <p className="text-sm text-stone-600">Esta variante aún no tiene cambios de precio.</p>
      )}
      {history.isSuccess && rows.length > 0 && <ChangesTable rows={rows} showProduct={false} />}
      <Pagination
        page={page}
        total={total}
        noun="cambios"
        onPageChange={setPage}
        pageSize={SMALL_PAGE_SIZE}
        className=""
      />
    </section>
  );
}

/** Botón que muestra u oculta el historial de precios de una variante (ficha del producto). */
export function VariantPriceHistory({ variantId, sku }: { variantId: string; sku: string }) {
  const [open, setOpen] = useState(false);
  const regionId = `price-history-${variantId}`;
  return (
    <div className="mt-2">
      <Button
        variant="secondary"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {open ? 'Ocultar' : 'Ver'} historial de precios de {sku}
      </Button>
      {open && (
        <div className="mt-3">
          <PriceHistoryPanel id={regionId} variantId={variantId} sku={sku} />
        </div>
      )}
    </div>
  );
}
