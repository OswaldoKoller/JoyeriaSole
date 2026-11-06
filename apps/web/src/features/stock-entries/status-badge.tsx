const STATUS_LABELS = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
} as const;

const STATUS_STYLES = {
  DRAFT: 'bg-amber-50 text-amber-800',
  CONFIRMED: 'bg-emerald-50 text-emerald-800',
  CANCELLED: 'bg-stone-100 text-stone-600',
} as const;

export function StatusBadge({ status }: { status: keyof typeof STATUS_LABELS }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
