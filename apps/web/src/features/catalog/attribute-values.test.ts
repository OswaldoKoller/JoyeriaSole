import type { Attribute } from '@joyeria/shared';
import { describe, expect, it } from 'vitest';
import { buildAttributeInputs, missingRequired, sortBySuggestedUse } from './attribute-values.ts';

const attr = (
  id: string,
  dataType: Attribute['dataType'],
  suggestedUse: Attribute['suggestedUse'] = 'DESCRIPTIVE',
): Attribute => ({
  id,
  code: id,
  name: id,
  dataType,
  unit: null,
  suggestedUse,
  isSystem: false,
  isActive: true,
  sortOrder: 0,
  options: [],
});

describe('características del producto', () => {
  const attributes = [
    attr('lista', 'OPTION'),
    attr('texto', 'TEXT'),
    attr('numero', 'NUMBER'),
    attr('si-no', 'BOOLEAN'),
  ];

  it('convierte los campos al formato de la API y omite los vacíos', () => {
    const inputs = buildAttributeInputs(attributes, {
      lista: 'opt-1',
      texto: '  2 x 3 cm ',
      numero: '4,5',
      'si-no': 'false',
    });
    expect(inputs).toEqual([
      { attributeId: 'lista', optionId: 'opt-1' },
      { attributeId: 'texto', valueText: '2 x 3 cm' },
      { attributeId: 'numero', valueNumber: '4.5' },
      { attributeId: 'si-no', valueBoolean: false },
    ]);
    expect(buildAttributeInputs(attributes, { texto: '   ', lista: '' })).toEqual([]);
  });

  it('detecta los obligatorios sin completar', () => {
    const required = new Set(['texto', 'lista']);
    expect(missingRequired(attributes, required, { lista: 'x' })).toEqual(['texto']);
    expect(missingRequired(attributes, required, { lista: 'x', texto: 'y' })).toEqual([]);
  });

  it('ofrece primero el uso sugerido pedido y respeta el orden dentro de cada grupo', () => {
    const mixed = [
      attr('a', 'OPTION', 'DESCRIPTIVE'),
      attr('b', 'OPTION', 'VARIANT_AXIS'),
      attr('c', 'OPTION', 'DESCRIPTIVE'),
      attr('d', 'OPTION', 'VARIANT_AXIS'),
    ];
    expect(sortBySuggestedUse(mixed, 'VARIANT_AXIS').map((item) => item.id)).toEqual([
      'b',
      'd',
      'a',
      'c',
    ]);
    expect(sortBySuggestedUse(mixed, 'DESCRIPTIVE').map((item) => item.id)).toEqual([
      'a',
      'c',
      'b',
      'd',
    ]);
  });
});
