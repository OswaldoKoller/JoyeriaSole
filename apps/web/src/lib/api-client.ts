import {
  API_PREFIX,
  ERROR_CODES,
  IDEMPOTENCY_KEY_HEADER,
  type ApiErrorBody,
  type ErrorCode,
} from '@joyeria/shared';

/** Error devuelto por la API con el formato estándar { error: { code, message, ... } }. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
    this.requestId = body.requestId;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  /**
   * Clave de idempotencia de la operación (cabecera `Idempotency-Key`). Usar una por intento del
   * usuario y reutilizarla en los reintentos: ver `lib/idempotency.ts`.
   */
  idempotencyKey?: string;
}

/**
 * Cliente HTTP mínimo. La sesión viaja en una cookie httpOnly (el frontend nunca ve el token);
 * por eso no hay manejo de tokens aquí.
 */
export async function apiRequest<T>(
  method: Method,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  // FormData (subida de archivos): el navegador fija el Content-Type con su `boundary`.
  const isForm = body instanceof FormData;
  const headers: Record<string, string> = {};
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers[IDEMPOTENCY_KEY_HEADER] = options.idempotencyKey;
  const response = await fetch(`${API_PREFIX}${path}`, {
    method,
    credentials: 'same-origin',
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      payload && typeof payload === 'object' && 'error' in payload
        ? (payload as ApiErrorBody).error
        : { code: ERROR_CODES.INTERNAL_ERROR, message: 'Error de comunicación con el servidor' };
    throw new ApiError(response.status, error);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>('GET', path),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown) => apiRequest<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>('PATCH', path, body),
  delete: <T>(path: string) => apiRequest<T>('DELETE', path),
};
