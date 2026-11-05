import { MOVEMENT_TYPE_LABELS, createExchangeSchema, movementTypeLabel } from '@joyeria/shared';
import { describe, expect, it } from 'vitest';
import { BusinessRuleError } from '../../src/lib/errors.ts';
import { assertDistinctVariants } from '../../src/modules/inventory/exchanges.service.ts';

const A = '0197a1b2-0000-7000-8000-000000000001';
const B = '0197a1b2-0000-7000-8000-000000000002';

const valid = {
  returned: { variantId: A, quantity: 1 },
  delivered: { variantId: B, quantity: 1 },
  reason: 'Talla equivocada',
};

describe('createExchangeSchema', () => {
  it('acepta un cambio válido y normaliza la observación vacía a null', () => {
    const parsed = createExchangeSchema.parse({ ...valid, notes: '   ' });
    expect(parsed.notes).toBeNull();
    expect(parsed.reason).toBe('Talla equivocada');
  });

  it('exige el motivo (vacío o solo espacios se rechaza)', () => {
    expect(createExchangeSchema.safeParse({ ...valid, reason: '   ' }).success).toBe(false);
    expect(createExchangeSchema.safeParse({ ...valid, reason: undefined }).success).toBe(false);
  });

  it('exige cantidades enteras mayores que cero en ambas piezas', () => {
    for (const quantity of [0, -1, 1.5, 1_000_001]) {
      expect(
        createExchangeSchema.safeParse({ ...valid, returned: { variantId: A, quantity } }).success,
      ).toBe(false);
      expect(
        createExchangeSchema.safeParse({ ...valid, delivered: { variantId: B, quantity } }).success,
      ).toBe(false);
    }
  });

  it('exige identificadores de variante UUID', () => {
    expect(
      createExchangeSchema.safeParse({ ...valid, returned: { variantId: 'x', quantity: 1 } })
        .success,
    ).toBe(false);
  });
});

describe('assertDistinctVariants', () => {
  it('acepta variantes distintas', () => {
    expect(() => {
      assertDistinctVariants(valid);
    }).not.toThrow();
  });

  it('rechaza la misma variante en ambos lados con una regla de negocio (422)', () => {
    let error: unknown;
    try {
      assertDistinctVariants({ ...valid, delivered: { variantId: A, quantity: 1 } });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect((error as BusinessRuleError).statusCode).toBe(422);
  });
});

describe('etiquetas de tipos de movimiento', () => {
  it('etiqueta en español los dos tipos del cambio', () => {
    expect(movementTypeLabel('EXCHANGE_IN')).toBe('Cambio: entrada de pieza devuelta');
    expect(movementTypeLabel('EXCHANGE_OUT')).toBe('Cambio: salida de pieza entregada');
  });

  it('conserva las etiquetas existentes y devuelve el código si no conoce el tipo', () => {
    expect(movementTypeLabel('STOCK_ENTRY')).toBe('Ingreso');
    expect(movementTypeLabel('COUNT_ADJUSTMENT')).toBe('Conteo');
    expect(movementTypeLabel('OTRO')).toBe('OTRO');
    expect(Object.keys(MOVEMENT_TYPE_LABELS)).toContain('EXCHANGE_OUT');
  });
});
