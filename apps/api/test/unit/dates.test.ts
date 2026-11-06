import {
  checkDocumentDate,
  dayRangeLaPaz,
  documentDateBounds,
  todayInLaPaz,
} from '@joyeria/shared';
import { describe, expect, it } from 'vitest';

describe('fechas del negocio en America/La_Paz (C6)', () => {
  it('calcula «hoy» con la hora de La Paz (UTC-4), no la de UTC', () => {
    // 02:00 UTC del 6 de noviembre = 22:00 del 5 de noviembre en La Paz.
    expect(todayInLaPaz(new Date('2026-11-06T02:00:00Z'))).toBe('2026-11-05');
    // 04:00 UTC del 6 = 00:00 del 6 en La Paz.
    expect(todayInLaPaz(new Date('2026-11-06T04:00:00Z'))).toBe('2026-11-06');
  });

  it('el rango permitido va de 30 días atrás a hoy', () => {
    expect(documentDateBounds(new Date('2026-11-05T15:00:00Z'))).toEqual({
      min: '2026-10-06',
      max: '2026-11-05',
    });
    // Cruza el cambio de mes y de año.
    expect(documentDateBounds(new Date('2027-01-10T15:00:00Z')).min).toBe('2026-12-11');
  });

  it('acepta hoy y 30 días atrás; rechaza futura y anterior', () => {
    const now = new Date('2026-11-05T15:00:00Z');
    expect(checkDocumentDate('2026-11-05', now)).toBeNull();
    expect(checkDocumentDate('2026-10-06', now)).toBeNull();
    expect(checkDocumentDate('2026-11-06', now)).toBe('FUTURE');
    expect(checkDocumentDate('2026-10-05', now)).toBe('TOO_OLD');
  });

  it('a las 22:00 en La Paz «mañana» (UTC) todavía es futura', () => {
    const now = new Date('2026-11-06T02:00:00Z'); // 5 de noviembre, 22:00 en La Paz
    expect(checkDocumentDate('2026-11-06', now)).toBe('FUTURE');
    expect(checkDocumentDate('2026-11-05', now)).toBeNull();
  });
});

describe('dayRangeLaPaz (M-03)', () => {
  it('cubre el día calendario de La Paz: de 04:00 UTC a 03:59:59.999 UTC del día siguiente', () => {
    const { start, end } = dayRangeLaPaz('2026-11-05');
    expect(start.toISOString()).toBe('2026-11-05T04:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-06T03:59:59.999Z');
  });

  it('el borde 20:00 y 00:00 de La Paz queda en el día correcto', () => {
    const day5 = dayRangeLaPaz('2026-11-05');
    const day6 = dayRangeLaPaz('2026-11-06');
    const within = (instant: Date, range: { start: Date; end: Date }) =>
      instant >= range.start && instant <= range.end;

    // 20:00 del 5 en La Paz = 00:00 UTC del 6: en UTC ya es «mañana», pero sigue siendo el día 5.
    const evening = new Date('2026-11-06T00:00:00.000Z');
    expect(todayInLaPaz(evening)).toBe('2026-11-05');
    expect(within(evening, day5)).toBe(true);
    expect(within(evening, day6)).toBe(false);

    // 23:59:59.999 del 5 en La Paz sigue en el 5; 00:00:00.000 del 6 ya es del 6.
    const lastMs = new Date('2026-11-06T03:59:59.999Z');
    const firstMs = new Date('2026-11-06T04:00:00.000Z');
    expect(within(lastMs, day5)).toBe(true);
    expect(within(firstMs, day5)).toBe(false);
    expect(within(firstMs, day6)).toBe(true);
    expect(todayInLaPaz(lastMs)).toBe('2026-11-05');
    expect(todayInLaPaz(firstMs)).toBe('2026-11-06');

    // 03:00 UTC del 5 = 23:00 del 4 en La Paz: todavía no es del día 5.
    const before = new Date('2026-11-05T03:00:00.000Z');
    expect(within(before, day5)).toBe(false);
    expect(todayInLaPaz(before)).toBe('2026-11-04');
  });

  it('cruza fin de mes y de año', () => {
    expect(dayRangeLaPaz('2026-12-31').end.toISOString()).toBe('2027-01-01T03:59:59.999Z');
    expect(dayRangeLaPaz('2026-02-28').end.toISOString()).toBe('2026-03-01T03:59:59.999Z');
  });
});
