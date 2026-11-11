import {
  PAYMENT_REFERENCE_MAX_LENGTH,
  evaluatePayments,
  formatMoney,
  type CreateSaleInput,
} from '@joyeria/shared';
import { isBlank, moneyTextToCents } from '../../lib/money-input.ts';
import type { PaymentDraft } from './cart.ts';

/**
 * Cobro del punto de venta: lógica PURA en centavos enteros. Solo ventas pagadas íntegramente en
 * el acto (R-05): lo aplicado debe igualar el total. El vuelto solo sale del efectivo; QR y
 * transferencia no pueden superar el total (R-04, plan 11 §5.4 paso 3). La API vuelve a validar.
 */

export type PaymentField = keyof PaymentDraft;

export interface PaymentSummary {
  totalCents: bigint;
  /** Efectivo entregado por el cliente. */
  tenderedCents: bigint;
  qrCents: bigint;
  transferCents: bigint;
  /** Efectivo aplicado a la venta (neto de vuelto). */
  cashAppliedCents: bigint;
  /** Lo que falta cobrar (0 si está completo). */
  remainingCents: bigint;
  changeCents: bigint;
  /** Error por campo (texto para mostrar junto al campo). */
  fieldErrors: Partial<Record<PaymentField, string>>;
  /** Error general del cobro (p. ej. QR y transferencia superan el total). */
  error: string | null;
  /** Lista para revisar: sin errores y lo aplicado igual al total. */
  ready: boolean;
  /** Pagos para `POST /sales` (vacío si no está listo). */
  payments: CreateSaleInput['payments'];
}

function readAmount(
  draft: PaymentDraft,
  field: 'cash' | 'qr' | 'transfer',
  errors: Partial<Record<PaymentField, string>>,
): bigint {
  if (isBlank(draft[field])) return 0n;
  const cents = moneyTextToCents(draft[field]);
  if (cents === null) {
    errors[field] = 'Importe inválido: use números con hasta 2 decimales (p. ej. 150,50).';
    return 0n;
  }
  return cents;
}

export function summarizePayments(totalCents: bigint, draft: PaymentDraft): PaymentSummary {
  const fieldErrors: Partial<Record<PaymentField, string>> = {};
  const tendered = readAmount(draft, 'cash', fieldErrors);
  const qr = readAmount(draft, 'qr', fieldErrors);
  const transfer = readAmount(draft, 'transfer', fieldErrors);
  for (const field of ['qrReference', 'transferReference'] as const) {
    if (draft[field].trim().length > PAYMENT_REFERENCE_MAX_LENGTH) {
      fieldErrors[field] = `La referencia admite hasta ${PAYMENT_REFERENCE_MAX_LENGTH} caracteres.`;
    }
  }

  let error: string | null = null;
  const nonCash = qr + transfer;
  if (nonCash > totalCents) {
    error = 'QR y transferencia no pueden superar el total: el vuelto solo sale del efectivo.';
  }
  const cashNeeded = nonCash >= totalCents ? 0n : totalCents - nonCash;
  if (error === null && cashNeeded === 0n && tendered > 0n) {
    error = 'El total ya está cubierto con QR o transferencia: deje vacío el efectivo recibido.';
  }
  const cashApplied = tendered < cashNeeded ? tendered : cashNeeded;
  const remaining = error === null ? cashNeeded - cashApplied : 0n;
  const change = tendered > cashApplied ? tendered - cashApplied : 0n;

  const payments: CreateSaleInput['payments'] = [];
  if (cashApplied > 0n) {
    payments.push({
      methodCode: 'CASH',
      amount: formatMoney(cashApplied),
      tendered: formatMoney(tendered),
    });
  }
  if (qr > 0n) {
    const reference = draft.qrReference.trim();
    payments.push({
      methodCode: 'QR',
      amount: formatMoney(qr),
      ...(reference ? { reference } : {}),
    });
  }
  if (transfer > 0n) {
    const reference = draft.transferReference.trim();
    payments.push({
      methodCode: 'BANK_TRANSFER',
      amount: formatMoney(transfer),
      ...(reference ? { reference } : {}),
    });
  }

  // Comprobación final con la MISMA regla que la API (Σ aplicado = total; recibido ≥ aplicado).
  const evaluation = evaluatePayments(totalCents, payments, (code) => code === 'CASH');
  const ready =
    totalCents > 0n &&
    error === null &&
    Object.keys(fieldErrors).length === 0 &&
    remaining === 0n &&
    evaluation.ok;

  return {
    totalCents,
    tenderedCents: tendered,
    qrCents: qr,
    transferCents: transfer,
    cashAppliedCents: cashApplied,
    remainingCents: remaining,
    changeCents: change,
    fieldErrors,
    error,
    ready,
    payments: ready ? payments : [],
  };
}
