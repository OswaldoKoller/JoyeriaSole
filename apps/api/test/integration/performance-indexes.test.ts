/**
 * Índices de rendimiento (migración 20261106040000_performance_indexes). No agregan garantías de
 * negocio: esta prueba comprueba que existen, que pg_trgm está instalado, que PostgreSQL puede usar
 * los índices de trigramas para ILIKE '%q%' y que las búsquedas (`q` de 3+ caracteres) devuelven
 * exactamente los mismos resultados de siempre.
 */
import { PERMISSIONS } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';

const TRIGRAM_INDEXES = [
  'products_name_trgm_idx',
  'product_variants_sku_trgm_idx',
  'product_variants_barcode_trgm_idx',
  'product_variants_label_trgm_idx',
  'supplier_products_supplier_code_trgm_idx',
  'stock_entries_document_number_trgm_idx',
];

const EXPECTED_INDEXES = [
  ...TRIGRAM_INDEXES,
  'inventory_movements_created_at_id_idx',
  'inventory_movements_variant_id_id_idx',
  'audit_logs_created_at_id_idx',
  'price_changes_created_at_id_idx',
  'inventory_count_scans_count_variant_round_id_idx',
];

describe('índices de rendimiento', () => {
  let app: App;
  let cookie: string;

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
    const reader = await createTestUser(app.prisma, {
      permissions: [
        PERMISSIONS.CATALOG_READ,
        PERMISSIONS.INVENTORY_READ,
        PERMISSIONS.STOCK_ENTRIES_READ,
      ],
    });
    ({ cookie } = await login(app, reader.user.email, reader.password));
  });
  afterEach(() => app.close());

  it('pg_trgm está instalado y los índices existen con la definición prevista', async () => {
    const extension = await app.prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`;
    expect(extension).toHaveLength(1);

    const rows = await app.prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`;
    const byName = new Map(rows.map((row) => [row.indexname, row.indexdef]));
    for (const name of EXPECTED_INDEXES) expect(byName.has(name), name).toBe(true);

    for (const name of TRIGRAM_INDEXES) {
      expect(byName.get(name), name).toMatch(/USING gin \(.+ gin_trgm_ops\)/);
    }
    expect(byName.get('inventory_movements_created_at_id_idx')).toContain(
      '(created_at DESC, id DESC)',
    );
    expect(byName.get('inventory_movements_variant_id_id_idx')).toContain('(variant_id, id DESC)');
    expect(byName.get('audit_logs_created_at_id_idx')).toContain('(created_at DESC, id DESC)');
    expect(byName.get('price_changes_created_at_id_idx')).toContain('(created_at DESC, id DESC)');
    // El índice solo por fecha quedó cubierto por el compuesto y se eliminó.
    expect(byName.has('audit_logs_created_at_idx')).toBe(false);
    // Los índices previos se conservan (esta migración no elimina nada más).
    for (const kept of [
      'inventory_balances_quantity_idx',
      'products_name_idx',
      'supplier_products_supplier_code_idx',
      'inventory_movements_variant_id_created_at_idx',
      'inventory_count_scans_inventory_count_id_round_id_idx',
    ]) {
      expect(byName.has(kept), kept).toBe(true);
    }
  });

  it('un índice GIN con gin_trgm_ops sobre varchar resuelve ILIKE con comodines a ambos lados', async () => {
    // En tablas vacías el planificador elige otro camino aunque desactive el recorrido secuencial,
    // así que se reproduce el mismo tipo de columna e índice en una tabla temporal. La definición de
    // los índices reales (columna y clase de operadores) se verifica en la prueba anterior.
    const plan = await app.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('CREATE TEMP TABLE trgm_probe (c varchar(200)) ON COMMIT DROP');
      await tx.$executeRawUnsafe(
        'CREATE INDEX trgm_probe_idx ON trgm_probe USING GIN (c gin_trgm_ops)',
      );
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      const result = await tx.$queryRawUnsafe<Record<string, string>[]>(
        "EXPLAIN SELECT 1 FROM trgm_probe WHERE c ILIKE '%abc%'",
      );
      return result.map((row) => row['QUERY PLAN']).join(' | ');
    });
    expect(plan).toContain('Bitmap Index Scan on trgm_probe_idx');
  });

  describe('las búsquedas con q de 3+ caracteres devuelven los mismos resultados', () => {
    beforeEach(async () => {
      const category = await app.prisma.category.create({
        data: { name: 'Joyas', slug: 'joyas-idx' },
      });
      const supplier = await app.prisma.supplier.create({ data: { name: 'Proveedor Índices' } });
      const user = await app.prisma.user.findFirstOrThrow();
      const fixtures = [
        { name: 'Anillo Solitario Plata', sku: 'ANI-001', barcode: '7790001', code: 'PROV-ZX-77' },
        { name: 'Collar Perla Cultivada', sku: 'COL-002', barcode: '7790002', code: null },
        { name: 'Pulsera 100% Oro_18', sku: 'PUL-003', barcode: null, code: null },
        { name: 'Pulsera 100 Oro 18', sku: 'PUL-004', barcode: null, code: null },
      ];
      for (const fixture of fixtures) {
        const product = await app.prisma.product.create({
          data: { categoryId: category.id, name: fixture.name },
        });
        const variant = await app.prisma.productVariant.create({
          data: { productId: product.id, sku: fixture.sku, barcode: fixture.barcode },
        });
        if (fixture.code) {
          await app.prisma.supplierProduct.create({
            data: { supplierId: supplier.id, variantId: variant.id, supplierCode: fixture.code },
          });
        }
      }
      for (const documentNumber of ['FAC-00123', 'NR-77']) {
        await app.prisma.stockEntry.create({
          data: { supplierId: supplier.id, documentNumber, createdById: user.id },
        });
      }
    });

    async function get<T>(url: string) {
      const res = await app.inject({ method: 'GET', url, headers: { cookie } });
      expect(res.statusCode, res.body).toBe(200);
      return res.json<{ data: T[] }>().data;
    }

    async function productNames(q: string) {
      const rows = await get<{ name: string }>(
        `/api/v1/products?q=${encodeURIComponent(q)}&pageSize=50`,
      );
      return rows.map((row) => row.name).sort();
    }

    async function inventorySkus(q: string) {
      const rows = await get<{ sku: string }>(
        `/api/v1/inventory?q=${encodeURIComponent(q)}&pageSize=50`,
      );
      return rows.map((row) => row.sku).sort();
    }

    it('listado de productos: nombre, SKU, código de barras y código del proveedor', async () => {
      expect(await productNames('anillo')).toEqual(['Anillo Solitario Plata']);
      expect(await productNames('PERLA')).toEqual(['Collar Perla Cultivada']);
      expect(await productNames('col-002')).toEqual(['Collar Perla Cultivada']);
      expect(await productNames('779000')).toEqual([
        'Anillo Solitario Plata',
        'Collar Perla Cultivada',
      ]);
      expect(await productNames('7790002')).toEqual(['Collar Perla Cultivada']);
      expect(await productNames('prov-zx')).toEqual(['Anillo Solitario Plata']);
      expect(await productNames('pulsera')).toEqual(['Pulsera 100 Oro 18', 'Pulsera 100% Oro_18']);
      expect(await productNames('zzz')).toEqual([]);
    });

    it('inventario: nombre, SKU y código de barras; los comodines LIKE se tratan como texto', async () => {
      expect(await inventorySkus('anillo')).toEqual(['ANI-001']);
      expect(await inventorySkus('SOLITARIO')).toEqual(['ANI-001']);
      expect(await inventorySkus('pul-00')).toEqual(['PUL-003', 'PUL-004']);
      expect(await inventorySkus('779000')).toEqual(['ANI-001', 'COL-002']);
      expect(await inventorySkus('7790002')).toEqual(['COL-002']);
      expect(await inventorySkus('100%')).toEqual(['PUL-003']);
      expect(await inventorySkus('oro_1')).toEqual(['PUL-003']);
      expect(await inventorySkus('zzz')).toEqual([]);
    });

    it('ingresos: número de documento sin distinguir mayúsculas', async () => {
      const numbers = async (q: string) =>
        (
          await get<{ documentNumber: string | null }>(
            `/api/v1/stock-entries?q=${encodeURIComponent(q)}&pageSize=50`,
          )
        )
          .map((row) => row.documentNumber)
          .sort();
      expect(await numbers('fac-001')).toEqual(['FAC-00123']);
      expect(await numbers('NR-7')).toEqual(['NR-77']);
      expect(await numbers('-')).toEqual(['FAC-00123', 'NR-77']);
      expect(await numbers('xyz')).toEqual([]);
    });
  });
});
