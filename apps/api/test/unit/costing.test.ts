import {
  MAX_UNIT_COST_UNITS,
  allocateExtraCosts,
  computeEntryCosts,
  convertToBob,
  formatMoney,
  formatUnitCost,
  parseExchangeRate,
  parseMoney,
  parseUnitCost,
  unitsToCents,
  type AllocationInput,
  type EntryCostItemInput,
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

describe('tipo de cambio y conversión a bolivianos (ADR-016)', () => {
  it('lee el tipo de cambio con hasta 4 decimales, mayor que cero', () => {
    expect(parseExchangeRate('6.96')).toBe(69_600n);
    expect(parseExchangeRate('10')).toBe(100_000n);
    expect(parseExchangeRate('0.0001')).toBe(1n);
    expect(parseExchangeRate('9999.9999')).toBe(99_999_999n);
    for (const bad of ['', '0', '0.0000', '-6.96', '6,96', '6.96001', '10000', 'abc', '06.9']) {
      expect(() => parseExchangeRate(bad), bad).toThrow(RangeError);
    }
  });

  it('convierte precio × tipo de cambio a 4 decimales, mitad hacia arriba', () => {
    const rate = parseExchangeRate('6.96');
    // 12,5 USD × 6,96 = 87,00 Bs exactos.
    expect(formatUnitCost(convertToBob(parseUnitCost('12.5'), rate))).toBe('87.0000');
    // 1,2345 × 6,96 = 8,59212 → 8,5921 (el 5.º decimal es 2: hacia abajo).
    expect(formatUnitCost(convertToBob(parseUnitCost('1.2345'), rate))).toBe('8.5921');
    // 0,0001 × 6,96 = 0,000696 → 0,0007 (sube); 0,0001 × 0,5 = 0,00005 → 0,0001 (mitad hacia arriba).
    expect(convertToBob(1n, rate)).toBe(7n);
    expect(convertToBob(1n, parseExchangeRate('0.5'))).toBe(1n);
    expect(convertToBob(1n, parseExchangeRate('0.4999'))).toBe(0n);
    // Sin errores de coma flotante: 0,1 USD × 3 = 0,3 Bs exactos.
    expect(formatUnitCost(convertToBob(parseUnitCost('0.1'), parseExchangeRate('3')))).toBe(
      '0.3000',
    );
  });
});

const priced = (key: string, receivedQty: number, unitPrice: string): EntryCostItemInput => ({
  key,
  receivedQty,
  unitPrice: parseUnitCost(unitPrice),
});

describe('costo de un ingreso en dólares (ADR-016)', () => {
  it('convierte cada ítem a Bs y reparte los costos sobre el valor ya convertido', () => {
    // 10 × 5 USD y 5 × 20 USD a 7 Bs/USD → 350 y 700 Bs (1/3 y 2/3); extras 30,00 Bs.
    const result = computeEntryCosts({
      currency: 'USD',
      exchangeRate: parseExchangeRate('7'),
      items: [priced('a', 10, '5'), priced('b', 5, '20')],
      extrasCents: parseMoney('30'),
    });
    if (!result.ok) throw new Error('se esperaba un resultado válido');
    expect(result.lines.map((line) => formatUnitCost(line.unitCostBob))).toEqual([
      '35.0000',
      '140.0000',
    ]);
    expect(result.lines.map((line) => line.extraCents)).toEqual([1000n, 2000n]);
    // Costo unitario total = compra en Bs + adicional por pieza (10,00/10 = 1; 20,00/5 = 4).
    expect(result.lines.map((line) => formatUnitCost(line.unitTotal))).toEqual([
      '36.0000',
      '144.0000',
    ]);
    expect(result.lines.map((line) => formatUnitCost(line.totalCost))).toEqual([
      '360.0000',
      '720.0000',
    ]);
    expect(formatUnitCost(result.totals.purchaseOriginal)).toBe('150.0000');
    expect(formatUnitCost(result.totals.purchaseBob)).toBe('1050.0000');
    expect(formatUnitCost(result.totals.grand)).toBe('1080.0000');
  });

  it('en bolivianos el precio es el costo y no se aplica tipo de cambio', () => {
    const result = computeEntryCosts({
      currency: 'BOB',
      exchangeRate: null,
      items: [priced('a', 3, '2.5')],
      extrasCents: 0n,
    });
    if (!result.ok) throw new Error('se esperaba un resultado válido');
    expect(result.lines[0]?.unitCostBob).toBe(parseUnitCost('2.5'));
    expect(formatUnitCost(result.totals.purchaseBob)).toBe('7.5000');
  });

  it('exige el tipo de cambio en dólares', () => {
    for (const exchangeRate of [null, 0n]) {
      expect(
        computeEntryCosts({
          currency: 'USD',
          exchangeRate,
          items: [priced('a', 1, '1')],
          extrasCents: 0n,
        }),
      ).toEqual({ ok: false, reason: 'MISSING_RATE' });
    }
  });

  it('redondea el costo unitario en Bs ANTES de multiplicar por la cantidad', () => {
    // 0,1111 USD × 6,96 = 0,773256 → 0,7733 Bs; 7 piezas = 5,4131 (no 5,412792).
    const result = computeEntryCosts({
      currency: 'USD',
      exchangeRate: parseExchangeRate('6.96'),
      items: [priced('a', 7, '0.1111')],
      extrasCents: 0n,
    });
    if (!result.ok) throw new Error('se esperaba un resultado válido');
    expect(formatUnitCost(result.lines[0]?.unitCostBob ?? 0n)).toBe('0.7733');
    expect(formatUnitCost(result.lines[0]?.value ?? 0n)).toBe('5.4131');
  });

  it('con costos adicionales y valor cero en dólares no hay base de reparto', () => {
    expect(
      computeEntryCosts({
        currency: 'USD',
        exchangeRate: parseExchangeRate('7'),
        items: [priced('a', 3, '0')],
        extrasCents: parseMoney('5'),
      }),
    ).toEqual({ ok: false, reason: 'ZERO_VALUE' });
  });

  it('detecta valores que no caben en la columna (precio o costo convertido)', () => {
    const max = formatUnitCost(MAX_UNIT_COST_UNITS);
    // 99 999 999,9999 USD × 7 desborda en Bs aunque el precio original quepa.
    expect(
      computeEntryCosts({
        currency: 'USD',
        exchangeRate: parseExchangeRate('7'),
        items: [priced('a', 1, max)],
        extrasCents: 0n,
      }),
    ).toEqual({ ok: false, reason: 'OVERFLOW' });
    // En el límite exacto sí cabe (tipo de cambio 1).
    const exact = computeEntryCosts({
      currency: 'USD',
      exchangeRate: parseExchangeRate('1'),
      items: [priced('a', 1, max)],
      extrasCents: 0n,
    });
    expect(exact.ok).toBe(true);
  });

  it('valores límite: cantidad máxima con un tipo de cambio mínimo da costo cero', () => {
    const tiny = computeEntryCosts({
      currency: 'USD',
      exchangeRate: parseExchangeRate('0.0001'),
      items: [priced('a', 1_000_000, '0.0001')],
      extrasCents: 0n,
    });
    if (!tiny.ok) throw new Error('se esperaba un resultado válido');
    // 0,0001 × 0,0001 = 0,00000001 → 0 Bs.
    expect(tiny.lines[0]?.unitCostBob).toBe(0n);
    // Con costos adicionales ese ingreso no tiene base de reparto.
    expect(
      computeEntryCosts({
        currency: 'USD',
        exchangeRate: parseExchangeRate('0.0001'),
        items: [priced('a', 1_000_000, '0.0001')],
        extrasCents: parseMoney('1'),
      }),
    ).toEqual({ ok: false, reason: 'ZERO_VALUE' });
  });

  it('propiedad: en 500 casos en dólares la suma de los repartos es el total de costos adicionales', () => {
    let seed = 1106;
    const next = (max: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed % max;
    };
    for (let round = 0; round < 500; round += 1) {
      const count = 1 + next(10);
      const items = Array.from({ length: count }, (_, index) =>
        priced(`item-${index}`, next(30), `${next(300)}.${String(next(10000)).padStart(4, '0')}`),
      );
      const rate = BigInt(1 + next(120_000)); // 0,0001 … 12,0000
      const extrasCents = BigInt(next(5_000_000));
      const result = computeEntryCosts({ currency: 'USD', exchangeRate: rate, items, extrasCents });
      if (!result.ok) {
        expect(result.reason, `ronda ${round}`).toBe('ZERO_VALUE');
        expect(extrasCents > 0n).toBe(true);
        continue;
      }
      const assigned = result.lines.reduce((sum, line) => sum + line.extraCents, 0n);
      expect(assigned, `ronda ${round}`).toBe(extrasCents);
      for (const [index, line] of result.lines.entries()) {
        const item = items[index];
        if (!item) throw new Error('línea sin ítem');
        // El valor en Bs es exactamente cantidad × costo unitario convertido.
        expect(line.value).toBe(BigInt(item.receivedQty) * convertToBob(item.unitPrice, rate));
        expect(line.totalCost).toBe(line.value + line.extraCents * 100n);
      }
      expect(result.totals.grand).toBe(result.totals.purchaseBob + extrasCents * 100n);
    }
  });
});
