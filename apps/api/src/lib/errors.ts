import { ERROR_CODES, type ErrorCode } from '@joyeria/shared';

/**
 * Errores controlados de la aplicación. Todo lo que NO sea un AppError se trata como error
 * técnico: se registra completo en el log y al cliente se le responde un 500 genérico.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Los datos enviados no son válidos', details?: unknown) {
    super(400, ERROR_CODES.VALIDATION_ERROR, message, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Debe iniciar sesión') {
    super(401, ERROR_CODES.UNAUTHENTICATED, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'No tiene permiso para realizar esta acción') {
    super(403, ERROR_CODES.FORBIDDEN, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado') {
    super(404, ERROR_CODES.NOT_FOUND, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, ERROR_CODES.CONFLICT, message, details);
  }
}

/** Una regla de negocio impide la operación (p. ej. confirmar un ingreso ya confirmado). */
export class BusinessRuleError extends AppError {
  /** `code` permite un código estable propio (p. ej. STOCK_BLOCKS_DEACTIVATION) para que la web reaccione. */
  constructor(
    message: string,
    details?: unknown,
    code: ErrorCode = ERROR_CODES.BUSINESS_RULE_VIOLATION,
  ) {
    super(422, code, message, details);
  }
}

/** El cuerpo o el archivo subido supera el tamaño permitido (413). */
export class PayloadTooLargeError extends AppError {
  constructor(message: string, details?: unknown) {
    super(413, ERROR_CODES.PAYLOAD_TOO_LARGE, message, details);
  }
}

/** Sesión válida, pero con clave temporal: solo puede cambiarla o cerrar sesión (F2). */
export class PasswordChangeRequiredError extends AppError {
  constructor(message = 'Debe cambiar su contraseña temporal antes de continuar') {
    super(403, ERROR_CODES.PASSWORD_CHANGE_REQUIRED, message);
  }
}
