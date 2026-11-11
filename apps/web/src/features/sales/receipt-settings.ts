import { DEFAULT_RECEIPT_FORMAT, RECEIPT_FORMATS, type ReceiptFormat } from '@joyeria/shared';
import { z } from 'zod';

/**
 * Formato de impresión del comprobante interno (C3, R-23): 58 mm, 80 mm, A5 y A4; A4 por defecto y
 * la elección se recuerda en este navegador. Se imprime con el diálogo del navegador (sin
 * dependencias): el comprobante va en `#print-receipt`, fuera de `#root`, y `@media print` oculta
 * el resto de la aplicación.
 */

export const RECEIPT_FORMAT_STORAGE_KEY = 'joyeria.receiptFormat';

export const RECEIPT_FORMAT_LABELS: Record<ReceiptFormat, string> = {
  '58mm': 'Rollo de 58 mm',
  '80mm': 'Rollo de 80 mm',
  A5: 'Hoja A5',
  A4: 'Hoja A4',
};

/** Página (`@page`) y ancho útil del contenido de cada formato (plan 11 §5.6). */
const PAGE: Record<ReceiptFormat, { size: string; margin: string; contentWidth: string }> = {
  '58mm': { size: '58mm auto', margin: '0', contentWidth: '48mm' },
  '80mm': { size: '80mm auto', margin: '0', contentWidth: '72mm' },
  A5: { size: 'A5', margin: '10mm', contentWidth: '128mm' },
  A4: { size: 'A4', margin: '15mm', contentWidth: '180mm' },
};

/** Ancho útil del contenido (el mismo en la vista previa y en el papel). */
export function receiptContentWidth(format: ReceiptFormat): string {
  return PAGE[format].contentWidth;
}

/** ¿Es un rollo térmico angosto? (letra más chica y diseño en una columna). */
export function isRoll(format: ReceiptFormat): boolean {
  return format === '58mm' || format === '80mm';
}

const formatSchema = z.enum(RECEIPT_FORMATS);

/** Lee el formato recordado; cualquier fallo (bloqueo, dato inválido) usa A4. */
export function loadReceiptFormat(): ReceiptFormat {
  try {
    const parsed = formatSchema.safeParse(window.localStorage.getItem(RECEIPT_FORMAT_STORAGE_KEY));
    if (parsed.success) return parsed.data;
  } catch {
    // Modo privado o datos de sitio bloqueados: se usa el formato por defecto.
  }
  return DEFAULT_RECEIPT_FORMAT;
}

export function saveReceiptFormat(format: ReceiptFormat): void {
  try {
    window.localStorage.setItem(RECEIPT_FORMAT_STORAGE_KEY, format);
  } catch {
    // Sin almacenamiento: la elección vale solo para esta pantalla.
  }
}

/**
 * CSS de impresión del formato elegido. Solo valores de la tabla fija `PAGE` (nunca texto del
 * usuario). Negro sobre blanco, cifras tabulares y filas que no se parten entre páginas.
 */
export function receiptPrintCss(format: ReceiptFormat): string {
  const page = PAGE[format];
  return [
    `@page { size: ${page.size}; margin: ${page.margin}; }`,
    '#print-receipt { display: none; }',
    '@media print {',
    '  html, body { margin: 0; padding: 0; background: #fff; }',
    '  body > #root { display: none !important; }',
    '  #print-receipt { display: block !important; color: #000; background: #fff; }',
    `  #print-receipt .receipt { width: ${page.contentWidth}; box-sizing: border-box; margin: 0 auto; }`,
    '  #print-receipt .receipt * { color: #000 !important; background: transparent !important; }',
    '  #print-receipt thead { display: table-header-group; }',
    '  #print-receipt tr { break-inside: avoid; page-break-inside: avoid; }',
    '}',
  ].join('\n');
}
