import { Input } from '../../components/ui/input.tsx';
import type { PaymentDraft } from './cart.ts';
import type { PaymentSummary } from './payments.ts';
import { formatBs } from '../../lib/format.ts';
import { centsToAmount } from '../../lib/money-input.ts';
import { PaymentBreakdown } from './review-step.tsx';

const PAYMENT_FIELDS: {
  code: 'CASH' | 'QR' | 'BANK_TRANSFER';
  field: 'cash' | 'qr' | 'transfer';
  label: string;
  reference?: { field: 'qrReference' | 'transferReference'; label: string };
}[] = [
  { code: 'CASH', field: 'cash', label: 'Efectivo recibido (Bs)' },
  {
    code: 'QR',
    field: 'qr',
    label: 'QR (Bs)',
    reference: { field: 'qrReference', label: 'Referencia del QR (opcional)' },
  },
  {
    code: 'BANK_TRANSFER',
    field: 'transfer',
    label: 'Transferencia (Bs)',
    reference: { field: 'transferReference', label: 'Referencia de la transferencia (opcional)' },
  },
];

/**
 * Campos de cobro: efectivo recibido, QR y transferencia (y combinaciones), con «Falta» y «Vuelto».
 * Los usan el punto de venta y el cambio de pieza (cobro de la diferencia de precio).
 */
export function PaymentFields({
  summary,
  payments,
  methods,
  onChange,
}: {
  summary: PaymentSummary;
  payments: PaymentDraft;
  /** Códigos de los medios activos. */
  methods: string[];
  onChange: (field: keyof PaymentDraft, value: string) => void;
}) {
  return (
    <div className="space-y-3">
      {PAYMENT_FIELDS.filter((item) => methods.includes(item.code)).map((item) => (
        <div key={item.code} className="space-y-2">
          <Input
            label={item.label}
            inputMode="decimal"
            autoComplete="off"
            value={payments[item.field]}
            onChange={(event) => {
              onChange(item.field, event.target.value);
            }}
            error={summary.fieldErrors[item.field]}
          />
          {item.reference && payments[item.field].trim() !== '' && (
            <Input
              label={item.reference.label}
              autoComplete="off"
              maxLength={100}
              value={payments[item.reference.field]}
              onChange={(event) => {
                if (item.reference) onChange(item.reference.field, event.target.value);
              }}
              error={summary.fieldErrors[item.reference.field]}
            />
          )}
        </div>
      ))}
      <div
        role="status"
        aria-label="Estado del cobro"
        aria-atomic="true"
        className="space-y-1 rounded-lg bg-stone-50 p-3"
      >
        {summary.remainingCents > 0n && (
          <p className="flex justify-between font-medium text-red-800">
            <span>Falta</span>
            <span className="tabular-nums">{formatBs(centsToAmount(summary.remainingCents))}</span>
          </p>
        )}
        <p className="flex justify-between font-medium">
          <span>Vuelto</span>
          <span className="tabular-nums">{formatBs(centsToAmount(summary.changeCents))}</span>
        </p>
        {summary.error && <p className="text-sm text-red-800">{summary.error}</p>}
      </div>
      {summary.ready && <PaymentBreakdown summary={summary} />}
    </div>
  );
}
