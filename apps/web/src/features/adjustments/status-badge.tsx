import type { AdjustmentStatus } from '@joyeria/shared';

const LABELS: Record<AdjustmentStatus, string> = {
  PENDING: 'Pendiente de aprobación',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  CANCELLED: 'Cancelado',
};

const STYLES: Record<AdjustmentStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-800',
  APPROVED: 'bg-emerald-50 text-emerald-800',
  REJECTED: 'bg-red-50 text-red-800',
  CANCELLED: 'bg-stone-100 text-stone-600',
};

export function AdjustmentStatusBadge({ status }: { status: AdjustmentStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
