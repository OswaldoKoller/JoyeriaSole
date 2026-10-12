import type { StockEntryDetail } from '@joyeria/shared';
import { describe, expect, it } from 'vitest';
import { fromServer, ingressLabel, previewLines, toInput, type Line } from './lines.ts';

const line = (overrides: Partial<Line> = {}): Line => ({
  variantId: '00000000-0000-7000-8000-000000000001',
  sku: 'SKU-000001',
  productName: 'Anillo',
  variantLabel: null,
  expectedQty: '',
  receivedQty: '1',
  unitCost: '10',
  notes: '',
  ...overrides,
});

describe('líneas del ingreso', () => {
  it('formatea el número correlativo del ingreso', () => {
    expect(ingressLabel(7)).toBe('ING-000007');
    expect(ingressLabel(123456)).toBe('ING-123456');
  });

  it('convierte las líneas del servidor sin ceros de relleno', () => {
    const items = [
      {
        id: 'a',
        variantId: 'v1',
        sku: 'SKU-1',
        productName: 'Anillo',
        variantLabel: 'Única',
        expectedQty: null,
        receivedQty: 4,
        unitCost: '12.5000',
        unitExtraCost: null,
        unitTotalCost: null,
        notes: null,
      },
      {
        id: 'b',
        variantId: 'v2',
        sku: 'SKU-2',
        productName: 'Collar',
        variantLabel: null,
        expectedQty: 6,
        receivedQty: 5,
        unitCost: '10.0000',
        unitExtraCost: null,
        unitTotalCost: null,
        notes: 'una caja dañada',
      },
    ] as StockEntryDetail['items'];
    const lines = fromServer(items);
    expect(lines.map((item) => item.unitCost)).toEqual(['12.5', '10']);
    expect(lines.map((item) => item.expectedQty)).toEqual(['', '6']);
    expect(lines[1]?.notes).toBe('una caja dañada');
  });

  it('valida con el mismo esquema que la API y explica cada error', () => {
    const ok = toInput([line({ expectedQty: '3', receivedQty: '2', unitCost: '12.5' })]);
    expect(ok).toEqual({
      ok: true,
      items: [
        {
          variantId: '00000000-0000-7000-8000-000000000001',
          expectedQty: 3,
          receivedQty: 2,
          unitCost: '12.5',
          notes: null,
        },
      ],
    });

    const bad = (patch: Partial<Line>) => {
      const result = toInput([line(patch)]);
      if (result.ok) throw new Error('se esperaba un error');
      return Object.values(result.errors)[0];
    };
    expect(bad({ receivedQty: '1.5' })).toMatch(/cantidad recibida/);
    expect(bad({ receivedQty: '' })).toMatch(/cantidad recibida/);
    expect(bad({ receivedQty: '-1' })).toMatch(/cantidad recibida/);
    expect(bad({ expectedQty: 'abc' })).toMatch(/cantidad esperada/);
    expect(bad({ unitCost: '1.23456' })).toMatch(/costo unitario/);
    expect(bad({ unitCost: 'x' })).toMatch(/costo unitario/);
  });

  it('la vista previa reparte con el mismo resultado que la API', () => {
    const parsed = toInput([
      line({
        variantId: '00000000-0000-7000-8000-000000000001',
        receivedQty: '10',
        unitCost: '10',
      }),
      line({ variantId: '00000000-0000-7000-8000-000000000002', receivedQty: '5', unitCost: '20' }),
    ]);
    if (!parsed.ok) throw new Error('líneas válidas');
    // Mismo caso que la prueba de integración de la API: 11,00 entre dos líneas de 100.
    const preview = previewLines(parsed.items, 1100n);
    expect(preview).toMatchObject({
      purchaseTotal: '200.00',
      extrasTotal: '11.00',
      grandTotal: '211.00',
      zeroValue: false,
    });
    expect(preview.perVariant.get('00000000-0000-7000-8000-000000000001')).toEqual({
      unitExtra: '0.5500',
      unitTotal: '10.5500',
    });
    expect(preview.perVariant.get('00000000-0000-7000-8000-000000000002')).toEqual({
      unitExtra: '1.1000',
      unitTotal: '21.1000',
    });
  });

  it('avisa cuando no hay base de reparto (costos adicionales con valor cero)', () => {
    const parsed = toInput([line({ receivedQty: '3', unitCost: '0' })]);
    if (!parsed.ok) throw new Error('líneas válidas');
    const preview = previewLines(parsed.items, 500n);
    expect(preview.zeroValue).toBe(true);
    expect(preview.perVariant.size).toBe(0);
    expect(previewLines(parsed.items, 0n).zeroValue).toBe(false);
  });
});
