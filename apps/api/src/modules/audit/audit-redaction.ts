/**
 * Redacción de datos sensibles al LEER la auditoría. Aunque ningún módulo debería guardar
 * secretos en `before`/`after`/`metadata`, la pantalla de auditoría nunca los devuelve: cualquier
 * clave que parezca un secreto se reemplaza por «[oculto]», a cualquier profundidad.
 */
export const REDACTED = '[oculto]';

const SENSITIVE_KEY = /password|passwordHash|tokenHash|token|secret|cookie|authorization/i;
const MAX_DEPTH = 20;

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

/**
 * Devuelve una copia del JSON con los valores de las claves sensibles reemplazados. Los valores
 * `null` y booleanos se conservan: no pueden contener un secreto y permiten ver indicadores como
 * `mustChangePassword`. Más allá de MAX_DEPTH el contenido se oculta por completo.
 */
export function redactSensitive(value: JsonValue, depth = 0): JsonValue {
  if (depth > MAX_DEPTH) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, depth + 1));
  if (value !== null && typeof value === 'object') {
    const result: { [key: string]: JsonValue } = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] =
        isSensitiveKey(key) && child !== null && typeof child !== 'boolean'
          ? REDACTED
          : redactSensitive(child, depth + 1);
    }
    return result;
  }
  return value;
}
