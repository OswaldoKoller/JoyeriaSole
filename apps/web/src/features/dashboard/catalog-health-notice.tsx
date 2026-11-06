import { PERMISSIONS } from '@joyeria/shared';
import { Link } from 'react-router';
import { useHasPermission } from '../auth/use-auth.ts';
import { useCatalogHealth } from '../catalog/use-products.ts';

const link =
  'inline-flex min-h-10 items-center rounded-md px-1 font-medium text-brand-700 underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none';

/**
 * Aviso discreto (C1, D9) para quien gestiona el catálogo: fichas incompletas y piezas sin
 * precio. No muestra costos y desaparece cuando no hay nada pendiente.
 */
export function CatalogHealthNotice() {
  const canManage = useHasPermission(PERMISSIONS.CATALOG_MANAGE);
  const health = useCatalogHealth(canManage);
  if (!canManage || !health.data) return null;
  const { incompleteProducts, productsWithoutPrice } = health.data;
  if (incompleteProducts === 0 && productsWithoutPrice === 0) return null;
  return (
    <section
      aria-label="Fichas por completar"
      className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      {incompleteProducts > 0 && (
        <p>
          <strong>{incompleteProducts}</strong>{' '}
          {incompleteProducts === 1 ? 'ficha incompleta' : 'fichas incompletas'}{' '}
          <Link to="/productos?incomplete=1" className={link}>
            Ver fichas incompletas
          </Link>
        </p>
      )}
      {productsWithoutPrice > 0 && (
        <p>
          <strong>{productsWithoutPrice}</strong>{' '}
          {productsWithoutPrice === 1 ? 'producto sin precio' : 'productos sin precio'}{' '}
          <Link to="/productos?withoutPrice=1" className={link}>
            Ver productos sin precio
          </Link>
        </p>
      )}
    </section>
  );
}
