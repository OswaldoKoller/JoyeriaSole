/**
 * Contrato de respuestas de la API (ver docs/api/API.md).
 *
 * Éxito:  HTTP 2xx  →  { data: T, meta?: {...} }
 * Error:  HTTP 4xx/5xx → { error: { code, message, details?, requestId } }
 */

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR', // 400 — datos de entrada inválidos
  UNAUTHENTICATED: 'UNAUTHENTICATED', // 401 — sin sesión o sesión expirada
  FORBIDDEN: 'FORBIDDEN', // 403 — sesión válida, pero sin permiso
  NOT_FOUND: 'NOT_FOUND', // 404
  CONFLICT: 'CONFLICT', // 409 — duplicados (SKU, código de barras...), estado inconsistente
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION', // 422 — regla de negocio incumplida
  /** 403 — la clave es temporal: solo se permite cambiarla (o cerrar sesión) hasta hacerlo (F2). */
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  /** 422 — no se desactiva un producto o variante con stock disponible (P-22). */
  STOCK_BLOCKS_DEACTIVATION: 'STOCK_BLOCKS_DEACTIVATION',
  /** 413 — el archivo subido supera el tamaño permitido (p. ej. fotos de producto, 5 MB). */
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED', // 429
  /** 503 — conflicto transitorio de la base (bloqueo, tiempo agotado): reintentar en unos segundos. */
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  /**
   * 409 — la clave de idempotencia ya se usó con otra operación: otro cuerpo, otra ruta u otro
   * usuario. No se ejecutó nada; el cliente debe generar una clave nueva para una operación nueva.
   */
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  /** 400 — la operación exige la cabecera `Idempotency-Key` (UUID) y no llegó. */
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  // Ventas y caja (plan 11 §4.2). Una venta confirmada no se anula ni se modifica (DEC-V07).
  /** 422 — no hay sesión de caja abierta (incluida la venta que llega durante o tras el cierre). */
  CASH_SESSION_REQUIRED: 'CASH_SESSION_REQUIRED',
  /** 409 — ya hay una sesión de caja abierta; `details: { sessionId, number }`. */
  CASH_SESSION_ALREADY_OPEN: 'CASH_SESSION_ALREADY_OPEN',
  /** 409 — la sesión ya está cerrada (cierre con otra clave de idempotencia). */
  CASH_SESSION_CLOSED: 'CASH_SESSION_CLOSED',
  /** 409 — la corrección exige una sesión cerrada. */
  CASH_SESSION_NOT_CLOSED: 'CASH_SESSION_NOT_CLOSED',
  /** 422 — arqueo con diferencia sin observación; `details: { expectedCash, countedCash, difference }`. */
  CASH_DIFFERENCE_NOTE_REQUIRED: 'CASH_DIFFERENCE_NOTE_REQUIRED',
  /** 409 — el valor anterior que vio el usuario ya no es el vigente; `details: { currentValue }`. */
  CASH_CORRECTION_CONFLICT: 'CASH_CORRECTION_CONFLICT',
  /** 409 — precio o total esperado distinto del vigente; `details: { items, expectedTotal, currentTotal }`. */
  PRICE_CHANGED: 'PRICE_CHANGED',
  /** 422 — stock insuficiente; `details: { items: [{ variantId, sku, available, requested }] }`. */
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  /** 422 — variante inexistente o inactiva, producto inactivo, o sin precio de venta; `details: { items }`. */
  VARIANT_NOT_SELLABLE: 'VARIANT_NOT_SELLABLE',
  /** 422 — Σ pagos ≠ total, efectivo recibido < aplicado o medio inactivo; `details: { total, paid }`. */
  PAYMENT_MISMATCH: 'PAYMENT_MISMATCH',
  // Cambio de pieza de una venta (ADR-026). Regla de negocio del 2026-11-14: nunca por una pieza
  // más económica; la diferencia se cobra.
  /** 422 — la pieza entregada cuesta menos que la devuelta; `details: { creditUnitPrice, deliveredUnitPrice }`. */
  EXCHANGE_CHEAPER_NOT_ALLOWED: 'EXCHANGE_CHEAPER_NOT_ALLOWED',
  /** 422 — se piden más unidades de las que quedan por cambiar; `details: { remaining, requested }`. */
  EXCHANGE_QUANTITY_EXCEEDED: 'EXCHANGE_QUANTITY_EXCEEDED',
  /** 422 — la pieza entregada es la misma variante que la devuelta. */
  EXCHANGE_SAME_PIECE: 'EXCHANGE_SAME_PIECE',
  INTERNAL_ERROR: 'INTERNAL_ERROR', // 500 — nunca expone detalles internos
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface ApiSuccess<T, M = undefined> {
  data: T;
  meta?: M;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export const API_PREFIX = '/api/v1';

/**
 * Cabecera de idempotencia (ver docs/api/API.md, «Idempotencia»). El cliente envía un UUID por
 * intento de operación del usuario y lo reutiliza en los reintentos; el servidor responde la
 * repetición con la respuesta original y la cabecera `Idempotent-Replay: true`.
 */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENT_REPLAY_HEADER = 'Idempotent-Replay';
