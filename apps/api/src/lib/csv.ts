import { BUSINESS_TIME_ZONE } from '@joyeria/shared';

/**
 * Serializador CSV para las exportaciones (reportes mínimos, P-44).
 *
 * Formato (documentado en docs/api/API.md):
 * - UTF-8 con BOM, para que Excel en Windows reconozca los acentos.
 * - Separador «;»: es el separador de listas de Excel con configuración regional en español
 *   (Bolivia, España...). Con «,» Excel abriría todo en una sola columna.
 * - Fin de línea CRLF (RFC 4180). Comillas dobles escapadas duplicándolas; los saltos de línea dentro
 *   de una celda van entre comillas.
 * - Números con punto decimal y sin separador de miles (formato estándar, sin depender del idioma).
 *
 * Seguridad: un texto que Excel o LibreOffice interpretarían como fórmula (empieza por `=`, `+`, `-`,
 * `@`, tabulación o retorno de carro) se neutraliza con un apóstrofe inicial (OWASP, «CSV
 * injection»). Los NÚMEROS no pasan por esa regla porque no son texto: se declaran con `csvNumber`,
 * que solo acepta dígitos con signo y punto decimal; así `-3` sigue siendo un número y no se
 * convierte en «'-3».
 */

export const CSV_SEPARATOR = ';';
export const CSV_BOM = '\uFEFF';
const CSV_EOL = '\r\n';
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;
/** Inicio peligroso: el carácter de fórmula, o el de fórmula tras espacios. */
const FORMULA_START = /^([=+\-@\t\r\n]|\s+[=+\-@])/;

/** Número ya validado: se escribe tal cual, sin comillas ni neutralización. */
export class CsvNumber {
  readonly text: string;
  constructor(value: number | bigint | string) {
    const text = String(value);
    if (!NUMBER_PATTERN.test(text)) throw new TypeError('Valor numérico no válido para el CSV');
    this.text = text;
  }
}

export const csvNumber = (value: number | bigint | string) => new CsvNumber(value);

export type CsvCell = string | CsvNumber | null | undefined;

/** Neutraliza un texto que una hoja de cálculo ejecutaría como fórmula. */
export function neutralizeFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

/** Celda lista para escribir (con comillas solo cuando hacen falta). */
export function csvCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof CsvNumber) return cell.text;
  const safe = neutralizeFormula(cell);
  return /[;"\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Fila completa, con su fin de línea. */
export function csvRow(cells: readonly CsvCell[]): string {
  return cells.map(csvCell).join(CSV_SEPARATOR) + CSV_EOL;
}

const timestampFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** «AAAA-MM-DD HH:MM:SS» en hora de La Paz: Excel lo reconoce como fecha y hora. */
export function formatLaPazTimestamp(date: Date): string {
  const parts = Object.fromEntries(
    timestampFormat.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
