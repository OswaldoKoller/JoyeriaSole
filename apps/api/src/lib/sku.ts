/**
 * Candidatos para buscar un SKU por IGUALDAD exacta (usa el índice único; `ILIKE`/`insensitive`
 * obligaba a recorrer la tabla). Los SKU se generan en mayúsculas («SKU-000123»); el lector o el
 * teclado pueden entregar minúsculas, así que se prueba el código tal cual y normalizado.
 */
export function skuCandidates(code: string): string[] {
  const trimmed = code.trim();
  return [...new Set([trimmed, trimmed.toUpperCase()])];
}
