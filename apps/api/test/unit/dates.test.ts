import { checkDocumentDate, documentDateBounds, todayInLaPaz } from '@joyeria/shared';
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
