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
