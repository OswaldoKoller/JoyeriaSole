/**
 * Guarda estructural del libro de inventario (ADR-007): toda ESCRITURA en `inventory_movements` e
 * `inventory_balances` ocurre solo dentro de `src/modules/inventory/**` (vía `applyStockChanges`).
 * Lee el código fuente y falla si aparece una escritura en cualquier otro lugar. Las lecturas
 * (`findMany`, `count`, `SELECT`, `FOR UPDATE`) están permitidas. No usa plugins ESLint ni
 * desactiva reglas.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_DIR = path.resolve(import.meta.dirname, '../../src');
const ALLOWED_DIR = path.join(SRC_DIR, 'modules', 'inventory');
const GENERATED_DIR = path.join(SRC_DIR, 'generated');

const WRITE_OPS =
  'create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany';
const TABLES = 'inventory_(?:movements|balances)';
const QUALIFIED = String.raw`(?:"?public"?\s*\.\s*)?"?${TABLES}"?`;

/** [descripción, expresión regular] de cada forma de escritura prohibida fuera del módulo. */
const WRITE_PATTERNS: readonly [string, RegExp][] = [
  [
    'cliente Prisma: inventoryMovement/inventoryBalance con operación de escritura',
    new RegExp(String.raw`\binventory(?:Movement|Balance)\s*\.\s*(?:${WRITE_OPS})\b`),
  ],
  [
    'cliente Prisma por clave: ["inventoryMovement"] / ["inventoryBalance"]',
    /\[\s*['"`]inventory(?:Movement|Balance)['"`]\s*\]/,
  ],
  [
    'escritura anidada por relación (inventory / movements / inventoryMovements)',
    new RegExp(
      String.raw`\b(?:inventory|movements|inventoryMovements)\s*:\s*\{\s*(?:${WRITE_OPS}|connectOrCreate)\b`,
    ),
  ],
  ['SQL crudo: INSERT INTO', new RegExp(String.raw`\bINSERT\s+INTO\s+${QUALIFIED}`, 'i')],
  ['SQL crudo: UPDATE', new RegExp(String.raw`\bUPDATE\s+(?:ONLY\s+)?${QUALIFIED}`, 'i')],
  [
    'SQL crudo: DELETE FROM',
    new RegExp(String.raw`\bDELETE\s+FROM\s+(?:ONLY\s+)?${QUALIFIED}`, 'i'),
  ],
  ['SQL crudo: TRUNCATE', new RegExp(String.raw`\bTRUNCATE\s+(?:TABLE\s+)?${QUALIFIED}`, 'i')],
  ['SQL crudo: MERGE INTO', new RegExp(String.raw`\bMERGE\s+INTO\s+${QUALIFIED}`, 'i')],
];

/** Quita comentarios de bloque y de línea (los comentarios pueden describir lo prohibido). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Descripciones de las escrituras prohibidas encontradas en `source`. */
function findLedgerWrites(source: string): string[] {
  const code = stripComments(source);
  return WRITE_PATTERNS.filter(([, pattern]) => pattern.test(code)).map(
    ([description]) => description,
  );
}

function sourceFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

describe('guarda: escrituras al libro de inventario solo en modules/inventory', () => {
  it('ningún archivo de src fuera de modules/inventory ni de generated escribe en el libro', () => {
    const outside = sourceFiles().filter(
      (file) =>
        !file.startsWith(ALLOWED_DIR + path.sep) && !file.startsWith(GENERATED_DIR + path.sep),
    );
    // Sanidad: se está escaneando de verdad el resto del código (no una lista vacía).
    expect(outside.length).toBeGreaterThan(40);

    const offenders = outside.flatMap((file) =>
      findLedgerWrites(readFileSync(file, 'utf8')).map(
        (description) => `${path.relative(SRC_DIR, file).replaceAll('\\', '/')}: ${description}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('el módulo permitido sí contiene las escrituras (la guarda no es ciega)', () => {
    const ledger = readFileSync(path.join(ALLOWED_DIR, 'stock-ledger.ts'), 'utf8');
    expect(findLedgerWrites(ledger).length).toBeGreaterThan(0);
  });

  describe('el detector reconoce cada forma de escritura', () => {
    it.each([
      ['create de movimientos', 'await tx.inventoryMovement.create({ data })'],
      ['createMany de movimientos', 'tx.inventoryMovement.createMany({ data })'],
      ['update de saldos', 'tx.inventoryBalance.update({ where, data })'],
      ['upsert de saldos', 'this.prisma.inventoryBalance.upsert({})'],
      ['deleteMany de saldos', 'await tx.inventoryBalance.deleteMany({ where })'],
      ['acceso por clave', "tx['inventoryBalance'].update({})"],
      [
        'escritura anidada',
        'productVariant.create({ data: { inventory: { create: { quantity: 1 } } } })',
      ],
      ['INSERT de movimientos', 'tx.$executeRaw`INSERT INTO inventory_movements (id) VALUES (1)`'],
      [
        'INSERT de saldos',
        'tx.$executeRaw`  insert   into  inventory_balances (variant_id) VALUES (1)`',
      ],
      ['UPDATE de saldos', 'tx.$executeRaw`UPDATE inventory_balances SET quantity = 0`'],
      [
        'UPDATE con esquema',
        'tx.$executeRaw`UPDATE "public"."inventory_balances" SET quantity = 0`',
      ],
      ['DELETE de saldos', 'tx.$executeRaw`DELETE FROM inventory_balances WHERE true`'],
      ['TRUNCATE de movimientos', 'tx.$executeRaw`TRUNCATE TABLE inventory_movements`'],
    ])('detecta %s', (_name, code) => {
      expect(findLedgerWrites(code).length).toBeGreaterThan(0);
    });

    it.each([
      ['lectura con findMany', 'tx.inventoryMovement.findMany({ where })'],
      ['conteo de movimientos', 'tx.inventoryMovement.count({ where })'],
      ['lectura de saldos', 'tx.inventoryBalance.findUnique({ where })'],
      ['SELECT con bloqueo', 'tx.$queryRaw`SELECT quantity FROM inventory_balances FOR UPDATE`'],
      [
        'SELECT con JOIN',
        'FROM product_variants v LEFT JOIN inventory_balances b ON b.variant_id = v.id',
      ],
      ['bloqueo de saldos por JOIN', 'FOR UPDATE OF b'],
      ['relación leída con include', 'include: { inventory: true }'],
      ['filtro por relación', 'inventory: { is: { quantity: { gt: 0 } } }'],
      ['comentario de línea', '// tx.inventoryMovement.create no se usa aquí'],
      ['comentario de bloque', '/* INSERT INTO inventory_balances */ const x = 1;'],
    ])('no marca %s', (_name, code) => {
      expect(findLedgerWrites(code)).toEqual([]);
    });
  });
});
