import { describe, expect, it } from 'vitest';
import { CODE128_QUIET_MODULES, barRuns, encodeCode128 } from './code128.ts';

const START_B = '11010010000';
const START_C = '11010011100';
const STOP = '1100011101011';

describe('Code 128 de las etiquetas', () => {
  it('codifica el SKU con inicio, símbolos de 11 módulos y parada', () => {
    const code = encodeCode128('SKU-000001');
    expect([START_B, START_C].some((start) => code.pattern.startsWith(start))).toBe(true);
    expect(code.pattern.endsWith(STOP)).toBe(true);
    // Cada símbolo mide 11 módulos y la parada 13.
    expect((code.pattern.length - STOP.length) % 11).toBe(0);
    expect(code.pattern).toMatch(/^[01]+$/);
  });

  it('calcula el ancho: SKU-000001 = inicio + 4 letras + cambio a C + 3 pares + control + parada', () => {
    const code = encodeCode128('SKU-000001');
    expect(code.modules).toBe(11 * 10 + 13);
    expect(code.totalModules).toBe(code.modules + 2 * CODE128_QUIET_MODULES);
  });

  it('un SKU más largo ocupa más módulos y la codificación es determinista', () => {
    const short = encodeCode128('SKU-000001');
    const long = encodeCode128('SKU-00000001');
    expect(long.modules).toBeGreaterThan(short.modules);
    expect(encodeCode128('SKU-000001').pattern).toBe(short.pattern);
    expect(encodeCode128('SKU-000002').pattern).not.toBe(short.pattern);
  });

  it('rechaza texto vacío o con caracteres que Code 128 no admite', () => {
    expect(() => encodeCode128('')).toThrow();
    expect(() => encodeCode128('SKU-ñ')).toThrow();
  });

  it('barRuns reconstruye el patrón: las barras contiguas se unen y los espacios quedan fuera', () => {
    expect(barRuns('0110011100')).toEqual([
      { x: 1, width: 2 },
      { x: 5, width: 3 },
    ]);
    expect(barRuns('111')).toEqual([{ x: 0, width: 3 }]);
    const { pattern } = encodeCode128('SKU-000001');
    const rebuilt = barRuns(pattern).reduce(
      (text, run) => text.padEnd(run.x, '0') + '1'.repeat(run.width),
      '',
    );
    expect(rebuilt.padEnd(pattern.length, '0')).toBe(pattern);
  });
});
