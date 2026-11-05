import { z } from 'zod';

/**
 * Tamaño de la etiqueta propia (Q-10 A, B7): la impresora y el rollo aún no están definidos, por
 * eso el ancho y el alto en milímetros se configuran en pantalla y se recuerdan en este navegador.
 */
export const LABEL_SIZE_LIMITS = { minWidth: 20, maxWidth: 150, minHeight: 10, maxHeight: 100 };
export const DEFAULT_LABEL_SIZE = { widthMm: 50, heightMm: 25 } as const;
export const LABEL_SIZE_STORAGE_KEY = 'joyeria.labelSize';
/** Tope de etiquetas por impresión (cuida el rendimiento del navegador). */
export const MAX_LABELS_PER_PRINT = 1000;
export const MAX_COPIES_PER_VARIANT = 200;

export const labelSizeSchema = z.object({
  widthMm: z.number().min(LABEL_SIZE_LIMITS.minWidth).max(LABEL_SIZE_LIMITS.maxWidth),
  heightMm: z.number().min(LABEL_SIZE_LIMITS.minHeight).max(LABEL_SIZE_LIMITS.maxHeight),
});
export type LabelSize = z.infer<typeof labelSizeSchema>;

/** Valida un tamaño ingresado en los campos (texto con punto o coma decimal). */
export function parseLabelSize(width: string, height: string): LabelSize | null {
  const toNumber = (value: string) => Number(value.trim().replace(',', '.'));
  const parsed = labelSizeSchema.safeParse({
    widthMm: toNumber(width),
    heightMm: toNumber(height),
  });
  return parsed.success ? parsed.data : null;
}

/** Lee el tamaño guardado; cualquier fallo (almacenamiento bloqueado, dato corrupto) usa el defecto. */
export function loadLabelSize(): LabelSize {
  try {
    const raw = window.localStorage.getItem(LABEL_SIZE_STORAGE_KEY);
    if (raw) {
      const parsed = labelSizeSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    }
  } catch {
    // Modo privado, datos de sitio bloqueados o JSON inválido: se usa el tamaño por defecto.
  }
  return { ...DEFAULT_LABEL_SIZE };
}

export function saveLabelSize(size: LabelSize): void {
  try {
    window.localStorage.setItem(LABEL_SIZE_STORAGE_KEY, JSON.stringify(size));
  } catch {
    // Sin almacenamiento disponible: el tamaño solo vale para esta sesión.
  }
}

/** Un número seguro para insertar en CSS (ya validado por el esquema, sin notación científica). */
function mm(value: number) {
  return `${Number(value.toFixed(2))}mm`;
}

/**
 * CSS de impresión: una etiqueta por página con el tamaño exacto (`@page`), sin márgenes y sin el
 * resto de la aplicación. Funciona con cualquier impresora; «Guardar como PDF» queda a cargo del
 * navegador. El contenido a imprimir vive en `#print-labels`, fuera de `#root`.
 */
export function labelPrintCss(size: LabelSize): string {
  const width = mm(size.widthMm);
  const height = mm(size.heightMm);
  return [
    `@page { size: ${width} ${height}; margin: 0; }`,
    '#print-labels { display: none; }',
    '@media print {',
    '  html, body { margin: 0; padding: 0; background: #fff; }',
    '  body > #root { display: none !important; }',
    '  #print-labels { display: block !important; }',
    `  #print-labels .label-page { width: ${width}; height: ${height}; box-sizing: border-box; overflow: hidden; break-after: page; page-break-after: always; }`,
    '  #print-labels .label-page:last-child { break-after: auto; page-break-after: auto; }',
    '}',
  ].join('\n');
}

export type LabelRequest = { sku: string; copies: number };

/** Lista plana de SKU a imprimir: una entrada por etiqueta, en el orden de la selección. */
export function expandCopies(requests: LabelRequest[]): string[] {
  return requests.flatMap((request) =>
    Array.from({ length: Math.max(0, Math.floor(request.copies)) }, () => request.sku),
  );
}

export function totalLabels(requests: LabelRequest[]): number {
  return requests.reduce((sum, request) => sum + Math.max(0, Math.floor(request.copies)), 0);
}
