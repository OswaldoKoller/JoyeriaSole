import { describe, expect, it } from 'vitest';
import {
  AppError,
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from '../../src/lib/errors.ts';

describe('errores de aplicación', () => {
  it.each([
    [new ValidationError(), 400, 'VALIDATION_ERROR'],
    [new UnauthenticatedError(), 401, 'UNAUTHENTICATED'],
    [new ForbiddenError(), 403, 'FORBIDDEN'],
    [new NotFoundError(), 404, 'NOT_FOUND'],
    [new ConflictError('SKU duplicado'), 409, 'CONFLICT'],
    [new BusinessRuleError('Ingreso ya confirmado'), 422, 'BUSINESS_RULE_VIOLATION'],
  ])('%s → HTTP %i / %s', (error, status, code) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(status);
    expect(error.code).toBe(code);
  });

  it('conserva el nombre de la subclase y los detalles', () => {
    const error = new ConflictError('SKU duplicado', { field: 'sku' });
    expect(error.name).toBe('ConflictError');
    expect(error.details).toEqual({ field: 'sku' });
  });
});
