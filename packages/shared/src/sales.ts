/**
 * Ventas de mostrador y caja (plan 11 de `docs/propuestas/fase-2-ventas`, autorizado el 2026-11-10).
 *
 * Constantes, formatos y aritmética PURA compartidos por la API y la web, para que ambas calculen lo
 * mismo (total, vuelto, efectivo esperado). Toda la aritmética es entera en centavos (`bigint`).
 *
 * Una venta confirmada no se anula, no se borra y no se modifica (DEC-V07): aquí no existe ninguna
 * operación de reversión.
 *
 * Los valores marcados «POR DEFECTO — PENDIENTE DE CONFIRMACIÓN» (plan 11 §2.2) NO son reglas de
 * negocio: son propuestas conservadoras centralizadas aquí para poder cambiarlas sin migración.
 */
import { formatMoney, parseMoney } from './costing.ts';

// ---------------------------------------------------------------------------------------------
// Comprobante interno (DEC-V12, C3, C4)
// ---------------------------------------------------------------------------------------------

export const RECEIPT_TITLE = 'Comprobante interno';
export const RECEIPT_NOT_FISCAL_LEGEND = 'No válido como factura fiscal';
/** D-19 (POR DEFECTO — PENDIENTE DE CONFIRMACIÓN): marca desde la segunda impresión registrada. */
export const RECEIPT_COPY_LEGEND = 'COPIA';
/** Formatos de impresión del comprobante (C3). A4 es el formato por defecto del navegador. */
export const RECEIPT_FORMATS = ['58mm', '80mm', 'A5', 'A4'] as const;
export type ReceiptFormat = (typeof RECEIPT_FORMATS)[number];
export const DEFAULT_RECEIPT_FORMAT: ReceiptFormat = 'A4';
/**
 * Política de la tienda (asesor legal, 2026-11-14): NO hay devoluciones; solo cambio de pieza. Es la
 * leyenda por defecto del pie del comprobante; el Administrador puede editarla o quitarla.
 */
export const RECEIPT_POLICY_NOTE =
  'No se aceptan devoluciones. Solo se realizan cambios de pieza presentando este comprobante.';
/** Longitud máxima de la leyenda al pie del comprobante. */
export const RECEIPT_FOOTER_NOTE_MAX_LENGTH = 300;
/** Moneda única (Q-V04): solo bolivianos. */
export const SALE_CURRENCY = 'BOB';

// ---------------------------------------------------------------------------------------------
// Límites técnicos (D-15, POR DEFECTO — PENDIENTE DE CONFIRMACIÓN)
// ---------------------------------------------------------------------------------------------

/** Líneas por venta (una por variante). */
export const SALE_MAX_ITEMS = 50;
/** Cantidad máxima por línea. */
export const SALE_MAX_QUANTITY = 999;
/** Pagos por venta: uno por medio (efectivo, QR, transferencia). */
export const SALE_MAX_PAYMENTS = 3;
/** D-09: referencia opcional de QR o transferencia, hasta 100 caracteres; no se imprime. */
export const PAYMENT_REFERENCE_MAX_LENGTH = 100;
/** R-14: observación obligatoria del arqueo cuando hay diferencia (mínimo de caracteres). */
export const CASH_CLOSE_NOTES_MIN_LENGTH = 3;
export const CASH_CLOSE_NOTES_MAX_LENGTH = 500;
/** Motivo de una corrección de caja (doc. 10 §5.2). */
export const CASH_CORRECTION_REASON_MIN_LENGTH = 10;
export const CASH_CORRECTION_REASON_MAX_LENGTH = 500;
/** Cambio de pieza (ADR-026): observación opcional del vendedor. */
export const EXCHANGE_NOTE_MAX_LENGTH = 300;
/** Título del comprobante de un cambio de pieza (no es una venta ni una devolución). */
export const EXCHANGE_RECEIPT_TITLE = 'Comprobante de cambio de pieza';
/** Incidencias de venta: descripción y resolución. */
export const SALE_INCIDENT_TEXT_MIN_LENGTH = 10;
export const SALE_INCIDENT_TEXT_MAX_LENGTH = 1000;

// ---------------------------------------------------------------------------------------------
// Medios de pago (Q-V04, D-09)
// ---------------------------------------------------------------------------------------------

export const PAYMENT_METHOD_CODES = ['CASH', 'QR', 'BANK_TRANSFER'] as const;
export type PaymentMethodCode = (typeof PAYMENT_METHOD_CODES)[number];

export function isPaymentMethodCode(code: string): code is PaymentMethodCode {
  return (PAYMENT_METHOD_CODES as readonly string[]).includes(code);
}

/**
 * Catálogo fijo sembrado (D-09, POR DEFECTO — PENDIENTE DE CONFIRMACIÓN). Lo usan la migración (SQL),
 * el seed y las pruebas. Solo el efectivo admite vuelto y entra al arqueo.
 */
