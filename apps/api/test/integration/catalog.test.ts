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

describe('catálogo', () => {
  let app: App;
  let cookie: string;

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
    const manager = await createTestUser(app.prisma, { permissions: MANAGER });
    ({ cookie } = await login(app, manager.user.email, manager.password));
  });
  afterEach(() => app.close());

  async function sessionWith(permissions: Permission[]) {
    const { user, password } = await createTestUser(app.prisma, { permissions });
    return (await login(app, user.email, password)).cookie;
  }

  async function createCategory(name: string, parentId?: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: { cookie },
      payload: { name, ...(parentId && { parentId }) },
    });
    return res;
  }

  async function createAttributeWithOptions(code: string, values: string[]) {
    const attribute = await app.prisma.attribute.create({
      data: { code, name: code, dataType: 'OPTION' },
    });
    const options: string[] = [];
    for (const value of values) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/attributes/${attribute.id}/options`,
        headers: { cookie },
        payload: { value },
      });
      expect(res.statusCode).toBe(201);
      options.push(res.json().data.id as string);
    }
    return { attributeId: attribute.id, options };
  }

  async function createProduct(payload: Record<string, unknown> = {}) {
    const category = (await createCategory(`Anillos ${Math.random()}`)).json().data;
    return app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: { cookie },
      payload: { categoryId: category.id, name: 'Anillo Solitario', ...payload },
    });
  }

  describe('categorías (P-04: máximo dos niveles)', () => {
    it('protege las rutas: 401 sin sesión, 403 sin permiso de gestión', async () => {
      expect((await app.inject({ method: 'GET', url: '/api/v1/categories' })).statusCode).toBe(401);
      const reader = await sessionWith([PERMISSIONS.CATALOG_READ]);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/categories',
        headers: { cookie: reader },
        payload: { name: 'Anillos' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('crea categoría y subcategoría, y rechaza un tercer nivel', async () => {
      const parent = await createCategory('Anillos');
      expect(parent.statusCode).toBe(201);
      const child = await createCategory('Solitarios', parent.json().data.id);
      expect(child.statusCode).toBe(201);
      expect(child.json().data.parentId).toBe(parent.json().data.id);

      const third = await createCategory('Con circona', child.json().data.id);
      expect(third.statusCode).toBe(422);
    });

    it('rechaza nombres duplicados en el mismo nivel sin importar mayúsculas', async () => {
      await createCategory('Aretes');
      const duplicate = await createCategory('ARETES');
      expect(duplicate.statusCode).toBe(409);
    });

    it('audita la creación en la misma operación', async () => {
      const res = await createCategory('Cadenas');
      const audit = await app.prisma.auditLog.findFirst({
        where: { action: 'category.created', entityId: res.json().data.id },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe('valores de atributos (P-15)', () => {
    it('agrega valores a un atributo de lista y rechaza duplicados', async () => {
      const { attributeId } = await createAttributeWithOptions('material', ['Plata 925']);
      const duplicate = await app.inject({
        method: 'POST',
        url: `/api/v1/attributes/${attributeId}/options`,
        headers: { cookie },
        payload: { value: 'plata 925' },
      });
      expect(duplicate.statusCode).toBe(409);
    });

    it('no acepta valores de lista en atributos de texto', async () => {
      const attribute = await app.prisma.attribute.create({
        data: { code: 'dimensiones', name: 'Dimensiones', dataType: 'TEXT' },
      });
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/attributes/${attribute.id}/options`,
        headers: { cookie },
        payload: { value: '2 x 3 cm' },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  describe('productos y variantes', () => {
    it('crea un producto con una variante base, SKU correlativo y precio en Bs', async () => {
      const res = await createProduct({ salePrice: '150.50', minStock: 2 });
      expect(res.statusCode).toBe(201);
      const product = res.json().data;
      expect(product.variants).toHaveLength(1);
      expect(product.variants[0]).toMatchObject({ salePrice: '150.5', minStock: 2, barcode: null });
      expect(product.variants[0].sku).toMatch(/^SKU-\d{6,}$/);

      const second = (await createProduct()).json().data;
      const n = (sku: string) => Number(sku.replace('SKU-', ''));
      expect(n(second.variants[0].sku)).toBeGreaterThan(n(product.variants[0].sku));
    });

    it('no permite fijar precio sin prices:manage', async () => {
      const category = (await createCategory('Pulseras')).json().data;
      const noPrices = await sessionWith([PERMISSIONS.CATALOG_READ, PERMISSIONS.CATALOG_MANAGE]);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        headers: { cookie: noPrices },
        payload: { categoryId: category.id, name: 'Pulsera', salePrice: '80' },
      });
      expect(res.statusCode).toBe(403);
      expect(await app.prisma.product.count()).toBe(0);
    });

    it('valida datos de entrada (400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        headers: { cookie },
        payload: { categoryId: 'no-es-uuid', name: '', salePrice: '-3' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('el código de barras es único: un código repetido no se guarda y se avisa (Q-10)', async () => {
      const first = (await createProduct({ barcode: '7790000000001' })).json().data;
      expect(first.variants[0].barcode).toBe('7790000000001');

      // Mismo código del proveedor en otra pieza: la ficha se crea, el código NO se guarda.
      const duplicate = await createProduct({ barcode: '7790000000001' });
      expect(duplicate.statusCode).toBe(201);
      expect(duplicate.json().data.variants[0].barcode).toBeNull();
      expect(duplicate.json().meta.warnings[0]).toContain('ya pertenece a la pieza');
      expect(duplicate.json().meta.warnings[0]).toContain('se identifica por su SKU');

      // Un código que coincide con el SKU de otra pieza tampoco se guarda como código de barras.
      const clash = await createProduct({ barcode: first.variants[0].sku });
      expect(clash.statusCode).toBe(201);
      expect(clash.json().data.variants[0].barcode).toBeNull();
      expect(clash.json().meta.warnings).toHaveLength(1);
    });

    it('genera un código propio solo si la variante no tiene uno (P-06)', async () => {
      const product = (await createProduct()).json().data;
      const variantId = product.variants[0].id as string;
      const url = `/api/v1/products/variants/${variantId}/barcode/generate`;

      const generated = await app.inject({ method: 'POST', url, headers: { cookie } });
      expect(generated.statusCode).toBe(200);
      expect(generated.json().data.variants[0].barcode).toMatch(/^SOLE-[0-9A-F]{32}$/);

      const again = await app.inject({ method: 'POST', url, headers: { cookie } });
      expect(again.statusCode).toBe(422);
    });

    it('busca una variante por SKU o código de barras (lector)', async () => {
      const product = (await createProduct({ barcode: 'PROV-123' })).json().data;
      for (const code of [product.variants[0].sku, 'PROV-123']) {
        const res = await app.inject({
          method: 'GET',
          url: `/api/v1/products/lookup?code=${encodeURIComponent(code as string)}`,
          headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.id).toBe(product.id);
      }
      const missing = await app.inject({
        method: 'GET',
        url: '/api/v1/products/lookup?code=NO-EXISTE',
        headers: { cookie },
      });
      expect(missing.statusCode).toBe(404);
    });

    it('configura ejes y crea combinaciones únicas, cada una con su SKU', async () => {
      const material = await createAttributeWithOptions('material', ['Plata 925', 'Oro 18K']);
      const talla = await createAttributeWithOptions('talla', ['16', '18']);
      const product = (await createProduct()).json().data;
      const pick = (attr: { attributeId: string; options: string[] }, i: number) => ({
        attributeId: attr.attributeId,
        optionId: attr.options[i],
      });

      const axes = await app.inject({
        method: 'POST',
        url: `/api/v1/products/${product.id}/axes`,
        headers: { cookie },
        payload: { axes: [pick(material, 0), pick(talla, 0)] },
      });
      expect(axes.statusCode).toBe(200);
      expect(axes.json().data.variants[0].label).toBe('Plata 925 / 16');

      const variantUrl = `/api/v1/products/${product.id}/variants`;
      const added = await app.inject({
        method: 'POST',
        url: variantUrl,
        headers: { cookie },
        payload: { values: [pick(talla, 1), pick(material, 1)] },
      });
      expect(added.statusCode).toBe(201);
      const variants = added.json().data.variants as { sku: string; label: string }[];
      expect(variants.map((v) => v.label).sort()).toEqual(['Oro 18K / 18', 'Plata 925 / 16']);
      expect(new Set(variants.map((v) => v.sku)).size).toBe(2);

      const duplicate = await app.inject({
        method: 'POST',
        url: variantUrl,
        headers: { cookie },
        payload: { values: [pick(material, 0), pick(talla, 0)] },
      });
      expect(duplicate.statusCode).toBe(409);

      const incomplete = await app.inject({
        method: 'POST',
        url: variantUrl,
        headers: { cookie },
        payload: { values: [pick(material, 1)] },
      });
      expect(incomplete.statusCode).toBe(400);

      const reconfigure = await app.inject({
        method: 'POST',
        url: `/api/v1/products/${product.id}/axes`,
        headers: { cookie },
        payload: { axes: [pick(material, 1)] },
      });
      expect(reconfigure.statusCode).toBe(422);
    }, 60_000);

    it('rechaza opciones que no pertenecen al atributo indicado', async () => {
      const material = await createAttributeWithOptions('material', ['Plata 925']);
      const talla = await createAttributeWithOptions('talla', ['16']);
      const product = (await createProduct()).json().data;
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/products/${product.id}/axes`,
        headers: { cookie },
        payload: { axes: [{ attributeId: material.attributeId, optionId: talla.options[0] }] },
      });
      expect(res.statusCode).toBe(400);
    });

    it('un lector de catálogo no ve costos (P-02) ni puede crear productos', async () => {
      await createProduct();
      const reader = await sessionWith([PERMISSIONS.CATALOG_READ]);
      const list = await app.inject({
        method: 'GET',
        url: '/api/v1/products',
        headers: { cookie: reader },
      });
      expect(list.statusCode).toBe(200);
      expect(list.json().meta.total).toBe(1);
      expect(JSON.stringify(list.json())).not.toMatch(/costPrice|passwordHash/);

      const create = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        headers: { cookie: reader },
        payload: { categoryId: list.json().data[0].categoryId, name: 'X' },
      });
      expect(create.statusCode).toBe(403);
    });
  });

  describe('disponibilidad por variante dentro del catálogo', () => {
    it('muestra stock y nivel solo a quien también puede leer inventario', async () => {
      const product = (await createProduct({ minStock: 5 })).json().data;
      const variantId = product.variants[0].id as string;
      await app.prisma.inventoryBalance.create({ data: { variantId, quantity: 3 } });

      const withStock = await sessionWith([PERMISSIONS.CATALOG_READ, PERMISSIONS.INVENTORY_READ]);
      const catalogOnly = await sessionWith([PERMISSIONS.CATALOG_READ]);

      for (const url of [
        '/api/v1/products',
        `/api/v1/products/${product.id}`,
        `/api/v1/products/lookup?code=${product.variants[0].sku}`,
      ]) {
        const full = await app.inject({ method: 'GET', url, headers: { cookie: withStock } });
        expect(full.statusCode).toBe(200);
        const body = full.json();
        const variant = (Array.isArray(body.data) ? body.data[0] : body.data).variants[0];
        expect(variant).toMatchObject({ stockQuantity: 3, stockLevel: 'LOW' });

        const limited = await app.inject({ method: 'GET', url, headers: { cookie: catalogOnly } });
        expect(limited.statusCode).toBe(200);
        expect(limited.body).not.toMatch(/stockQuantity|stockLevel/);
      }
    });

    it('una variante sin saldo registrado figura como sin stock', async () => {
      const product = (await createProduct()).json().data;
      const reader = await sessionWith([PERMISSIONS.CATALOG_READ, PERMISSIONS.INVENTORY_READ]);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/products/${product.id}`,
        headers: { cookie: reader },
      });
      expect(res.json().data.variants[0]).toMatchObject({ stockQuantity: 0, stockLevel: 'OUT' });
    });
  });
});
