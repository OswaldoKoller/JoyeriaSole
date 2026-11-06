import type { AdjustmentReason } from '@joyeria/shared';
import { describe, expect, it } from 'vitest';
import {
  buildInput,
  parseDelta,
  resultingQuantity,
  zeroDelta,
  type FormLine,
} from './adjustment-form.ts';

const REASON_LOSS: AdjustmentReason = {
  id: '01900000-0000-7000-8000-000000000001',
  code: 'LOSS',
  name: 'Pérdida',
  requiresNotes: false,
};
const REASON_OTHER: AdjustmentReason = {
  id: '01900000-0000-7000-8000-000000000002',
  code: 'OTHER',
  name: 'Otro',
  requiresNotes: true,
};
const reasons = [REASON_LOSS, REASON_OTHER];

const line = (overrides: Partial<FormLine> = {}): FormLine => ({
  variantId: '01900000-0000-7000-8000-0000000000a1',
  sku: 'SKU-000001',
  productName: 'Anillo',
  variantLabel: null,
  quantity: 5,
  delta: '-2',
  ...overrides,
});

describe('diferencia del ajuste', () => {
  it('interpreta signos y rechaza vacío, cero y decimales', () => {
    expect(parseDelta('-3')).toBe(-3);
    expect(parseDelta('+2')).toBe(2);
    expect(parseDelta(' 5 ')).toBe(5);
    for (const bad of ['', '0', '-0', '1.5', 'abc', '--1', '1e3'])
      expect(parseDelta(bad)).toBeNull();
  });

  it('calcula el saldo resultante y el atajo a cero', () => {
    expect(resultingQuantity(line({ delta: '-2' }))).toBe(3);
    expect(resultingQuantity(line({ delta: '4' }))).toBe(9);
    expect(resultingQuantity(line({ delta: '' }))).toBeNull();
    expect(zeroDelta(7)).toBe('-7');
    expect(zeroDelta(0)).toBe('');
  });
});

describe('armado de la solicitud', () => {
  it('arma la entrada de la API con la diferencia con signo', () => {
    const result = buildInput({ reasonId: REASON_LOSS.id, notes: '  ', lines: [line()] }, reasons);
    expect(result).toEqual({
      ok: true,
      input: {
        reasonId: REASON_LOSS.id,
        notes: null,
        items: [{ variantId: line().variantId, quantityDelta: -2 }],
      },
    });
  });

  it('marca las líneas con diferencia inválida o que dejarían el saldo negativo', () => {
    const empty = buildInput(
      { reasonId: REASON_LOSS.id, notes: '', lines: [line({ delta: '' })] },
      reasons,
    );
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(Object.keys(empty.lineErrors)).toHaveLength(1);

    const negative = buildInput(
      { reasonId: REASON_LOSS.id, notes: '', lines: [line({ delta: '-6' })] },
      reasons,
    );
    expect(negative.ok).toBe(false);
    if (!negative.ok) expect(Object.values(negative.lineErrors)[0]).toContain('salida máxima es 5');
  });

  it('exige motivo, y observación cuando el motivo es «Otro»', () => {
    expect(buildInput({ reasonId: '', notes: '', lines: [line()] }, reasons)).toMatchObject({
      ok: false,
      formError: 'Elija el motivo del ajuste.',
    });
    expect(
      buildInput({ reasonId: REASON_OTHER.id, notes: ' ', lines: [line()] }, reasons),
    ).toMatchObject({
      ok: false,
      formError: expect.stringContaining('exige una observación'),
    });
    expect(
      buildInput({ reasonId: REASON_OTHER.id, notes: 'Regalo', lines: [line()] }, reasons).ok,
    ).toBe(true);
  });

  it('exige al menos una línea', () => {
    expect(buildInput({ reasonId: REASON_LOSS.id, notes: '', lines: [] }, reasons)).toMatchObject({
      ok: false,
      formError: 'Agregue al menos una variante.',
    });
  });
});
