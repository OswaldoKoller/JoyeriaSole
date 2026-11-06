import { describe, expect, it } from 'vitest';
import {
  formatBs,
  formatBsPrecise,
  formatDate,
  formatDateTime,
  formatDateTimeLong,
  formatDateTimeSeconds,
  formatInt,
  formatPercent,
  formatRatio,
  formatUsd,
  formatWeekdayDate,
} from './format.ts';

// Instante: 2026-11-07 02:30 UTC = 6 de noviembre, 22:30 en La Paz (UTC-4).
const INSTANT = '2026-11-07T02:30:15.000Z';

describe('formatos es-BO', () => {
  it('bolivianos: coma decimal, 2 decimales y «—» para vacío', () => {
    expect(formatBs('12.5')).toMatch(/12,50/);
    expect(formatBs(1234.5)).toMatch(/1\.234,50|1\s234,50/);
    expect(formatBs(null)).toBe('—');
    expect(formatBs(undefined)).toBe('—');
  });

  it('bolivianos precisos: hasta 4 decimales para costos unitarios', () => {
    expect(formatBsPrecise('12.5')).toMatch(/12,50/);
    expect(formatBsPrecise('12.3456')).toMatch(/12,3456/);
    expect(formatBs('12.3456')).toMatch(/12,35/);
    expect(formatBsPrecise(null)).toBe('—');
  });

  it('dólares con símbolo propio', () => {
    expect(formatUsd('10')).toMatch(/USD/);
    expect(formatUsd('10')).toMatch(/10,00/);
  });

  it('enteros, proporciones y porcentajes', () => {
    expect(formatInt(1500)).toMatch(/1\.500|1\s500|1500/);
    expect(formatRatio(0.456)).toMatch(/46/);
    expect(formatPercent('12.5')).toMatch(/^12,50\s%$/);
    expect(formatPercent(null)).toBe('—');
  });

  it('fechas en la hora de La Paz, no la del navegador', () => {
    // En UTC sería 7/11; en La Paz sigue siendo 6/11.
    expect(formatDate(INSTANT)).toMatch(/6\/11\/26|06\/11\/26|6\/11\/2026/);
    expect(formatDateTime(INSTANT)).toMatch(/10:30/); // 22:30 en reloj de 12 horas
    expect(formatDateTimeSeconds(INSTANT)).toMatch(/10:30:15/);
    expect(formatDateTimeLong(INSTANT)).toMatch(/noviembre/);
    expect(formatDateTime(null)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  it('día de la semana para el encabezado del Inicio', () => {
    expect(formatWeekdayDate(new Date(INSTANT))).toMatch(/viernes.*6.*noviembre/);
  });
});