export const SYSTEM_PAYMENT_METHODS: readonly {
  code: PaymentMethodCode;
  name: string;
  isCash: boolean;
  sortOrder: number;
}[] = [
  { code: 'CASH', name: 'Efectivo', isCash: true, sortOrder: 1 },
  { code: 'QR', name: 'QR', isCash: false, sortOrder: 2 },
  { code: 'BANK_TRANSFER', name: 'Transferencia', isCash: false, sortOrder: 3 },
];

// ---------------------------------------------------------------------------------------------
// Logo del negocio (comprobante)
// ---------------------------------------------------------------------------------------------

/** Campo multipart del archivo del logo. */
export const LOGO_FIELD_NAME = 'file';
/** Tamaño máximo del archivo que se sube (el sistema lo reduce y lo guarda como WebP). */
export const MAX_LOGO_UPLOAD_BYTES = 2 * 1024 * 1024;
/** El logo se reduce para caber en este recuadro (px); nunca se amplía. */
export const LOGO_MAX_WIDTH_PX = 600;
export const LOGO_MAX_HEIGHT_PX = 300;

// ---------------------------------------------------------------------------------------------
// Configuración del negocio (C1, D-04, D-07)
// ---------------------------------------------------------------------------------------------

/**
 * D-07 (POR DEFECTO — PENDIENTE DE CONFIRMACIÓN): valores provisionales del negocio, editables por el
 * Administrador en `/configuracion/negocio`. D-04: el nombre del vendedor se guarda en cada venta
 * pero no se imprime salvo que el Administrador active `receiptShowSeller`.
 */
export const BUSINESS_SETTINGS_DEFAULTS = {
  tradeName: 'Joyería Sole',
  address: null,
  phone: null,
  taxId: null,
  receiptShowSeller: false,
  receiptFooterNote: RECEIPT_POLICY_NOTE,
} as const;

// ---------------------------------------------------------------------------------------------
// Numeración (R-20, D-03, D-17): la BD guarda un entero; el formato se cambia aquí sin migración.
// ---------------------------------------------------------------------------------------------

function padded(prefix: string, value: number): string {
  return `${prefix}-${String(value).padStart(6, '0')}`;
}

/** D-03 (POR DEFECTO — PENDIENTE DE CONFIRMACIÓN): 123 → «VTA-000123». */
export function formatSaleNumber(value: number): string {
  return padded('VTA', value);
}

/** D-17 (POR DEFECTO — PENDIENTE DE CONFIRMACIÓN): 7 → «CAJ-000007». */
export function formatCashSessionNumber(value: number): string {
  return padded('CAJ', value);
}

/** 3 → «INC-000003». */
export function formatIncidentNumber(value: number): string {
  return padded('INC', value);
}

/** 12 → «CMB-000012» (cambio de pieza de una venta, ADR-026). */
export function formatExchangeNumber(value: number): string {
  return padded('CMB', value);
}

// ---------------------------------------------------------------------------------------------
// Aritmética de la venta (centavos)
// ---------------------------------------------------------------------------------------------

/** Importe en Bs como texto con hasta 2 decimales, sin signo: «0», «12.5», «1500.00». */
export const MONEY_PATTERN = /^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

/**
 * LÍMITE TÉCNICO (no regla de negocio) de todo importe que llega a ventas y caja: Bs 99 999 999,99.
 * Las columnas son `numeric(12,2)` (máximo 9 999 999 999,99); con este tope, fondo + cobros de una
 * sesión no desbordan salvo con más de cien ventas del importe máximo, y un cierre no queda bloqueado.
 * D-05 («sin tope de negocio» para el fondo) sigue vigente: esto solo protege la base.
 */
export const MONEY_INPUT_MAX = '99999999.99';

/** LÍMITE TÉCNICO de los enteros que llegan a la API (columna `integer` de PostgreSQL). */
export const INT32_MAX = 2_147_483_647;

/** LÍMITE TÉCNICO de la página de un listado (evita desplazamientos absurdos). */
export const PAGE_MAX = 10_000;

/** Total de una línea en centavos: cantidad × precio unitario. */
export function lineTotalCents(quantity: number, unitPrice: string): bigint {
  return BigInt(quantity) * parseMoney(unitPrice);
}

/** Total de la venta (sin descuentos ni impuestos: D-16, R-03) en centavos. */
export function saleTotalCents(lines: readonly { quantity: number; unitPrice: string }[]): bigint {
  return lines.reduce((sum, line) => sum + lineTotalCents(line.quantity, line.unitPrice), 0n);
}

export interface PaymentInput {
  methodCode: string;
  /** Importe aplicado a la venta (neto de vuelto). */
  amount: string;
  /** Efectivo recibido: obligatorio y exclusivo del efectivo. */
  tendered?: string | null;
}

export interface EvaluatedPayment {
  methodCode: string;
  amountCents: bigint;
  /** Solo efectivo: recibido y vuelto; `null` en QR y transferencia. */
  tenderedCents: bigint | null;
  changeCents: bigint | null;
}

