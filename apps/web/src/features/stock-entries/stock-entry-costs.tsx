import { formatMoney, type StockEntryCostType } from '@joyeria/shared';
import { Button } from '../../components/ui/button.tsx';
import { newCostKey, type CostLine } from './cost-lines.ts';
import { sumCosts } from './lines.ts';

const currency = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' });

interface Props {
  lines: CostLine[];
  types: readonly StockEntryCostType[];
  editable: boolean;
  saving: boolean;
  dirty: boolean;
  errors: Record<string, string>;
  onChange: (lines: CostLine[]) => void;
  onSave: () => void;
}

/** Lista abierta de costos adicionales del ingreso: tipo + monto en Bs + nota (Q-08). */
export function StockEntryCosts({
  lines,
  types,
  editable,
  saving,
  dirty,
  errors,
  onChange,
  onSave,
}: Props) {
  const total = sumCosts(lines.map((line) => line.amount));
  const typeName = (id: string) => types.find((type) => type.id === id)?.name ?? '—';
  // Un tipo desactivado solo sigue disponible en las líneas que ya lo usan.
  const optionsFor = (current: string) =>
    types.filter((type) => type.isActive || type.id === current);
  const update = (key: string, patch: Partial<CostLine>) => {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  return (
    <section
      aria-labelledby="entry-costs-title"
      className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
    >
      <div>
        <h2 id="entry-costs-title" className="text-lg font-semibold">
          Costos adicionales del ingreso (Bs)
        </h2>
        <p className="text-xs text-stone-500">
          Montos en bolivianos, no porcentajes. Se reparten entre los ítems en proporción a su valor
          de compra al confirmar.
        </p>
      </div>
      <fieldset disabled={saving} className="m-0 min-w-0 space-y-3 border-0 p-0">
        {lines.length === 0 && (
          <p className="text-sm text-stone-600">Este ingreso no tiene costos adicionales.</p>
        )}
        {lines.map((line, index) => (
          <div
            key={line.key}
            role="group"
            aria-label={`Costo adicional ${index + 1}`}
            className="grid gap-3 rounded-lg border border-stone-200 p-3 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1.5fr)_auto] sm:items-end"
          >
            {editable ? (
              <>
                <div className="space-y-1">
                  <label
                    htmlFor={`cost-type-${line.key}`}
                    className="block text-sm font-medium text-stone-700"
                  >
                    Tipo de costo
                  </label>
                  <select
                    id={`cost-type-${line.key}`}
                    value={line.costTypeId}
                    onChange={(event) => {
                      update(line.key, { costTypeId: event.target.value });
                    }}
                    className="block min-h-10 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  >
                    <option value="">Seleccionar tipo</option>
                    {optionsFor(line.costTypeId).map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor={`cost-amount-${line.key}`}
                    className="block text-sm font-medium text-stone-700"
                  >
                    Monto (Bs)
                  </label>
                  <input
                    id={`cost-amount-${line.key}`}
                    value={line.amount}
                    onChange={(event) => {
                      update(line.key, { amount: event.target.value });
                    }}
                    inputMode="decimal"
                    className="block min-h-10 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor={`cost-note-${line.key}`}
                    className="block text-sm font-medium text-stone-700"
                  >
                    Nota (opcional)
                  </label>
                  <input
                    id={`cost-note-${line.key}`}
                    value={line.note}
                    onChange={(event) => {
                      update(line.key, { note: event.target.value });
                    }}
                    maxLength={300}
                    className="block min-h-10 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <Button
                  variant="secondary"
                  aria-label={`Quitar costo adicional ${index + 1}`}
                  onClick={() => {
                    onChange(lines.filter((item) => item.key !== line.key));
                  }}
                >
                  Quitar
                </Button>
              </>
            ) : (
              <p className="text-sm sm:col-span-4">
                <strong>{typeName(line.costTypeId)}</strong> ·{' '}
                {currency.format(Number(line.amount))}
                {line.note ? ` · ${line.note}` : ''}
              </p>
            )}
            {errors[line.key] && (
              <p role="alert" className="text-xs text-red-700 sm:col-span-4">
                {errors[line.key]}
              </p>
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {editable ? (
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  onChange([
                    ...lines,
                    {
                      key: newCostKey(),
                      costTypeId: types.find((type) => type.isActive)?.id ?? '',
                      amount: '',
                      note: '',
                    },
                  ]);
                }}
              >
                Agregar costo
              </Button>
              <Button disabled={!dirty || saving} onClick={onSave}>
                {saving ? 'Guardando…' : 'Guardar costos'}
              </Button>
            </div>
          ) : (
            <span />
          )}
          <p className="text-sm">
            <span className="text-stone-600">Total de costos adicionales: </span>
            <strong className="tabular-nums">{currency.format(Number(formatMoney(total)))}</strong>
          </p>
        </div>
      </fieldset>
    </section>
  );
}
