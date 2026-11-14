import { describe, expect, it } from 'vitest';
import {
  CSV_BOM,
  CSV_SEPARATOR,
  csvCell,
  csvNumber,
  csvRow,
  formatLaPazTimestamp,
  neutralizeFormula,
} from '../../src/lib/csv.ts';

describe('serializador CSV de las exportaciones', () => {
  it('usa «;» (Excel en español) y BOM UTF-8', () => {
    expect(CSV_SEPARATOR).toBe(';');
    expect(CSV_BOM).toBe('\uFEFF');
  });

  describe('neutralización de fórmulas (CSV injection)', () => {
    it.each(['=1+1', '+1', '-1+1', '@SUM(A1)', '\tcmd', '\rcmd', '\ncmd'])(
      'prefija con apóstrofe %j',
      (text) => {
        expect(neutralizeFormula(text)).toBe(`'${text}`);
      },
    );

    it('neutraliza también la fórmula precedida de espacios', () => {
      expect(neutralizeFormula('  =HYPERLINK("http://x")')).toBe(`'  =HYPERLINK("http://x")`);
    });

    it('no toca el texto normal', () => {
      for (const text of ['Anillo', 'Plata 925 / Talla 16', 'a=b', '1-2', '']) {
        expect(neutralizeFormula(text)).toBe(text);
      }
    });

    it('neutraliza la carga típica de DDE y la deja bien escapada', () => {
      expect(csvCell(`=cmd|' /C calc'!A0`)).toBe(`'=cmd|' /C calc'!A0`);
      // Con separador dentro: apóstrofe + comillas escapadas.
      expect(csvCell('=A1;"x"')).toBe(`"'=A1;""x"""`);
    });

    it('los números declarados no se neutralizan, aunque sean negativos', () => {
      expect(csvCell(csvNumber(-3))).toBe('-3');
      expect(csvCell(csvNumber('12.5000'))).toBe('12.5000');
      expect(csvCell(csvNumber(12n))).toBe('12');
    });

    it('un texto que parece número SÍ se neutraliza (solo csvNumber es número)', () => {
      expect(csvCell('-3')).toBe("'-3");
    });
  });

  describe('escape', () => {
    it('entrecomilla y duplica comillas, separadores y saltos de línea', () => {
      expect(csvCell('dijo "hola"')).toBe('"dijo ""hola"""');
      expect(csvCell('a;b')).toBe('"a;b"');
      expect(csvCell('línea 1\nlínea 2')).toBe('"línea 1\nlínea 2"');
      expect(csvCell('línea 1\r\nlínea 2')).toBe('"línea 1\r\nlínea 2"');
    });

    it('la coma no necesita comillas con separador «;»', () => {
      expect(csvCell('Dije, luna')).toBe('Dije, luna');
    });

    it('null y undefined son celdas vacías', () => {
      expect(csvCell(null)).toBe('');
      expect(csvCell(undefined)).toBe('');
    });

    it('una fila termina en CRLF y separa con «;»', () => {
      expect(csvRow(['a', csvNumber(1), null, 'x;y'])).toBe('a;1;;"x;y"\r\n');
    });
  });

  describe('números', () => {
    it('solo acepta dígitos con signo y punto decimal', () => {
      for (const bad of ['1e21', '1,5', 'NaN', 'Infinity', '', '1.', '.5', '=1', ' 1']) {
        expect(() => csvNumber(bad), bad).toThrow(TypeError);
      }
      expect(() => csvNumber(Number.NaN)).toThrow(TypeError);
      expect(() => csvNumber(1e21)).toThrow(TypeError);
    });
  });

  describe('fecha y hora', () => {
    it('se escribe en hora de La Paz (UTC-4)', () => {
      expect(formatLaPazTimestamp(new Date('2026-11-13T03:05:09.000Z'))).toBe(
        '2026-11-12 23:05:09',
      );
      expect(formatLaPazTimestamp(new Date('2026-11-13T04:00:00.000Z'))).toBe(
        '2026-11-13 00:00:00',
      );
    });
  });
});
