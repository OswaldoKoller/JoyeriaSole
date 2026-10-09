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
  RATE_LIMITED: 'RATE_LIMITED', // 429
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
