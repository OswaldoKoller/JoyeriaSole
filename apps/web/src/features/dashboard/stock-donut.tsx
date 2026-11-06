import { Skeleton } from '../../components/ui/skeleton.tsx';
import type { StockSummary } from './use-dashboard.ts';

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const number = new Intl.NumberFormat('es-BO');
const percent = new Intl.NumberFormat('es-BO', { style: 'percent', maximumFractionDigits: 0 });

const SEGMENTS = [
  { key: 'ok', label: 'Disponibles', stroke: 'stroke-emerald-500', dot: 'bg-emerald-500' },
  { key: 'low', label: 'Bajo mínimo', stroke: 'stroke-amber-500', dot: 'bg-amber-500' },
  { key: 'out', label: 'Sin stock', stroke: 'stroke-red-500', dot: 'bg-red-500' },
] as const;

/** Distribución del stock en un anillo discreto, con leyenda textual (no depende del color). */
export function StockDonut({ summary }: { summary: StockSummary | null }) {
  if (!summary) {
    return (
      <div className="flex flex-col items-center gap-5 @lg:flex-row @4xl:flex-col @6xl:flex-row">
        <Skeleton className="size-36 shrink-0 rounded-full" />
        <div className="w-full space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    );
  }

  const total = summary.total;
  const lengths = SEGMENTS.map((segment) =>
    total > 0 ? (summary[segment.key] / total) * CIRCUMFERENCE : 0,
  );
  const arcs = SEGMENTS.map((segment, index) => ({
    ...segment,
    length: lengths[index] ?? 0,
    // Cada tramo empieza donde terminan los anteriores.
    offset: lengths.slice(0, index).reduce((sum, length) => sum + length, 0),
  }));
  const description = `Distribución del stock: ${SEGMENTS.map(
    (segment) => `${number.format(summary[segment.key])} ${segment.label.toLowerCase()}`,
  ).join(', ')}.`;

  return (
    <div className="flex flex-col items-center gap-5 @lg:flex-row @4xl:flex-col @6xl:flex-row">
      <div className="relative size-36 shrink-0">
        <svg
          viewBox="0 0 100 100"
          className="size-full -rotate-90"
          role="img"
          aria-label={description}
        >
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="9"
            className="stroke-stone-100"
          />
          {arcs.map((arc) =>
            arc.length > 0 ? (
              <circle
                key={arc.key}
                cx="50"
                cy="50"
                r={RADIUS}
                fill="none"
                strokeWidth="9"
                strokeLinecap="butt"
                className={`${arc.stroke} transition-[stroke-dasharray] duration-500 ease-out`}
                strokeDasharray={`${Math.max(arc.length - 1.5, 0)} ${CIRCUMFERENCE}`}
                strokeDashoffset={-arc.offset}
              />
            ) : null,
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-semibold text-stone-900 tabular-nums">
            {number.format(total)}
          </span>
          <span className="text-xs text-stone-500">variantes</span>
        </div>
      </div>

      <ul className="w-full space-y-2.5 text-sm">
        {SEGMENTS.map((segment) => {
          const value = summary[segment.key];
          return (
            <li key={segment.key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-stone-700">
                <span className={`size-2.5 rounded-full ${segment.dot}`} aria-hidden="true" />
                {segment.label}
              </span>
              <span className="tabular-nums">
                <strong className="font-semibold text-stone-900">{number.format(value)}</strong>
                <span className="ml-2 text-xs text-stone-500">
                  {total > 0 ? percent.format(value / total) : '—'}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
