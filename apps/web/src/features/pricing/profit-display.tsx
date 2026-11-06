import { formatBsPrecise, formatPercent } from '../../lib/format.ts';
import { profitView } from './price-math.ts';

/**
 * Ganancia en Bs y % sobre el costo total para un precio (Q-06). Se actualiza en vivo mientras se
 * escribe el nuevo precio. Una ganancia negativa se avisa, no se bloquea.
 */
export function ProfitDisplay({
  price,
  totalCost,
  label,
}: {
  price: string;
  totalCost: string | null | undefined;
  /** Texto para lectores de pantalla (p. ej. «del precio vigente» / «del nuevo precio»). */
  label: string;
}) {
  const { profit, percent } = profitView(price, totalCost);
  if (profit === null) return <span aria-label={`Ganancia ${label}: no disponible`}>—</span>;
  const loss = profit.startsWith('-');
  return (
    <span
      className={`tabular-nums ${loss ? 'text-red-700' : ''}`}
      aria-label={`Ganancia ${label}: ${formatBsPrecise(profit)}, ${formatPercent(percent)} sobre el costo total${
        loss ? ', menor al costo' : ''
      }`}
    >
      <span className="block font-medium">{formatBsPrecise(profit)}</span>
      <span className="block text-xs">{formatPercent(percent)}</span>
      {loss && <span className="block text-xs font-medium">Precio menor al costo</span>}
    </span>
  );
}
