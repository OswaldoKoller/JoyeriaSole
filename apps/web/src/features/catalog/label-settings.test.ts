import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LABEL_SIZE,
  LABEL_SIZE_STORAGE_KEY,
  expandCopies,
  labelPrintCss,
  loadLabelSize,
  parseLabelSize,
  saveLabelSize,
  totalLabels,
} from './label-settings.ts';

afterEach(() => {
  window.localStorage.clear();
});

describe('tamaño de etiqueta', () => {
  it('por defecto mide 50 × 25 mm', () => {
    expect(loadLabelSize()).toEqual({ widthMm: 50, heightMm: 25 });
    expect(DEFAULT_LABEL_SIZE).toEqual({ widthMm: 50, heightMm: 25 });
  });

  it('valida el ancho y el alto en milímetros (acepta coma decimal)', () => {
    expect(parseLabelSize('60', '30')).toEqual({ widthMm: 60, heightMm: 30 });
    expect(parseLabelSize('40,5', '20.5')).toEqual({ widthMm: 40.5, heightMm: 20.5 });
    expect(parseLabelSize('5', '25')).toBeNull();
    expect(parseLabelSize('50', '500')).toBeNull();
    expect(parseLabelSize('abc', '25')).toBeNull();
    expect(parseLabelSize('', '')).toBeNull();
  });

  it('se guarda y se recupera por navegador', () => {
    saveLabelSize({ widthMm: 70, heightMm: 35 });
    expect(loadLabelSize()).toEqual({ widthMm: 70, heightMm: 35 });
  });

  it('ignora datos corruptos o fuera de rango', () => {
    window.localStorage.setItem(LABEL_SIZE_STORAGE_KEY, '{no es json');
    expect(loadLabelSize()).toEqual({ widthMm: 50, heightMm: 25 });
    window.localStorage.setItem(
      LABEL_SIZE_STORAGE_KEY,
      JSON.stringify({ widthMm: 1, heightMm: 1 }),
    );
    expect(loadLabelSize()).toEqual({ widthMm: 50, heightMm: 25 });
  });

  it('no falla si el almacenamiento está bloqueado', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(loadLabelSize()).toEqual({ widthMm: 50, heightMm: 25 });
    expect(() => {
      saveLabelSize({ widthMm: 60, heightMm: 30 });
    }).not.toThrow();
  });
});

describe('CSS de impresión', () => {
  it('define @page con el tamaño exacto y sin márgenes, una etiqueta por página', () => {
    const css = labelPrintCss({ widthMm: 50, heightMm: 25 });
    expect(css).toContain('@page { size: 50mm 25mm; margin: 0; }');
    expect(css).toContain('@media print');
    expect(css).toContain('body > #root { display: none !important; }');
    expect(css).toContain('break-after: page');
    expect(css).toContain('width: 50mm; height: 25mm');
  });

  it('usa el tamaño configurado', () => {
    expect(labelPrintCss({ widthMm: 40.5, heightMm: 20 })).toContain('size: 40.5mm 20mm');
  });
});

describe('copias', () => {
  it('expande una entrada por etiqueta en el orden de la selección', () => {
    const requests = [
      { sku: 'SKU-000001', copies: 2 },
      { sku: 'SKU-000002', copies: 1 },
    ];
    expect(expandCopies(requests)).toEqual(['SKU-000001', 'SKU-000001', 'SKU-000002']);
    expect(totalLabels(requests)).toBe(3);
  });

  it('ignora cantidades no válidas', () => {
    expect(expandCopies([{ sku: 'A', copies: 0 }])).toEqual([]);
    expect(totalLabels([{ sku: 'A', copies: -3 }])).toBe(0);
  });
});
