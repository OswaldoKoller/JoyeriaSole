import { PERMISSIONS } from '@joyeria/shared';
import { Link } from 'react-router';
import { useCurrentUser } from '../auth/use-auth.ts';
import { usePendingApprovals } from './use-pending-approvals.ts';

const link =
  'inline-flex min-h-10 items-center rounded-md px-1 font-medium text-brand-700 underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none';

const APPROVE = [
  PERMISSIONS.INVENTORY_ADJUST_APPROVE,
  PERMISSIONS.PRICES_APPROVE,
  PERMISSIONS.INVENTORY_COUNTS_APPROVE,
];

/**
 * Bandeja «Pendientes de aprobación» del Inicio (Q-14): cuenta lo que espera una resolución
 * (ajustes, cambios de precio y conteos en revisión) y enlaza a cada lista. Solo aparece para
 * quien puede resolver alguno de esos pendientes y desaparece cuando no hay nada.
 */
export function PendingApprovals() {
  const { data: user } = useCurrentUser();
  const allowed = !!user && APPROVE.some((permission) => user.permissions.includes(permission));
  const pending = usePendingApprovals(allowed);
  if (!allowed || !pending.data || pending.data.total === 0) return null;
  const { adjustments, prices, counts, total } = pending.data;
  return (
    <section
      aria-label="Pendientes de aprobación"
      className="border-brand-200 rounded-xl border bg-brand-50 px-4 py-3 text-sm text-stone-900"
    >
      <h2 className="font-semibold">
        Pendientes de aprobación{' '}
        <span className="rounded-full bg-brand-700 px-2 py-0.5 text-xs text-white">{total}</span>
      </h2>
      <ul className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
        {adjustments !== null && adjustments > 0 && (
          <li>
            <strong>{adjustments}</strong> {adjustments === 1 ? 'ajuste' : 'ajustes'}{' '}
            <Link to="/inventario/ajustes?estado=PENDING" className={link}>
              Ver ajustes pendientes
            </Link>
          </li>
        )}
        {prices !== null && prices > 0 && (
          <li>
            <strong>{prices}</strong> {prices === 1 ? 'cambio de precio' : 'cambios de precio'}{' '}
            <Link to="/precios?tab=pendientes" className={link}>
              Ver cambios de precio pendientes
            </Link>
          </li>
        )}
        {counts !== null && counts > 0 && (
          <li>
            <strong>{counts}</strong> {counts === 1 ? 'conteo' : 'conteos'} en revisión{' '}
            <Link to="/inventario/conteos?estado=IN_REVIEW" className={link}>
              Ver conteos en revisión
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}
