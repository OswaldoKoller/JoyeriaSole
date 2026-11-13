import {
  ERROR_CODES,
  evaluatePayments,
  formatMoney,
  lineTotalCents,
  parseMoney,
  type CreateSaleInput,
  type EvaluatedPayment,
} from '@joyeria/shared';
import { BusinessRuleError, ConflictError } from '../../lib/errors.ts';

/**
 * Validación PURA de una venta (plan 11 §4.5, pasos 5 y 6), con los datos vigentes leídos bajo
 * bloqueo. Aritmética entera en centavos. Lanza el error de negocio correspondiente; si no lanza,
 * devuelve las líneas y los pagos listos para registrar.
 */

/** Datos vigentes de una variante, leídos DESPUÉS de bloquearla. */
export interface VariantSnapshot {
  id: string;
  sku: string;
  label: string | null;
  productName: string;
  active: boolean;
  /** Precio de venta vigente con 2 decimales. */
  salePrice: string;
  /** Costo unitario vigente con 4 decimales (solo para el libro y el snapshot interno). */
  costPrice: string;
  available: number;
}

export interface PlannedLine {
  variantId: string;
  sku: string;
  productName: string;
  variantLabel: string | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  unitCost: string;
}

/** Detalle de `VARIANT_NOT_SELLABLE`: por qué no se puede vender cada pieza. */
export interface NotSellableItem {
  variantId: string;
  sku: string | null;
  reason: 'NOT_FOUND' | 'INACTIVE' | 'NO_PRICE';
}

export interface SalePlan {
  lines: PlannedLine[];
  totalCents: bigint;
  total: string;
}

/**
 * Comprueba, en este orden: que cada variante exista y sea vendible (activa con producto activo y
 * precio > 0) → 422 `VARIANT_NOT_SELLABLE`; que el precio esperado sea el vigente → 409
 * `PRICE_CHANGED`; que el total esperado coincida → 409 `PRICE_CHANGED`; que haya stock → 422
 * `INSUFFICIENT_STOCK`. Ningún mensaje ni detalle incluye costos.
 */
export function planSale(
  items: CreateSaleInput['items'],
  expectedTotal: string,
  variants: ReadonlyMap<string, VariantSnapshot>,
): SalePlan {
  const notSellable = items.flatMap((item): NotSellableItem[] => {
    const variant = variants.get(item.variantId);
    if (!variant) return [{ variantId: item.variantId, sku: null, reason: 'NOT_FOUND' }];
    if (!variant.active)
      return [{ variantId: item.variantId, sku: variant.sku, reason: 'INACTIVE' }];
    if (parseMoney(variant.salePrice) <= 0n) {
      return [{ variantId: item.variantId, sku: variant.sku, reason: 'NO_PRICE' }];
    }
    return [];
  });
  if (notSellable.length > 0) {
    throw new BusinessRuleError(
      'Hay piezas que no se pueden vender (inexistentes, inactivas o sin precio). Quítelas del carrito.',
      { items: notSellable },
      ERROR_CODES.VARIANT_NOT_SELLABLE,
    );
  }

  const lines: PlannedLine[] = [];
  const priceChanged: { variantId: string; expectedUnitPrice: string; currentUnitPrice: string }[] =
    [];
  const insufficient: { variantId: string; sku: string; available: number; requested: number }[] =
    [];
  let totalCents = 0n;
  for (const item of items) {
    const variant = variants.get(item.variantId);
    if (!variant) continue; // ya validado arriba
    const unitPrice = formatMoney(parseMoney(variant.salePrice));
    if (parseMoney(item.expectedUnitPrice) !== parseMoney(unitPrice)) {
      priceChanged.push({
        variantId: variant.id,
        expectedUnitPrice: formatMoney(parseMoney(item.expectedUnitPrice)),
        currentUnitPrice: unitPrice,
      });
    }
    if (variant.available < item.quantity) {
      insufficient.push({
        variantId: variant.id,
        sku: variant.sku,
        available: Math.max(variant.available, 0),
        requested: item.quantity,
      });
    }
    const lineCents = lineTotalCents(item.quantity, unitPrice);
    totalCents += lineCents;
    lines.push({
      variantId: variant.id,
      sku: variant.sku,
      productName: variant.productName,
      variantLabel: variant.label,
      quantity: item.quantity,
      unitPrice,
      lineTotal: formatMoney(lineCents),
      unitCost: variant.costPrice,
    });
  }

  const total = formatMoney(totalCents);
  if (priceChanged.length > 0 || parseMoney(expectedTotal) !== totalCents) {
    throw new ConflictError(
      'El precio de una o más piezas cambió. Revise el carrito antes de cobrar.',
      {
        items: priceChanged,
        expectedTotal: formatMoney(parseMoney(expectedTotal)),
        currentTotal: total,
      },
      ERROR_CODES.PRICE_CHANGED,
    );
  }
  if (insufficient.length > 0) {
    throw new BusinessRuleError(
      'No hay stock suficiente de una o más piezas.',
      { items: insufficient },
      ERROR_CODES.INSUFFICIENT_STOCK,
    );
  }
  return { lines, totalCents, total };
}

export interface PaymentMethodRow {
  id: string;
  code: string;
  name: string;
  isCash: boolean;
  isActive: boolean;
}

export interface PlannedPayment extends EvaluatedPayment {
  methodId: string;
  methodName: string;
  isCash: boolean;
  reference: string | null;
}

/**
 * Pagos (R-04, R-05): medios activos; Σ importes aplicados = total; en efectivo recibido ≥ aplicado y
 * vuelto = recibido − aplicado. Cualquier incumplimiento → 422 `PAYMENT_MISMATCH` con `{ total, paid }`.
 */
export function planPayments(
  payments: CreateSaleInput['payments'],
  totalCents: bigint,
  methods: ReadonlyMap<string, PaymentMethodRow>,
): PlannedPayment[] {
  const paidCents = payments.reduce((sum, payment) => sum + parseMoney(payment.amount), 0n);
  const mismatch = (message: string, reason: string) =>
    new BusinessRuleError(
      message,
      { total: formatMoney(totalCents), paid: formatMoney(paidCents), reason },
      ERROR_CODES.PAYMENT_MISMATCH,
    );

  for (const payment of payments) {
    const method = methods.get(payment.methodCode);
    if (!method?.isActive) {
      throw mismatch(
        `El medio de pago ${payment.methodCode} no está disponible.`,
        'METHOD_INACTIVE',
      );
    }
  }
  const evaluation = evaluatePayments(
    totalCents,
    payments,
    (code) => methods.get(code)?.isCash ?? false,
  );
  if (!evaluation.ok) {
    const messages: Record<typeof evaluation.reason, string> = {
      SUM_MISMATCH: 'La suma de los pagos no coincide con el total de la venta.',
      TENDERED_TOO_LOW: 'El efectivo recibido es menor que el importe en efectivo.',
      TENDERED_MISSING: 'Indique el efectivo recibido.',
      TENDERED_NOT_CASH: 'El efectivo recibido solo corresponde a pagos en efectivo.',
    };
    throw mismatch(messages[evaluation.reason], evaluation.reason);
  }
  return evaluation.payments.map((evaluated, index) => {
    const input = payments[index];
    const method = methods.get(evaluated.methodCode);
    if (!input || !method) throw mismatch('Pago inválido.', 'METHOD_INACTIVE');
    return {
      ...evaluated,
      methodId: method.id,
      methodName: method.name,
      isCash: method.isCash,
      reference: method.isCash ? null : (input.reference ?? null),
    };
  });
}
