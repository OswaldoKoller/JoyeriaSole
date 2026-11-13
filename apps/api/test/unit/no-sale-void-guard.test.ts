/**
 * Guarda estática contra la anulación de ventas (DEC-V07, plan 11 §6.4).
 *
 * Una venta confirmada NUNCA se anula, se borra ni se modifica, ni por un mecanismo equivalente o
 * encubierto. Esta prueba recorre el código fuente (API, esquema y migraciones, paquete compartido y
 * web) y FALLA si aparece cualquiera de los símbolos de una anulación: movimiento, estado, permiso,
 * ruta, columnas o funciones de reversión, o textos de interfaz. Además comprueba en tiempo de
 * ejecución el catálogo de permisos, el enum de movimientos y que `sales` no tenga columna de estado.
 *
 * Si esta prueba falla, NO se ajusta el patrón: se retira el cambio que la rompe (requiere una
 * decisión expresa del responsable que reemplace DEC-V07).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { PERMISSIONS } from '@joyeria/shared';
import { describe, expect, it } from 'vitest';
import { MovementType, Prisma } from '../../src/generated/prisma/client.ts';

const REPO = path.resolve(import.meta.dirname, '../../../..');
const SELF = path.resolve(import.meta.filename);
const EXCLUDED_DIRS = new Set(['node_modules', 'generated', 'dist']);
const SOURCE_EXTENSIONS = /\.(ts|tsx|js|mjs|cjs|sql|prisma|json|css|html)$/;

/** Raíces recorridas (plan 11 §6.4). */
const ROOTS = [
  'apps/api/src',
  'apps/api/prisma/schema.prisma',
  'apps/api/prisma/migrations',
  'packages/shared/src',
  'apps/web/src',
].map((root) => path.join(REPO, root));

/** [qué detecta, patrón]. La palabra reservada `void` de TypeScript no coincide con ninguno. */
const FORBIDDEN: readonly [string, RegExp][] = [
  ['movimiento de anulación', /SALE_VOID/],
  ['estado anulado', /\bVOIDED\b/],
  ['permiso de reversión de ventas', /sales:(void|cancel|refund|reverse|edit)/],
  ['segmento de ruta o literal «void»', /['"`/]void['"`/]/],
  ['segmento de ruta /void', /\/void\b/],
  ['columna de anulación', /\bvoid(ed)?_(at|by|by_id|reason)\b/],
  ['campo de anulación', /\bvoid(ed)?(At|By|ById|Reason)\b/],
  ['función de reversión de ventas', /\b(void|cancel|refund|reverse|annul)Sale\b/i],
  ['texto de interfaz de anulación', /Anular venta|Anulación de venta|Devolver venta/],
];

function filesUnder(entry: string): string[] {
  const stats = statSync(entry);
  if (stats.isFile()) return SOURCE_EXTENSIONS.test(entry) ? [entry] : [];
  return readdirSync(entry, { withFileTypes: true }).flatMap((child) => {
    if (child.isDirectory() && EXCLUDED_DIRS.has(child.name)) return [];
    return filesUnder(path.join(entry, child.name));
  });
}

/** Coincidencias prohibidas en un texto: `línea: descripción`. */
function findForbidden(source: string): string[] {
  const hits: string[] = [];
  source.split('\n').forEach((line, index) => {
    for (const [description, pattern] of FORBIDDEN) {
      if (pattern.test(line)) hits.push(`${String(index + 1)}: ${description}`);
    }
  });
  return hits;
}

describe('guarda estática contra la anulación de ventas (DEC-V07)', () => {
  it('los patrones detectan cada forma prohibida y no la palabra reservada void', () => {
    const forbidden = [
      "type: 'SALE_VOID'",
      "status: 'VOIDED'",
      "'sales:void'",
      "'sales:refund'",
      "app.post('/:id/void', handler)",
      'voided_at TIMESTAMPTZ',
      'voidedBy: user.id',
      'async voidSale(id: string) {}',
      'function refundSale() {}',
      'export const cancelSale = 1;',
      '<button>Anular venta</button>',
      'Devolver venta',
    ];
    for (const line of forbidden) expect(findForbidden(line), line).not.toEqual([]);

    const allowed = [
      'async function close(): Promise<void> {}',
      'const run = (): void => undefined;',
      'void promise.catch(() => undefined);',
      'export type Handler = () => void;',
      "const reason = 'Cancelar el formulario';",
    ];
    for (const line of allowed) expect(findForbidden(line), line).toEqual([]);
  });

  it('ningún archivo fuente contiene símbolos de anulación de ventas', () => {
    const files = ROOTS.flatMap(filesUnder).filter((file) => path.resolve(file) !== SELF);
    expect(files.length).toBeGreaterThan(50);
    const violations = files.flatMap((file) =>
      findForbidden(readFileSync(file, 'utf8')).map((hit) => `${path.relative(REPO, file)}:${hit}`),
    );
    expect(violations).toEqual([]);
  });

  it('el catálogo de permisos no tiene ningún permiso de reversión de ventas', () => {
    const reversal = /^(sales|cash|sales-incidents):(void|cancel|refund|reverse|edit|reopen)/;
    expect(Object.values(PERMISSIONS).filter((code) => reversal.test(code))).toEqual([]);
    expect(Object.values(PERMISSIONS)).not.toContain('cash:movement');
    expect(Object.values(PERMISSIONS)).not.toContain('cash:resolve-difference');
  });

  it('el enum de movimientos es exactamente el conjunto revisado (un valor nuevo obliga a revisar)', () => {
    expect(Object.values(MovementType).sort()).toEqual(
      [
        'ADJUSTMENT',
        'COUNT_ADJUSTMENT',
        'CUSTOMER_RETURN',
        'EXCHANGE',
        'EXCHANGE_IN',
        'EXCHANGE_OUT',
        'INITIAL_STOCK',
        'LOSS',
        'SALE',
        'STOCK_ENTRY',
      ].sort(),
    );
  });

  it('una venta no tiene columna de estado ni campos de anulación', () => {
    const columns = Object.values(Prisma.SaleScalarFieldEnum);
    expect(columns).not.toContain('status');
    expect(columns.filter((column) => /void|cancel|refund|revers/i.test(column))).toEqual([]);
    expect([...columns].sort()).toEqual(
      [
        'cashSessionId',
        'clientRequestId',
        'id',
        'number',
        'requestHash',
        'sellerId',
        'sellerName',
        'soldAt',
        'total',
      ].sort(),
    );
  });
});
