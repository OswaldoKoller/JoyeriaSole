/**
 * S2 · Catálogo completo: atributos (uso sugerido, valores, definiciones nuevas), asignación de
 * atributos a categorías, características descriptivas, ejes en la creación, códigos (Q-10),
 * búsqueda unificada, ficha incompleta / sin precio (C1, D9) y eliminación física (B11).
 */
import { PERMISSIONS, type Permission } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';

const MANAGER: Permission[] = [
  PERMISSIONS.CATALOG_READ,
  PERMISSIONS.CATALOG_MANAGE,
  PERMISSIONS.PRICES_MANAGE,
];
const READER: Permission[] = [PERMISSIONS.CATALOG_READ];
const ADMIN_LIKE: Permission[] = [...MANAGER, PERMISSIONS.CATALOG_DELETE];

describe('catálogo completo (S2)', () => {
  let app: App;
  let manager: { cookie: string; userId: string };

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
    manager = await session(MANAGER);
  });
  afterEach(() => app.close());

  async function session(permissions: Permission[]) {
    const { user, password } = await createTestUser(app.prisma, { permissions });
    const { cookie } = await login(app, user.email, password);
    return { cookie, userId: user.id };
  }

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: object,
    cookie: string | undefined = manager.cookie,
  ) =>
    app.inject({
      method,
      url,
      ...(cookie && { headers: { cookie } }),
      ...(payload !== undefined && { payload }),
    });

  let counter = 0;
  async function category(name?: string, parentId?: string) {
    counter += 1;
    const res = await call('POST', '/api/v1/categories', {
      name: name ?? `Categoría ${counter}`,
      ...(parentId && { parentId }),
    });
    expect(res.statusCode).toBe(201);
    return res.json().data as { id: string };
  }

  async function listAttribute(
    code: string,
    values: string[] = [],
    extra: { dataType?: 'OPTION' | 'TEXT' | 'NUMBER' | 'BOOLEAN'; isSystem?: boolean } = {},
  ) {
    const attribute = await app.prisma.attribute.create({
      data: {
        code,
        name: code,
        dataType: extra.dataType ?? 'OPTION',
        isSystem: extra.isSystem ?? false,
      },
    });
    const options: string[] = [];
    for (const value of values) {
      const res = await call('POST', `/api/v1/attributes/${attribute.id}/options`, { value });
      expect(res.statusCode).toBe(201);
      options.push(res.json().data.id as string);
    }
    return { id: attribute.id, options };
  }

  async function product(payload: Record<string, unknown> = {}) {
    const cat = await category();
    const res = await call('POST', '/api/v1/products', {
      categoryId: cat.id,
      name: 'Anillo corazón',
      ...payload,
    });
    expect(res.statusCode).toBe(201);
    return res.json().data as {
      id: string;
      variants: { id: string; sku: string; barcode: string | null }[];
      isIncomplete: boolean;
      hasMissingPrice: boolean;
    };
  }

  describe('atributos', () => {
    it('protege las rutas y valida los datos (401/403/400)', async () => {
      const body = { name: 'Largo', dataType: 'TEXT' };
      expect((await call('POST', '/api/v1/attributes', body, '')).statusCode).toBe(401);
      const reader = await session(READER);
      expect((await call('POST', '/api/v1/attributes', body, reader.cookie)).statusCode).toBe(403);
      expect((await call('POST', '/api/v1/attributes', { name: '' })).statusCode).toBe(400);
      expect(
        (await call('POST', '/api/v1/attributes', { name: 'X', dataType: 'FECHA' })).statusCode,
      ).toBe(400);
      const attribute = await listAttribute('uso');
      expect(
        (
          await call(
            'PATCH',
            `/api/v1/attributes/${attribute.id}`,
            { suggestedUse: 'VARIANT_AXIS' },
            reader.cookie,
          )
        ).statusCode,
      ).toBe(403);
      expect((await call('PATCH', `/api/v1/attributes/${attribute.id}`, {})).statusCode).toBe(400);
    });

    it('crea una definición nueva con código derivado, uso sugerido y auditoría', async () => {
      const res = await call('POST', '/api/v1/attributes', {
        name: 'Material de cierre',
        dataType: 'OPTION',
        suggestedUse: 'VARIANT_AXIS',
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data).toMatchObject({
        code: 'material_de_cierre',
        suggestedUse: 'VARIANT_AXIS',
        isSystem: false,
        options: [],
      });
      const audit = await app.prisma.auditLog.findFirst({
        where: { action: 'attribute.created', entityId: res.json().data.id },
      });
      expect(audit).not.toBeNull();

      const duplicate = await call('POST', '/api/v1/attributes', {
        name: 'MATERIAL DE CIERRE',
        dataType: 'TEXT',
      });
      expect(duplicate.statusCode).toBe(409);

      // Solo una lista puede ser eje de variante: un texto queda como descriptivo.
      const text = await call('POST', '/api/v1/attributes', {
        name: 'Nota',
        dataType: 'TEXT',
        suggestedUse: 'VARIANT_AXIS',
      });
      expect(text.json().data.suggestedUse).toBe('DESCRIPTIVE');
    });

    it('permite cambiar el uso sugerido; las definiciones del sistema no se desactivan', async () => {
      const system = await listAttribute('material', ['Plata 925'], { isSystem: true });
      const changed = await call('PATCH', `/api/v1/attributes/${system.id}`, {
        suggestedUse: 'VARIANT_AXIS',
        name: 'Material principal',
      });
      expect(changed.statusCode).toBe(200);
      expect(changed.json().data).toMatchObject({
        suggestedUse: 'VARIANT_AXIS',
        name: 'Material principal',
      });

      const blocked = await call('PATCH', `/api/v1/attributes/${system.id}`, { isActive: false });
      expect(blocked.statusCode).toBe(422);

      const text = await listAttribute('nota', [], { dataType: 'TEXT' });
      const notAxis = await call('PATCH', `/api/v1/attributes/${text.id}`, {
        suggestedUse: 'VARIANT_AXIS',
      });
      expect(notAxis.statusCode).toBe(422);
    });

    it('no desactiva un atributo en uso; sí uno libre, que deja de listarse', async () => {
      const used = await listAttribute('piedra', ['Circonia']);
      await product({ attributes: [{ attributeId: used.id, optionId: used.options[0] }] });
      const blocked = await call('PATCH', `/api/v1/attributes/${used.id}`, { isActive: false });
      expect(blocked.statusCode).toBe(422);

      const free = await listAttribute('libre');
      const ok = await call('PATCH', `/api/v1/attributes/${free.id}`, { isActive: false });
      expect(ok.statusCode).toBe(200);
      const active = await call('GET', '/api/v1/attributes');
      expect((active.json().data as { code: string }[]).map((a) => a.code)).not.toContain('libre');
      const all = await call('GET', '/api/v1/attributes?includeInactive=true');
      expect((all.json().data as { code: string }[]).map((a) => a.code)).toContain('libre');
    });

    it('edita y desactiva valores de lista; renombrar actualiza la etiqueta de las variantes', async () => {
      const material = await listAttribute('material', ['Plata 925']);
      const created = await call('POST', '/api/v1/products', {
        categoryId: (await category()).id,
        name: 'Cadena',
        axes: [{ attributeId: material.id, optionId: material.options[0] }],
      });
      expect(created.json().data.variants[0].label).toBe('Plata 925');

      const url = `/api/v1/attributes/${material.id}/options/${material.options[0]}`;
      const renamed = await call('PATCH', url, { value: 'Plata 950', code: 'P950' });
      expect(renamed.statusCode).toBe(200);
      expect(renamed.json().data).toMatchObject({ value: 'Plata 950', code: 'P950' });
      const variant = await app.prisma.productVariant.findFirstOrThrow();
      expect(variant.label).toBe('Plata 950');

      const other = await listAttribute('color', ['Rojo']);
      expect(
        (
          await call('PATCH', `/api/v1/attributes/${material.id}/options/${other.options[0]}`, {
            value: 'X',
          })
        ).statusCode,
      ).toBe(404);

      const second = await call('POST', `/api/v1/attributes/${material.id}/options`, {
        value: 'Oro',
      });
      const clash = await call(
        'PATCH',
        `/api/v1/attributes/${material.id}/options/${second.json().data.id}`,
        { value: 'plata 950' },
      );
      expect(clash.statusCode).toBe(409);

      const off = await call('PATCH', url, { isActive: false });
      expect(off.json().data.isActive).toBe(false);
      const audit = await app.prisma.auditLog.findFirst({
        where: { action: 'attribute_option.deactivated' },
      });
      expect(audit).not.toBeNull();
      expect((await call('PATCH', url, {}, manager.cookie)).statusCode).toBe(400);
    });
  });

  describe('categorías de dos niveles (P-04, B1)', () => {
    it('crea, edita y desactiva; no hay tercer nivel; el rol gestor no necesita ser administrador', async () => {
      const root = await category('Anillos');
      const child = await category('Solitarios', root.id);
      const third = await call('POST', '/api/v1/categories', {
        name: 'Con circona',
        parentId: child.id,
      });
      expect(third.statusCode).toBe(422);

      const renamed = await call('PATCH', `/api/v1/categories/${child.id}`, { name: 'Solitario' });
      expect(renamed.statusCode).toBe(200);

      // No se desactiva una categoría con subcategorías activas.
      const blocked = await call('PATCH', `/api/v1/categories/${root.id}`, { isActive: false });
      expect(blocked.statusCode).toBe(422);
      expect(
        (await call('PATCH', `/api/v1/categories/${child.id}`, { isActive: false })).statusCode,
      ).toBe(200);
      const ok = await call('PATCH', `/api/v1/categories/${root.id}`, { isActive: false });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().data.isActive).toBe(false);

      // Reactivar la hija exige la principal activa.
      const reactivate = await call('PATCH', `/api/v1/categories/${child.id}`, { isActive: true });
      expect(reactivate.statusCode).toBe(422);

      // Una categoría inactiva no admite productos nuevos.
      const product404 = await call('POST', '/api/v1/products', {
        categoryId: root.id,
        name: 'Anillo',
      });
      expect(product404.statusCode).toBe(404);
      const audit = await app.prisma.auditLog.findFirst({
        where: { action: 'category.deactivated' },
      });
      expect(audit).not.toBeNull();
    });

    it('asigna atributos a la categoría (obligatorio / eje sugerido) con auditoría', async () => {
      const cat = await category('Anillos');
      const talla = await listAttribute('talla', ['16']);
      const nota = await listAttribute('nota', [], { dataType: 'TEXT' });
      const url = `/api/v1/categories/${cat.id}/attributes`;

      const reader = await session(READER);
      expect((await call('PUT', url, { attributes: [] }, '')).statusCode).toBe(401);
      expect((await call('PUT', url, { attributes: [] }, reader.cookie)).statusCode).toBe(403);
      expect(
        (
          await call('PUT', url, {
            attributes: [{ attributeId: talla.id }, { attributeId: talla.id }],
          })
        ).statusCode,
      ).toBe(400);
      // Un texto no puede ser eje sugerido.
      expect(
        (
          await call('PUT', url, {
            attributes: [{ attributeId: nota.id, isVariantAxisDefault: true }],
          })
        ).statusCode,
      ).toBe(422);

      const res = await call('PUT', url, {
        attributes: [
          { attributeId: talla.id, isVariantAxisDefault: true, isRequired: true },
          { attributeId: nota.id },
        ],
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.attributes).toEqual([
        { attributeId: talla.id, isRequired: true, isVariantAxisDefault: true, sortOrder: 0 },
        { attributeId: nota.id, isRequired: false, isVariantAxisDefault: false, sortOrder: 1 },
      ]);
      const list = await call('GET', '/api/v1/categories');
      const listed = (list.json().data as { id: string; attributes: unknown[] }[]).find(
        (item) => item.id === cat.id,
      );
      expect(listed?.attributes).toHaveLength(2);
      expect(
        await app.prisma.auditLog.count({ where: { action: 'category.attributes_set' } }),
      ).toBe(1);

      // Reemplazo completo.
      const cleared = await call('PUT', url, { attributes: [] });
      expect(cleared.json().data.attributes).toEqual([]);
    });
  });

  describe('producto con características, ejes y variantes', () => {
    it('crea la ficha con características descriptivas y ejes de variante en un solo paso', async () => {
      const material = await listAttribute('material', ['Plata 925', 'Oro 18K']);
      const talla = await listAttribute('talla', ['16', '18']);
      const piedra = await listAttribute('piedra', ['Circonia']);
      const dimensiones = await listAttribute('dimensiones', [], { dataType: 'TEXT' });
      const peso = await listAttribute('peso', [], { dataType: 'NUMBER' });
      const cierre = await listAttribute('cierre', [], { dataType: 'BOOLEAN' });

      const res = await call('POST', '/api/v1/products', {
        categoryId: (await category()).id,
        name: 'Anillo corazón con circonia',
        minStock: 2,
        axes: [
          { attributeId: material.id, optionId: material.options[0] },
          { attributeId: talla.id, optionId: talla.options[0] },
        ],
        attributes: [
          { attributeId: piedra.id, optionId: piedra.options[0] },
          { attributeId: dimensiones.id, valueText: '2 x 3 cm' },
          { attributeId: peso.id, valueNumber: '4.5' },
          { attributeId: cierre.id, valueBoolean: true },
        ],
      });
      expect(res.statusCode).toBe(201);
      const data = res.json().data;
      expect(data.variants).toHaveLength(1);
      expect(data.variants[0]).toMatchObject({ label: 'Plata 925 / 16', minStock: 2 });
      expect(data.variants[0].sku).toMatch(/^SKU-\d{6}$/);
      expect(data.axes.map((axis: { name: string }) => axis.name)).toEqual(['material', 'talla']);
      expect(data.isIncomplete).toBe(false);
      expect(
        (data.attributes as { name: string; displayValue: string }[])
          .map((a) => a.displayValue)
          .sort(),
      ).toEqual(['2 x 3 cm', '4.5', 'Circonia', 'Sí']);

      // Combinación nueva: SKU correlativo propio; combinación repetida: 409.
      const added = await call('POST', `/api/v1/products/${data.id}/variants`, {
        values: [
          { attributeId: material.id, optionId: material.options[1] },
          { attributeId: talla.id, optionId: talla.options[1] },
        ],
      });
      expect(added.statusCode).toBe(201);
      expect(added.json().data.variants).toHaveLength(2);
      const repeated = await call('POST', `/api/v1/products/${data.id}/variants`, {
        values: [
          { attributeId: material.id, optionId: material.options[0] },
          { attributeId: talla.id, optionId: talla.options[0] },
        ],
      });
      expect(repeated.statusCode).toBe(409);
    });

    it('rechaza valores que no corresponden al tipo del atributo y ejes repetidos como característica', async () => {
      const piedra = await listAttribute('piedra', ['Circonia']);
      const dimensiones = await listAttribute('dimensiones', [], { dataType: 'TEXT' });
      const cat = await category();
      const base = { categoryId: cat.id, name: 'Anillo' };

      for (const attributes of [
        [{ attributeId: dimensiones.id, optionId: piedra.options[0] }],
        [{ attributeId: piedra.id, valueText: 'Circonia' }],
        [{ attributeId: dimensiones.id }],
        [{ attributeId: piedra.id, optionId: piedra.options[0], valueText: 'x' }],
      ]) {
        const res = await call('POST', '/api/v1/products', { ...base, attributes });
        expect(res.statusCode).toBe(400);
      }
      expect(await app.prisma.product.count()).toBe(0);

      const repeated = await call('POST', '/api/v1/products', {
        ...base,
        axes: [{ attributeId: piedra.id, optionId: piedra.options[0] }],
        attributes: [{ attributeId: piedra.id, optionId: piedra.options[0] }],
      });
      expect(repeated.statusCode).toBe(400);
      expect(await app.prisma.product.count()).toBe(0);
    });

    it('edita las características en la ficha (reemplaza el conjunto) con auditoría', async () => {
      const piedra = await listAttribute('piedra', ['Circonia', 'Perla']);
      const created = await product({
        attributes: [{ attributeId: piedra.id, optionId: piedra.options[0] }],
      });
      const res = await call('PATCH', `/api/v1/products/${created.id}`, {
        attributes: [{ attributeId: piedra.id, optionId: piedra.options[1] }],
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.attributes).toHaveLength(1);
      expect(res.json().data.attributes[0].displayValue).toBe('Perla');
      const cleared = await call('PATCH', `/api/v1/products/${created.id}`, { attributes: [] });
      expect(cleared.json().data.attributes).toEqual([]);
      expect(await app.prisma.auditLog.count({ where: { action: 'product.updated' } })).toBe(2);
    });

    it('el stock mínimo por variante (B10) vale 0 por defecto y lo modifica quien gestiona el catálogo', async () => {
      const created = await product();
      const variantId = created.variants[0]?.id as string;
      const detail = await call('GET', `/api/v1/products/${created.id}`);
      expect(detail.json().data.variants[0].minStock).toBe(0);

      const reader = await session(READER);
      const url = `/api/v1/products/variants/${variantId}`;
      expect((await call('PATCH', url, { minStock: 3 }, '')).statusCode).toBe(401);
      expect((await call('PATCH', url, { minStock: 3 }, reader.cookie)).statusCode).toBe(403);
      expect((await call('PATCH', url, { minStock: -1 })).statusCode).toBe(400);
      const ok = await call('PATCH', url, { minStock: 3 });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().data.variants[0].minStock).toBe(3);
      const audit = await app.prisma.auditLog.findFirst({
        where: { action: 'variant.min_stock_changed', entityId: variantId },
      });
      expect(audit?.before).toEqual({ minStock: 0 });
      expect(audit?.after).toEqual({ minStock: 3 });
    });
  });

  describe('códigos del proveedor (Q-10) y búsqueda unificada', () => {
    it('conserva el código del proveedor en SupplierProduct y avisa si está repetido', async () => {
      const supplier = await app.prisma.supplier.create({ data: { name: 'China Import' } });
      const first = await product({ barcode: 'CN-100', supplierId: supplier.id });
      expect(first.variants[0]?.barcode).toBe('CN-100');
      const link = await app.prisma.supplierProduct.findFirstOrThrow({
        where: { variantId: first.variants[0]?.id },
      });
      expect(link.supplierCode).toBe('CN-100');

      // Otra pieza del mismo proveedor con el mismo código: no se guarda como barcode y se
      // avisa; el proveedor ya usa ese código, no se pisa.
      const second = await call('POST', '/api/v1/products', {
        categoryId: (await category()).id,
        name: 'Otro anillo',
        barcode: 'CN-100',
        supplierId: supplier.id,
      });
      expect(second.statusCode).toBe(201);
      expect(second.json().data.variants[0].barcode).toBeNull();
      expect(second.json().meta.warnings).toHaveLength(2);
      expect(await app.prisma.supplierProduct.count()).toBe(1);
    });

    it('asignar un código repetido: 409 sin proveedor; con proveedor lo conserva y avisa', async () => {
      await product({ barcode: 'DUP-1' });
      const target = await product();
      const url = `/api/v1/products/variants/${target.variants[0]?.id}/barcode`;

      const conflict = await call('PATCH', url, { barcode: 'DUP-1' });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json().error.message).toContain('se identifica por su SKU');

      const supplier = await app.prisma.supplier.create({ data: { name: 'Proveedor' } });
      const kept = await call('PATCH', url, { barcode: 'DUP-1', supplierId: supplier.id });
      expect(kept.statusCode).toBe(200);
      expect(kept.json().data.variants[0].barcode).toBeNull();
      expect(kept.json().meta.warnings[0]).toContain('ya pertenece');
      expect(
        await app.prisma.supplierProduct.count({
          where: { variantId: target.variants[0]?.id, supplierCode: 'DUP-1' },
        }),
      ).toBe(1);

      const fine = await call('PATCH', url, { barcode: 'NUEVO-1' });
      expect(fine.statusCode).toBe(200);
      expect(fine.json().data.variants[0].barcode).toBe('NUEVO-1');
      expect(fine.json().meta.warnings).toEqual([]);
    });

    it('una variante nueva con código repetido se crea sin él y avisa', async () => {
      const material = await listAttribute('material', ['Plata', 'Oro']);
      const created = await product({
        barcode: 'EXIST-1',
        axes: [{ attributeId: material.id, optionId: material.options[0] }],
      });
      const added = await call('POST', `/api/v1/products/${created.id}/variants`, {
        values: [{ attributeId: material.id, optionId: material.options[1] }],
        barcode: 'EXIST-1',
      });
      expect(added.statusCode).toBe(201);
      const variants = added.json().data.variants as { barcode: string | null }[];
      expect(variants.filter((v) => v.barcode === 'EXIST-1')).toHaveLength(1);
      expect(added.json().meta.warnings).toHaveLength(1);
    });

    it('GET /catalog/variants/lookup encuentra por SKU, código de barras y código del proveedor', async () => {
      const supplier = await app.prisma.supplier.create({ data: { name: 'Prov' } });
      const withBarcode = await product({ barcode: 'BAR-777' });
      const bySupplier = await product();
      await app.prisma.supplierProduct.create({
        data: {
          supplierId: supplier.id,
          variantId: bySupplier.variants[0]?.id as string,
          supplierCode: 'PROV-ABC',
        },
      });
      const lookup = (code: string, cookie?: string) =>
        call(
          'GET',
          `/api/v1/catalog/variants/lookup?code=${encodeURIComponent(code)}`,
          undefined,
          cookie,
        );

      const bySku = await lookup(withBarcode.variants[0]?.sku as string);
      expect(bySku.statusCode).toBe(200);
      expect(bySku.json().data).toMatchObject({ matchedBy: 'SKU', barcode: 'BAR-777' });
      // El SKU se acepta en minúsculas (tecleado a mano).
      expect(
        (await lookup((withBarcode.variants[0]?.sku as string).toLowerCase())).statusCode,
      ).toBe(200);

      const byBarcode = await lookup('BAR-777');
      expect(byBarcode.json().data).toMatchObject({
        matchedBy: 'BARCODE',
        variantId: withBarcode.variants[0]?.id,
      });

      const bySupplierCode = await lookup('PROV-ABC');
      expect(bySupplierCode.json().data).toMatchObject({
        matchedBy: 'SUPPLIER_CODE',
        variantId: bySupplier.variants[0]?.id,
      });

      expect((await lookup('NO-EXISTE')).statusCode).toBe(404);
      expect((await lookup('PROV-ABC', '')).statusCode).toBe(401);
      expect((await call('GET', '/api/v1/catalog/variants/lookup')).statusCode).toBe(400);
      const nobody = await session([]);
      expect((await lookup('PROV-ABC', nobody.cookie)).statusCode).toBe(403);

      // El mismo código de un proveedor en dos piezas distintas pide usar el SKU.
      const other = await app.prisma.supplier.create({ data: { name: 'Otro proveedor' } });
      await app.prisma.supplierProduct.create({
        data: {
          supplierId: other.id,
          variantId: withBarcode.variants[0]?.id as string,
          supplierCode: 'PROV-ABC',
        },
      });
      expect((await lookup('PROV-ABC')).statusCode).toBe(409);
    });

    it('el lookup no expone costos ni stock a quien solo lee catálogo, y el listado busca por código del proveedor', async () => {
      const supplier = await app.prisma.supplier.create({ data: { name: 'Prov' } });
      const created = await product();
      const variantId = created.variants[0]?.id as string;
      await app.prisma.productVariant.update({
        where: { id: variantId },
        data: { costPrice: '12.3456' },
      });
      await app.prisma.inventoryBalance.create({ data: { variantId, quantity: 4 } });
      await app.prisma.supplierProduct.create({
        data: { supplierId: supplier.id, variantId, supplierCode: 'ZETA-9' },
      });

      const seller = await session([PERMISSIONS.CATALOG_READ, PERMISSIONS.INVENTORY_READ]);
      const readerOnly = await session(READER);
      const withStock = await call(
        'GET',
        '/api/v1/catalog/variants/lookup?code=ZETA-9',
        undefined,
        seller.cookie,
      );
      expect(withStock.json().data.stockQuantity).toBe(4);
      expect(withStock.body).not.toMatch(/cost/i);
      const without = await call(
        'GET',
        '/api/v1/catalog/variants/lookup?code=ZETA-9',
        undefined,
        readerOnly.cookie,
      );
      expect(without.body).not.toMatch(/stockQuantity|cost/i);

      const list = await call('GET', '/api/v1/products?q=zeta', undefined, readerOnly.cookie);
      expect(list.json().meta.total).toBe(1);
      expect(list.body).not.toMatch(/cost/i);
    });
  });

  describe('ficha incompleta (C1) y sin precio (D9)', () => {
    it('marca la ficha incompleta si no tiene descripción ni características', async () => {
      const piedra = await listAttribute('piedra', ['Circonia']);
      const bare = await product();
      expect(bare.isIncomplete).toBe(true);
      expect(bare.hasMissingPrice).toBe(true);

      const withDescription = await product({ description: 'Anillo de plata' });
      expect(withDescription.isIncomplete).toBe(false);
      const withAttribute = await product({
        attributes: [{ attributeId: piedra.id, optionId: piedra.options[0] }],
      });
      expect(withAttribute.isIncomplete).toBe(false);

      // Al completar la ficha deja de estar incompleta.
      const patched = await call('PATCH', `/api/v1/products/${bare.id}`, { description: 'Listo' });
      expect(patched.json().data.isIncomplete).toBe(false);
      // Una descripción solo con espacios no cuenta.
      const spaces = await product({ description: '   ' });
      expect(spaces.isIncomplete).toBe(true);
    });

    it('«sin precio» solo cuenta variantes activas con precio 0', async () => {
      const priced = await product({ salePrice: '120' });
      expect(priced.hasMissingPrice).toBe(false);
      const free = await product({ salePrice: '0' });
      expect(free.hasMissingPrice).toBe(true);
      const off = await call('PATCH', `/api/v1/products/variants/${free.variants[0]?.id}/status`, {
        status: 'INACTIVE',
      });
      expect(off.json().data.hasMissingPrice).toBe(false);
    });

    it('filtra el listado y expone los contadores sin costos; ignora productos inactivos', async () => {
      const piedra = await listAttribute('piedra', ['Circonia']);
      await product({ name: 'Completo', description: 'ok', salePrice: '10' });
      await product({ name: 'Sin ficha', salePrice: '10' });
      await product({ name: 'Sin precio', description: 'ok' });
      await product({ name: 'Ambos' });
      await product({
        name: 'Con atributo',
        salePrice: '10',
        attributes: [{ attributeId: piedra.id, optionId: piedra.options[0] }],
      });
      const inactive = await product({ name: 'Inactivo' });
      await call('PATCH', `/api/v1/products/${inactive.id}`, { status: 'INACTIVE' });

      const names = async (query: string) =>
        ((await call('GET', `/api/v1/products?${query}`)).json().data as { name: string }[])
          .map((p) => p.name)
          .sort();
      expect(await names('incomplete=true')).toEqual(['Ambos', 'Sin ficha']);
      expect(await names('withoutPrice=true')).toEqual(['Ambos', 'Sin precio']);
      expect(await names('incomplete=true&withoutPrice=true')).toEqual(['Ambos']);
      expect(await names('')).toHaveLength(6);
      expect((await call('GET', '/api/v1/products?incomplete=quizas')).statusCode).toBe(400);

      const seller = await session([PERMISSIONS.CATALOG_READ, PERMISSIONS.INVENTORY_READ]);
      const health = await call('GET', '/api/v1/products/health', undefined, seller.cookie);
      expect(health.statusCode).toBe(200);
      expect(health.json().data).toEqual({
        activeProducts: 5,
        incompleteProducts: 2,
        productsWithoutPrice: 2,
      });
      expect(health.body).not.toMatch(/cost/i);
      expect((await call('GET', '/api/v1/products/health', undefined, '')).statusCode).toBe(401);
      const nobody = await session([]);
      expect(
        (await call('GET', '/api/v1/products/health', undefined, nobody.cookie)).statusCode,
      ).toBe(403);
    }, 60_000);
  });

  describe('eliminación física (B11)', () => {
    let admin: { cookie: string; userId: string };
    beforeEach(async () => {
      admin = await session(ADMIN_LIKE);
    });
    const del = (id: string, cookie = admin.cookie) =>
      call('DELETE', `/api/v1/products/${id}`, undefined, cookie);

    it('protege la ruta: 401 sin sesión, 403 sin catalog:delete (ni el gestor), 404 y 400', async () => {
      const created = await product();
      expect((await del(created.id, '')).statusCode).toBe(401);
      expect((await del(created.id, manager.cookie)).statusCode).toBe(403);
      expect((await del('no-es-uuid')).statusCode).toBe(400);
      expect((await del('01900000-0000-7000-8000-000000000000')).statusCode).toBe(404);
      expect(await app.prisma.product.count()).toBe(1);
    });

    it('elimina una ficha sin historial junto con sus variantes y deja auditoría', async () => {
      const material = await listAttribute('material', ['Plata', 'Oro']);
      const piedra = await listAttribute('piedra', ['Circonia']);
      const supplier = await app.prisma.supplier.create({ data: { name: 'Prov' } });
      const created = await product({
        name: 'Ficha por eliminar',
        barcode: 'DEL-1',
        supplierId: supplier.id,
        axes: [{ attributeId: material.id, optionId: material.options[0] }],
        attributes: [{ attributeId: piedra.id, optionId: piedra.options[0] }],
      });
      await call('POST', `/api/v1/products/${created.id}/variants`, {
        values: [{ attributeId: material.id, optionId: material.options[1] }],
      });
      // Un saldo en cero sin movimientos no es historial.
      await app.prisma.inventoryBalance.create({
        data: { variantId: created.variants[0]?.id as string, quantity: 0 },
      });

      const res = await del(created.id);
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ id: created.id });
      expect(await app.prisma.product.count()).toBe(0);
      expect(await app.prisma.productVariant.count()).toBe(0);
      expect(await app.prisma.supplierProduct.count()).toBe(0);
      expect(await app.prisma.inventoryBalance.count()).toBe(0);
      expect(await app.prisma.productAttributeValue.count()).toBe(0);
      const audit = await app.prisma.auditLog.findFirst({
        where: { action: 'product.deleted', entityId: created.id },
      });
      expect(audit?.userId).toBe(admin.userId);
      expect(JSON.stringify(audit?.before)).toContain('Ficha por eliminar');
      // El SKU ya usado no se reutiliza.
      const next = await product();
      expect(next.variants[0]?.sku).not.toBe(created.variants[0]?.sku);
    });

    it('rechaza la eliminación (422) si hay movimientos, saldo, ingresos o conteos', async () => {
      const reason = async (id: string) => {
        const res = await del(id);
        expect(res.statusCode).toBe(422);
        expect(res.json().error.message).toMatch(/desactívelo|desactive/i);
        expect(await app.prisma.product.count({ where: { id } })).toBe(1);
        return res.json().error.details as Record<string, number>;
      };

      // 1) Movimientos de inventario (aunque el saldo vuelva a cero).
      const moved = await product({ name: 'Con movimientos' });
      const movedId = moved.variants[0]?.id as string;
      await app.prisma.inventoryBalance.create({ data: { variantId: movedId, quantity: 0 } });
      await app.prisma.inventoryMovement.createMany({
        data: [
          {
            variantId: movedId,
            type: 'INITIAL_STOCK',
            quantity: 2,
            balanceBefore: 0,
            balanceAfter: 2,
            userId: admin.userId,
          },
          {
            variantId: movedId,
            type: 'ADJUSTMENT',
            quantity: -2,
            balanceBefore: 2,
            balanceAfter: 0,
            userId: admin.userId,
          },
        ],
      });
      expect((await reason(moved.id)).movements).toBe(2);

      // 2) Saldo distinto de cero (sin movimientos registrados).
      const stocked = await product({ name: 'Con saldo' });
      await app.prisma.inventoryBalance.create({
        data: { variantId: stocked.variants[0]?.id as string, quantity: 3 },
      });
      expect((await reason(stocked.id)).nonZeroBalances).toBe(1);

      // 3) Ítem de un ingreso de mercadería.
      const entered = await product({ name: 'En un ingreso' });
      const supplier = await app.prisma.supplier.create({ data: { name: 'Prov' } });
      const entry = await app.prisma.stockEntry.create({
        data: { supplierId: supplier.id, createdById: admin.userId },
      });
      await app.prisma.stockEntryItem.create({
        data: {
          stockEntryId: entry.id,
          variantId: entered.variants[0]?.id as string,
          receivedQty: 1,
          unitCost: '5',
        },
      });
      expect((await reason(entered.id)).entryItems).toBe(1);

      // 4) Registro de un inventario físico.
      const counted = await product({ name: 'En un conteo' });
      const count = await app.prisma.inventoryCount.create({ data: { createdById: admin.userId } });
      await app.prisma.inventoryCountItem.create({
        data: {
          inventoryCountId: count.id,
          variantId: counted.variants[0]?.id as string,
          systemQty: 0,
        },
      });
      expect((await reason(counted.id)).countItems).toBe(1);

      // Nada se perdió y no quedó auditoría de borrado.
      expect(await app.prisma.productVariant.count()).toBe(4);
      expect(await app.prisma.auditLog.count({ where: { action: 'product.deleted' } })).toBe(0);
    });

    it('si una sola variante tiene historial, no se elimina la ficha completa', async () => {
      const material = await listAttribute('material', ['Plata', 'Oro']);
      const created = await product({
        axes: [{ attributeId: material.id, optionId: material.options[0] }],
      });
      const added = await call('POST', `/api/v1/products/${created.id}/variants`, {
        values: [{ attributeId: material.id, optionId: material.options[1] }],
      });
      const second = (added.json().data.variants as { id: string }[])[1] as { id: string };
      await app.prisma.inventoryBalance.create({ data: { variantId: second.id, quantity: 1 } });
      expect((await del(created.id)).statusCode).toBe(422);
      expect(await app.prisma.productVariant.count()).toBe(2);
    });
  });
});
