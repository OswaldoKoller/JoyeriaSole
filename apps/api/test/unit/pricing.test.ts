import {
  approvePriceChangesSchema,
  computeProfit,
  hasSalePrice,
  priceChangesInputSchema,
  rejectPriceChangesSchema,
  salePriceSchema,
} from '@joyeria/shared';
import { describe, expect, it } from 'vitest';

const ID_A = '01900000-0000-7000-8000-00000000000a';
const ID_B = '01900000-0000-7000-8000-00000000000b';

describe('ganancia frente al costo total (Q-06)', () => {
  it('calcula la ganancia en Bs y el % sobre el costo con aritmética exacta', () => {
    // 100,00 − 40,3333 = 59,6667 → 59,67 ; 59,6667 / 40,3333 = 147,9339...%
    expect(computeProfit('100.00', '40.3333')).toEqual({ profit: '59.67', percent: '147.93' });
    // El ejemplo del cliente: costo 97,9 y precio 115 → 17,10 Bs (17,4694...%)
    expect(computeProfit('115.00', '97.9000')).toEqual({ profit: '17.10', percent: '17.47' });
  });

  it('con costo 0 no hay porcentaje y la ganancia es todo el precio', () => {
    expect(computeProfit('50.00', '0.0000')).toEqual({ profit: '50.00', percent: null });
    expect(computeProfit('0', '0')).toEqual({ profit: '0.00', percent: null });
  });

  it('precio igual al costo da ganancia cero y 0,00 %', () => {
    expect(computeProfit('12.50', '12.5000')).toEqual({ profit: '0.00', percent: '0.00' });
  });

  it('precio menor al costo da ganancia y porcentaje negativos (se advierte, no se bloquea)', () => {
    expect(computeProfit('10.00', '20.0000')).toEqual({ profit: '-10.00', percent: '-50.00' });
    expect(computeProfit('0', '8.3333')).toEqual({ profit: '-8.33', percent: '-100.00' });
  });

  it('redondea la mitad hacia arriba en valor absoluto, sin errores de coma flotante', () => {
    // 0,10 − 0,0950 = 0,0050 → 0,01 ; 0,0950 − 0,10 = −0,0050 → −0,01
    expect(computeProfit('0.10', '0.0950').profit).toBe('0.01');
    expect(computeProfit('0.09', '0.0950').profit).toBe('-0.01');
    // 0,1 + 0,2 no es 0,3 en coma flotante; aquí sí: 0,30 − 0,2000 − ... = 0,10
    expect(computeProfit('0.30', '0.2000')).toEqual({ profit: '0.10', percent: '50.00' });
    // 1/3 de porcentaje: (10 − 3) / 3 = 233,333...%
    expect(computeProfit('10.00', '3.0000').percent).toBe('233.33');
  });

  it('rechaza formatos inválidos', () => {
    expect(() => computeProfit('abc', '1')).toThrow(RangeError);
    expect(() => computeProfit('1', '-1')).toThrow(RangeError);
    expect(() => computeProfit('1.234', '1')).toThrow(RangeError);
  });

  it('hasSalePrice distingue «Sin precio» (D9)', () => {
    expect(hasSalePrice('0')).toBe(false);
    expect(hasSalePrice('0.00')).toBe(false);
    expect(hasSalePrice('0.01')).toBe(true);
  });
});

describe('esquemas de precios', () => {
  it('el precio admite 0 y hasta 2 decimales, nunca negativos', () => {
    for (const ok of ['0', '0.5', '115', '115.00', '9999999999.99']) {
      expect(salePriceSchema.safeParse(ok).success, ok).toBe(true);
    }
    for (const bad of ['-1', '1.234', '1,5', 'abc', '', '01', '10000000000']) {
      expect(salePriceSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('un lote no repite variantes ni queda vacío', () => {
    expect(priceChangesInputSchema.safeParse({ items: [] }).success).toBe(false);
    expect(
      priceChangesInputSchema.safeParse({
        items: [
          { variantId: ID_A, newPrice: '10' },
          { variantId: ID_A, newPrice: '12' },
        ],
      }).success,
    ).toBe(false);
    const ok = priceChangesInputSchema.parse({
      items: [
        { variantId: ID_A, newPrice: '10' },
        { variantId: ID_B, newPrice: '12.50' },
      ],
      reason: '  Temporada  ',
    });
    expect(ok.reason).toBe('Temporada');
  });

  it('rechazar exige un comentario con contenido', () => {
    expect(rejectPriceChangesSchema.safeParse({ ids: [ID_A] }).success).toBe(false);
    expect(rejectPriceChangesSchema.safeParse({ ids: [ID_A], comment: '  ' }).success).toBe(false);
    expect(rejectPriceChangesSchema.safeParse({ ids: [ID_A], comment: 'Muy caro' }).success).toBe(
      true,
    );
    expect(approvePriceChangesSchema.safeParse({ ids: [] }).success).toBe(false);
  });
});
