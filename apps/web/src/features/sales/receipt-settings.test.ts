import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RECEIPT_FORMAT_STORAGE_KEY,
  loadReceiptFormat,
  receiptPrintCss,
  saveReceiptFormat,
} from './receipt-settings.ts';

afterEach(() => {
  window.localStorage.clear();
});

describe('formato del comprobante', () => {
  it('A4 por defecto', () => {
    expect(loadReceiptFormat()).toBe('A4');
  });

  it('recuerda el formato elegido en este navegador', () => {
    saveReceiptFormat('80mm');
    expect(window.localStorage.getItem(RECEIPT_FORMAT_STORAGE_KEY)).toBe('80mm');
    expect(loadReceiptFormat()).toBe('80mm');
  });

  it('un valor inválido o un almacenamiento bloqueado vuelven a A4', () => {
    window.localStorage.setItem(RECEIPT_FORMAT_STORAGE_KEY, 'carta');
    expect(loadReceiptFormat()).toBe('A4');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(loadReceiptFormat()).toBe('A4');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(() => {
      saveReceiptFormat('A5');
    }).not.toThrow();
  });

  it.each([
    ['58mm', '@page { size: 58mm auto; margin: 0; }', 'width: 48mm'],
    ['80mm', '@page { size: 80mm auto; margin: 0; }', 'width: 72mm'],
    ['A5', '@page { size: A5; margin: 10mm; }', 'width: 128mm'],
    ['A4', '@page { size: A4; margin: 15mm; }', 'width: 180mm'],
  ] as const)('CSS de impresión de %s', (format, page, width) => {
    const css = receiptPrintCss(format);
    expect(css).toContain(page);
    expect(css).toContain(width);
    // Solo se imprime el comprobante: el resto de la aplicación se oculta.
    expect(css).toContain('body > #root { display: none !important; }');
    expect(css).toContain('#print-receipt { display: block !important;');
    expect(css).toContain('thead { display: table-header-group; }');
  });
});
