import type { InventoryCountStatus } from '@joyeria/shared';

const COUNT_STATUS_LABELS: Record<InventoryCountStatus, string> = {
  DRAFT: 'Borrador',
  IN_PROGRESS: 'En captura',
  RECOUNT: 'Segundo recuento',
  IN_REVIEW: 'En revisión',
  APPROVED: 'Aprobado',
  CANCELLED: 'Cancelado',
};

const STYLES: Record<InventoryCountStatus, string> = {
  DRAFT: 'bg-stone-100 text-stone-700',
  IN_PROGRESS: 'bg-sky-50 text-sky-800',
  RECOUNT: 'bg-violet-50 text-violet-800',
  IN_REVIEW: 'bg-amber-50 text-amber-800',
  APPROVED: 'bg-emerald-50 text-emerald-800',
  CANCELLED: 'bg-stone-100 text-stone-600',
};

export function CountStatusBadge({ status }: { status: InventoryCountStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[status]}`}>
      {COUNT_STATUS_LABELS[status]}
    </span>
  );
}
