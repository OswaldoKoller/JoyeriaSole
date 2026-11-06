import type { StockEntryDetail } from '@joyeria/shared';
import { describe, expect, it } from 'vitest';
import {
  fromServer,
  ingressLabel,
  missingReasons,
  previewEntry,
  storedPreview,
  sumCosts,
  toInput,
  type Line,
} from './lines.ts';

const A = '00000000-0000-7000-8000-000000000001';
const B = '00000000-0000-7000-8000-000000000002';

const line = (overrides: Partial<Line> = {}): Line => ({
  variantId: A,
  sku: 'SKU-000001',
  productName: 'Anillo',
  variantLabel: null,
  profileIncomplete: false,
  expectedQty: '',
  receivedQty: '1',
  unitPrice: '10',
  differenceReason: '',
  notes: '',
  ...overrides,
});

const cost = {
  unitPrice: '12.5000',
  unitCostBob: '12.5000',
  subtotalOriginal: '50.0000',
  subtotalBob: '50.0000',
  extraAllocated: null,
  totalCost: null,
  unitExtraCost: null,
  unitTotalCost: null,
};

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
        profileIncomplete: true,
        expectedQty: null,
        receivedQty: 4,
        differenceReason: null,
        notes: null,
        cost,
      },
      {
        id: 'b',
        variantId: 'v2',
        sku: 'SKU-2',
        productName: 'Collar',
        variantLabel: null,
        profileIncomplete: false,
        expectedQty: 6,
        receivedQty: 5,
        differenceReason: 'Faltó una',
        notes: 'una caja dañada',
        cost: { ...cost, unitPrice: '10.0000' },
      },
    ] as StockEntryDetail['items'];
    const lines = fromServer(items);
    expect(lines.map((item) => item.unitPrice)).toEqual(['12.5', '10']);
    expect(lines.map((item) => item.expectedQty)).toEqual(['', '6']);
    expect(lines[1]).toMatchObject({ notes: 'una caja dañada', differenceReason: 'Faltó una' });
    expect(lines[0]?.profileIncomplete).toBe(true);
  });

  it('valida con el mismo esquema que la API y explica cada error', () => {
    const ok = toInput([line({ expectedQty: '3', receivedQty: '2', unitPrice: '12.5' })]);
    expect(ok).toEqual({
      ok: true,
      items: [
        {
          variantId: A,
          expectedQty: 3,
          receivedQty: 2,
          unitPrice: '12.5',
          differenceReason: null,
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
    expect(bad({ unitPrice: '1.23456' })).toMatch(/precio de compra/);
    expect(bad({ unitPrice: 'x' })).toMatch(/precio de compra/);
  });

  it('detecta las diferencias sin justificar (C2)', () => {
    const lines = [
      line({ variantId: A, expectedQty: '5', receivedQty: '4' }),
      line({ variantId: B, expectedQty: '5', receivedQty: '4', differenceReason: 'Faltó una' }),
      line({ variantId: '3', expectedQty: '5', receivedQty: '5' }),
      line({ variantId: '4', expectedQty: '', receivedQty: '9' }),
    ];
    expect(missingReasons(lines).map((item) => item.variantId)).toEqual([A]);
  });
});

describe('vista previa de costos', () => {
  const lines = [
    line({ variantId: A, sku: 'SKU-A', receivedQty: '10', unitPrice: '10' }),
    line({ variantId: B, sku: 'SKU-B', receivedQty: '5', unitPrice: '20' }),
  ];
  const parse = (value: Line[]) => {
    const parsed = toInput(value);
    if (!parsed.ok) throw new Error('líneas válidas');
    return parsed.items;
  };

  it('en bolivianos reparte con el mismo resultado que la API', () => {
    // Mismo caso que la prueba de integración de la API: 11,00 entre dos líneas de 100.
    const preview = previewEntry({
      currency: 'BOB',
      exchangeRate: null,
      lines,
      items: parse(lines),
      extrasCents: 1100n,
    });
    expect(preview.totals).toEqual({
      purchaseOriginal: '200.00',
      purchaseBob: '200.00',
      extras: '11.00',
      grand: '211.00',
    });
    expect(preview.zeroValue).toBe(false);
    expect(preview.rows.map((row) => row.unitTotalCost)).toEqual(['10.5500', '21.1000']);
    expect(preview.rows.map((row) => row.receivedQty)).toEqual([10, 5]);
    expect(preview.rows[0]).toMatchObject({ sku: 'SKU-A', extraAllocated: '5.50' });
  });

  it('en dólares convierte con el tipo de cambio y reparte sobre el valor en Bs', () => {
    const usdLines = [
      line({ variantId: A, sku: 'SKU-A', receivedQty: '10', unitPrice: '5' }),
      line({ variantId: B, sku: 'SKU-B', receivedQty: '4', unitPrice: '12.5' }),
    ];
    // Mismo caso que la prueba de integración de la API (tipo de cambio 6,96; extras 120,50).
    const preview = previewEntry({
      currency: 'USD',
      exchangeRate: '6.9600',
      lines: usdLines,
      items: parse(usdLines),
      extrasCents: 12050n,
    });
    expect(preview.totals).toEqual({
      purchaseOriginal: '100.00',
      purchaseBob: '696.00',
      extras: '120.50',
      grand: '816.50',
    });
    expect(preview.rows[0]).toMatchObject({
      unitPrice: '5.0000',
      unitCostBob: '34.8000',
      subtotalBob: '348.0000',
      extraAllocated: '60.25',
      totalCost: '408.2500',
      unitExtraCost: '6.0250',
      unitTotalCost: '40.8250',
    });
    expect(preview.rows[1]).toMatchObject({ unitCostBob: '87.0000', unitTotalCost: '102.0625' });
  });

  it('en dólares sin tipo de cambio válido no calcula y lo explica', () => {
    for (const exchangeRate of [null, '', '0', 'abc']) {
      const preview = previewEntry({
        currency: 'USD',
        exchangeRate,
        lines,
        items: parse(lines),
        extrasCents: 0n,
      });
      expect(preview.rows).toEqual([]);
      expect(preview.error).toMatch(/tipo de cambio/);
    }
  });

  it('avisa cuando no hay base de reparto (costos adicionales con valor cero) pero muestra la compra', () => {
    const zero = [line({ receivedQty: '3', unitPrice: '0' })];
    const preview = previewEntry({
      currency: 'BOB',
      exchangeRate: null,
      lines: zero,
      items: parse(zero),
      extrasCents: 500n,
    });
    expect(preview.zeroValue).toBe(true);
    expect(preview.rows[0]).toMatchObject({ extraAllocated: null, totalCost: null });
    expect(preview.totals.extras).toBe('5.00');
    expect(
      previewEntry({
        currency: 'BOB',
        exchangeRate: null,
        lines: zero,
        items: parse(zero),
        extrasCents: 0n,
      }).zeroValue,
    ).toBe(false);
  });

  it('suma solo los montos válidos de la lista de costos', () => {
    expect(sumCosts(['10', '5.5', '', 'abc', '0.25'])).toBe(1575n);
  });

  it('un ingreso cerrado muestra lo guardado en el servidor', () => {
    const entry = {
      totals: { purchaseOriginal: '1.00', purchaseBob: '7.00', extras: '1.00', grand: '8.00' },
      items: [
        {
          variantId: A,
          sku: 'SKU-A',
          productName: 'Anillo',
          variantLabel: null,
          receivedQty: 1,
          cost: {
            ...cost,
            extraAllocated: '1.00',
            totalCost: '8.0000',
            unitExtraCost: '1.0000',
            unitTotalCost: '8.0000',
          },
        },
      ],
    } as unknown as StockEntryDetail;
    const preview = storedPreview(entry);
    expect(preview.totals.grand).toBe('8.00');
    expect(preview.rows[0]).toMatchObject({ extraAllocated: '1.00', unitTotalCost: '8.0000' });
  });
});