export type PaymentEvaluation =
  | { ok: true; payments: EvaluatedPayment[]; paidCents: bigint; changeCents: bigint }
  | {
      ok: false;
      reason: 'SUM_MISMATCH' | 'TENDERED_TOO_LOW' | 'TENDERED_MISSING' | 'TENDERED_NOT_CASH';
      paidCents: bigint;
    };

/**
 * Evalúa los pagos de una venta pagada íntegramente en el acto (R-05): Σ importes aplicados = total;
 * en efectivo, recibido ≥ aplicado y vuelto = recibido − aplicado; el vuelto solo sale del efectivo.
 * `isCash(code)` indica qué medio es efectivo (lo decide el catálogo de medios).
 */
export function evaluatePayments(
  totalCents: bigint,
  payments: readonly PaymentInput[],
  isCash: (methodCode: string) => boolean,
): PaymentEvaluation {
  const evaluated: EvaluatedPayment[] = [];
  let paid = 0n;
  let change = 0n;
  for (const payment of payments) {
    const amount = parseMoney(payment.amount);
    paid += amount;
    const tendered = payment.tendered ?? null;
    if (isCash(payment.methodCode)) {
      if (tendered === null) return { ok: false, reason: 'TENDERED_MISSING', paidCents: paid };
      const tenderedCents = parseMoney(tendered);
      if (tenderedCents < amount) return { ok: false, reason: 'TENDERED_TOO_LOW', paidCents: paid };
      change += tenderedCents - amount;
      evaluated.push({
        methodCode: payment.methodCode,
        amountCents: amount,
        tenderedCents,
        changeCents: tenderedCents - amount,
      });
    } else {
      if (tendered !== null) return { ok: false, reason: 'TENDERED_NOT_CASH', paidCents: paid };
      evaluated.push({
        methodCode: payment.methodCode,
        amountCents: amount,
        tenderedCents: null,
        changeCents: null,
      });
    }
  }
  if (paid !== totalCents) return { ok: false, reason: 'SUM_MISMATCH', paidCents: paid };
  return { ok: true, payments: evaluated, paidCents: paid, changeCents: change };
}

// ---------------------------------------------------------------------------------------------
// Arqueo de caja (B5, B6, doc. 10 §4.1)
// ---------------------------------------------------------------------------------------------

/** R-15 (B6): sin gastos ni retiros, esperado = fondo + cobros en efectivo (+ movimientos = 0). */
export function expectedCashCents(
  openingCents: bigint,
  cashSalesCents: bigint,
  movementsNetCents = 0n,
): bigint {
  return openingCents + cashSalesCents + movementsNetCents;
}

/** Diferencia con signo: positivo = sobrante, negativo = faltante. */
export function cashDifferenceCents(countedCents: bigint, expectedCents: bigint): bigint {
  return countedCents - expectedCents;
}

export type CashCorrectionKind = 'COUNTED_CASH' | 'OPENING_AMOUNT' | 'NOTE';
export const CASH_CORRECTION_KINDS = ['COUNTED_CASH', 'OPENING_AMOUNT', 'NOTE'] as const;

export interface ClosedSessionFigures {
  openingAmount: string;
  cashSalesTotal: string;
  cashMovementsNet: string;
  countedCash: string;
}

export interface CurrentCashFigures {
  openingAmount: string;
  expectedCash: string;
  countedCash: string;
  difference: string;
}

/**
 * Cifras VIGENTES de una sesión cerrada tras su cadena de correcciones (doc. 10 §4.1): fondo y
 * contado = último valor corregido de su tipo (o el original); cobros y movimientos siempre los
 * congelados al cerrar; esperado y diferencia recalculados. Las correcciones van en orden de secuencia.
 */
export function currentCashFigures(
  original: ClosedSessionFigures,
  corrections: readonly { kind: CashCorrectionKind; newValue: string | null }[],
): CurrentCashFigures {
  let opening = parseMoney(original.openingAmount);
  let counted = parseMoney(original.countedCash);
  for (const correction of corrections) {
    if (correction.newValue === null) continue;
    if (correction.kind === 'OPENING_AMOUNT') opening = parseMoney(correction.newValue);
    if (correction.kind === 'COUNTED_CASH') counted = parseMoney(correction.newValue);
  }
  const expected = expectedCashCents(
    opening,
    parseMoney(original.cashSalesTotal),
    parseSignedMoney(original.cashMovementsNet),
  );
  return {
    openingAmount: formatMoney(opening),
    expectedCash: formatMoney(expected),
    countedCash: formatMoney(counted),
    difference: formatMoney(cashDifferenceCents(counted, expected)),
  };
}

/** Como `parseMoney`, pero admite signo negativo (diferencias de arqueo). */
export function parseSignedMoney(value: string): bigint {
  return value.startsWith('-') ? -parseMoney(value.slice(1)) : parseMoney(value);
}
