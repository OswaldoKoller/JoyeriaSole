import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '../../components/ui/skeleton.tsx';
import { formatInt, formatRatio } from '../../lib/format.ts';

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger';

const TONES: Record<Tone, { icon: string; bar: string; value: string }> = {
  neutral: { icon: 'bg-stone-100 text-stone-700', bar: 'bg-stone-400', value: 'text-stone-900' },
  ok: { icon: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500', value: 'text-stone-900' },
  warn: { icon: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500', value: 'text-stone-900' },
  danger: { icon: 'bg-red-50 text-red-700', bar: 'bg-red-500', value: 'text-stone-900' },
};

type StatCardProps = {
  label: string;
  /** `undefined` mientras carga. */
  value: number | undefined;
  icon: LucideIcon;
  tone: Tone;
  caption: string;
  /** Proporción 0–1 respecto del total; dibuja una barra fina y discreta. */
  share?: number;
};

export function StatCard({ label, value, icon: Icon, tone, caption, share }: StatCardProps) {
  const styles = TONES[tone];
  const loading = value === undefined;
  const ratio = share === undefined || Number.isNaN(share) ? 0 : Math.min(Math.max(share, 0), 1);

  return (
    <article
      aria-busy={loading}
      className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm shadow-black/5 transition-shadow duration-200 ease-out hover:shadow-md sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wider text-stone-600 uppercase">{label}</h2>
        <span
          className={`hidden size-9 shrink-0 items-center justify-center rounded-lg sm:flex ${styles.icon}`}
        >
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
      </div>

      <div className="mt-2 h-8 sm:mt-3 sm:h-9">
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <p className={`text-2xl font-semibold tabular-nums sm:text-3xl ${styles.value}`}>
            {formatInt(value)}
          </p>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <div
          className="h-1.5 overflow-hidden rounded-full bg-stone-100"
          role="img"
          aria-label={loading ? 'Cargando' : `${formatRatio(ratio)} del total`}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-300 ease-out ${styles.bar}`}
            style={{ width: loading ? '0%' : `${ratio * 100}%` }}
          />
        </div>
        <div className="h-4 text-xs text-stone-500 max-sm:hidden">
          {loading ? <Skeleton className="h-3 w-28" /> : caption}
        </div>
      </div>
    </article>
  );
}
