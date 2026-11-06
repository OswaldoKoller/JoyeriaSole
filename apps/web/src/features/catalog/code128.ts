import JsBarcode from 'jsbarcode';

/**
 * Codificación Code 128 para las etiquetas (Q-10). Usa el mismo codificador que el resto del
 * catálogo (JsBarcode) pero en modo «objeto»: devuelve el patrón de barras y el dibujo SVG lo
 * hace React, sin manipular el DOM ni insertar HTML.
 */

/** Módulos de zona de silencio a cada lado (la norma pide al menos 10). */
export const CODE128_QUIET_MODULES = 10;

export type Code128 = {
  /** Patrón binario: '1' = barra, '0' = espacio. Incluye inicio, datos, control y parada. */
  pattern: string;
  /** Ancho de la simbología en módulos, sin zona de silencio. */
  modules: number;
  /** Ancho total en módulos, con zona de silencio a ambos lados. */
  totalModules: number;
};

type EncodedObject = { encodings?: { data: string }[] };

/** Lanza si el texto no se puede codificar (vacío o con caracteres fuera de ASCII). */
export function encodeCode128(text: string): Code128 {
  if (!text) throw new Error('El código está vacío');
  const target: EncodedObject = {};
  const state = { valid: true };
  JsBarcode(target, text, {
    format: 'CODE128',
    valid: (ok: boolean) => {
      state.valid = ok;
    },
  });
  const pattern = target.encodings?.map((part) => part.data).join('') ?? '';
  if (!state.valid || pattern.length === 0)
    throw new Error(`No se puede codificar «${text}» en Code 128`);
  return {
    pattern,
    modules: pattern.length,
    totalModules: pattern.length + 2 * CODE128_QUIET_MODULES,
  };
}

/** Barras como tramos contiguos [inicio, ancho] en módulos (las barras vecinas se unen). */
export function barRuns(pattern: string): { x: number; width: number }[] {
  const runs: { x: number; width: number }[] = [];
  let start = -1;
  for (let index = 0; index <= pattern.length; index += 1) {
    const filled = pattern[index] === '1';
    if (filled && start < 0) start = index;
    if (!filled && start >= 0) {
      runs.push({ x: start, width: index - start });
      start = -1;
    }
  }
  return runs;
}
