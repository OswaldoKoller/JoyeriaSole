import {
  allocateExtraCosts,
  formatMoney,
  formatUnitCost,
  parseMoney,
  parseUnitCost,
  unitsToCents,
  type AllocationInput,
} from '@joyeria/shared';
import { describe, expect, it } from 'vitest';

const line = (key: string, receivedQty: number, unitCost: string): AllocationInput => ({
  key,
  receivedQty,
  unitCost: parseUnitCost(unitCost),
});

function allocate(inputs: AllocationInput[], extras: string) {
  const result = allocateExtraCosts(inputs, parseMoney(extras));
  if (!result.ok) throw new Error('se esperaba un reparto válido');
  return result;
}

describe('importes exactos', () => {
  it('convierte texto decimal a enteros y de vuelta sin errores de coma flotante', () => {
    expect(parseMoney('150.5')).toBe(15050n);
    expect(parseMoney('0.07')).toBe(7n);
    expect(formatMoney(15050n)).toBe('150.50');
    expect(parseUnitCost('12.5')).toBe(125000n);
    expect(parseUnitCost('0.0001')).toBe(1n);
    expect(formatUnitCost(125000n)).toBe('12.5000');
    expect(formatUnitCost(1n)).toBe('0.0001');
    // El clásico 0.1 + 0.2 no es 0.3 en coma flotante; aquí sí.
    expect(parseMoney('0.1') + parseMoney('0.2')).toBe(parseMoney('0.3'));
  });

  it('rechaza formatos inválidos', () => {
    for (const bad of ['', '-1', '1,5', '1.234', 'abc', '01', '1.']) {
      expect(() => parseMoney(bad), bad).toThrow(RangeError);
    }
    expect(() => parseUnitCost('1.23456')).toThrow(RangeError);
  });

  it('pasa unidades de 1/10 000 a centavos con mitad hacia arriba', () => {
    expect(unitsToCents(12_349n)).toBe(123n);
    expect(unitsToCents(12_350n)).toBe(124n);
  });
});

describe('reparto de costos adicionales por valor (ADR-013 / ADR-015)', () => {
  it('reparte en proporción exacta al valor de cada línea', () => {
    // Valores 100 y 200 → 1/3 y 2/3 de 30,00.
    const result = allocate([line('a', 10, '10'), line('b', 10, '20')], '30');
    expect(result.lines.map((item) => item.extraCents)).toEqual([1000n, 2000n]);
    expect(result.totalValue).toBe(parseUnitCost('300'));
  });

  it('entrega los centavos sobrantes por mayor resto y la suma cuadra', () => {
    // Tres líneas iguales y 1,00: cada una merece 33,33… → 34 / 33 / 33 (desempate por clave).
    const result = allocate([line('a', 1, '5'), line('b', 1, '5'), line('c', 1, '5')], '1');
    expect(result.lines.map((item) => item.extraCents)).toEqual([34n, 33n, 33n]);
  });

  it('prefiere al de mayor resto, no al más caro ni al primero', () => {
    // Valores 1, 1 y 2; extras 0,03 → exactas 0,75 / 0,75 / 1,5 centavos… (0,0075 Bs cada una)
    // Aquí en centavos: extras = 3 → partes 0,75; 0,75; 1,5 → bases 0,0,1; sobran 2.
    // Restos: 0,75; 0,75; 0,5 → los dos primeros reciben el centavo.
    const result = allocate([line('a', 1, '1'), line('b', 1, '1'), line('c', 1, '2')], '0.03');
    expect(result.lines.map((item) => item.extraCents)).toEqual([1n, 1n, 1n]);
  });

  it('es determinista: el orden de entrada no cambia a quién se asigna cada parte', () => {
    const base = [line('a', 1, '5'), line('b', 1, '5'), line('c', 1, '5')];
    const forward = allocate(base, '1');
    const reversed = allocate([...base].reverse(), '1');
    const byKey = (lines: typeof forward.lines) =>
      Object.fromEntries(lines.map((item) => [item.key, item.extraCents]));
    expect(byKey(forward.lines)).toEqual(byKey(reversed.lines));
  });

  it('sin costos adicionales no reparte nada, ni siquiera con valor cero', () => {
    const result = allocate([line('a', 3, '0'), line('b', 2, '0')], '0');
    expect(result.lines.every((item) => item.extraCents === 0n && item.unitExtra === 0n)).toBe(
      true,
    );
  });

  it('con costos adicionales y valor de compra cero no hay base de reparto', () => {
    expect(allocateExtraCosts([line('a', 3, '0')], parseMoney('5'))).toEqual({
      ok: false,
      reason: 'ZERO_VALUE',
    });
    expect(allocateExtraCosts([], parseMoney('5'))).toEqual({ ok: false, reason: 'ZERO_VALUE' });
  });

  it('una línea con cantidad cero no recibe costos', () => {
    const result = allocate([line('a', 0, '10'), line('b', 4, '10')], '8');
    expect(result.lines[0]).toMatchObject({ extraCents: 0n, unitExtra: 0n });
    expect(result.lines[1]?.extraCents).toBe(800n);
  });

  it('calcula el costo adicional unitario a 4 decimales, mitad hacia arriba', () => {
    // 1,00 sobre 3 piezas → 0,3333 (3333,33…); costo total = compra + adicional.
    const third = allocate([line('a', 3, '2')], '1');
    expect(third.lines[0]).toMatchObject({ unitExtra: 3333n });
    expect(formatUnitCost(third.lines[0]?.unitTotal ?? 0n)).toBe('2.3333');
    // 0,01 sobre 8 piezas → 0,00125 → 0,0013 (mitad hacia arriba).
    const half = allocate([line('a', 8, '1')], '0.01');
    expect(half.lines[0]?.unitExtra).toBe(13n);
  });

  it('propiedad: en 500 casos aleatorios la suma de las partes es exactamente el total', () => {
    // Generador pseudoaleatorio fijo (LCG): reproducible, sin dependencias.
    let seed = 20261011;
    const next = (max: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed % max;
    };
    for (let round = 0; round < 500; round += 1) {
      const count = 1 + next(12);
      const inputs = Array.from({ length: count }, (_, index) =>
        line(`item-${index}`, next(40), `${next(500)}.${String(next(10000)).padStart(4, '0')}`),
      );
      const extras = BigInt(next(2_000_000));
      const result = allocateExtraCosts(inputs, extras);
      const hasValue = inputs.some((input) => input.receivedQty > 0 && input.unitCost > 0n);
      if (extras > 0n && !hasValue) {
        expect(result).toEqual({ ok: false, reason: 'ZERO_VALUE' });
        continue;
      }
      if (!result.ok) throw new Error('se esperaba un reparto válido');
      const total = result.lines.reduce((sum, item) => sum + item.extraCents, 0n);
      expect(total, `ronda ${round}`).toBe(extras);
      // Ninguna parte difiere de su cuota exacta en más de un centavo.
      for (const [index, item] of result.lines.entries()) {
        const exact = (extras * (result.lines[index]?.value ?? 0n)) / (result.totalValue || 1n);
        expect(item.extraCents - exact >= 0n && item.extraCents - exact <= 1n).toBe(true);
      }
    }
  });
});
