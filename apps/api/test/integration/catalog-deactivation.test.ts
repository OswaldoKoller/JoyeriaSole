/**
 * P-22: no se desactiva un producto ni una variante con stock disponible.
 * La regla vive en el servicio (código estable STOCK_BLOCKS_DEACTIVATION) y se prueba junto con el
 * resto de permisos y la auditoría.
 */
import { PERMISSIONS, type Permission } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';

const MANAGER: Permission[] = [PERMISSIONS.CATALOG_READ, PERMISSIONS.CATALOG_MANAGE];

describe('desactivación de productos y variantes (P-22)', () => {
  let app: App;
  let cookie: string;
  let counter = 0;

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
    const manager = await createTestUser(app.prisma, { permissions: MANAGER });
    ({ cookie } = await login(app, manager.user.email, manager.password));
  });
  afterEach(() => app.close());

  /** Producto con las variantes indicadas, cada una con su stock inicial. */
  async function productWithStock(quantities: number[]) {
    counter += 1;
    const category = await app.prisma.category.create({
      data: { name: `Cat ${counter}`, slug: `cat-${counter}` },
    });
    const product = await app.prisma.product.create({
      data: { categoryId: category.id, name: `Producto ${counter}` },
    });
    const variants = [];
    for (const [index, quantity] of quantities.entries()) {
      const variant = await app.prisma.productVariant.create({
        data: { productId: product.id, sku: `T-${counter}-${index}`, label: `V${index}` },
      });
      await app.prisma.inventoryBalance.create({ data: { variantId: variant.id, quantity } });
      variants.push(variant);
    }
    return { product, variants };
  }

  const patchProduct = (id: string, payload: Record<string, unknown>, headers = { cookie }) =>
    app.inject({ method: 'PATCH', url: `/api/v1/products/${id}`, headers, payload });
  const patchVariant = (id: string, payload: Record<string, unknown>, headers = { cookie }) =>
    app.inject({
      method: 'PATCH',
      url: `/api/v1/products/variants/${id}/status`,
      headers,
      payload,
    });

  it('protege los endpoints: 401 sin sesión, 403 sin catalog:manage, 400 con datos inválidos', async () => {
    const { product, variants } = await productWithStock([0]);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/products/${product.id}`,
          payload: { status: 'INACTIVE' },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/products/variants/${variants[0]!.id}/status`,
          payload: { status: 'INACTIVE' },
        })
      ).statusCode,
    ).toBe(401);

    const reader = await createTestUser(app.prisma, { permissions: [PERMISSIONS.CATALOG_READ] });
    const readerCookie = (await login(app, reader.user.email, reader.password)).cookie;
    const headers = { cookie: readerCookie };
    expect((await patchProduct(product.id, { status: 'INACTIVE' }, headers)).statusCode).toBe(403);
    expect((await patchVariant(variants[0]!.id, { status: 'INACTIVE' }, headers)).statusCode).toBe(
      403,
    );

    expect((await patchProduct(product.id, { status: 'BORRADO' })).statusCode).toBe(400);
    expect((await patchVariant(variants[0]!.id, { status: 'DRAFT' })).statusCode).toBe(400);
    expect((await patchVariant('no-uuid', { status: 'INACTIVE' })).statusCode).toBe(400);
    expect(
      (
        await patchVariant('00000000-0000-4000-8000-000000000000', {
          status: 'INACTIVE',
        })
      ).statusCode,
    ).toBe(404);
  });

  it('bloquea desactivar un producto si alguna variante tiene stock', async () => {
    const { product, variants } = await productWithStock([0, 3]);
    const res = await patchProduct(product.id, { status: 'INACTIVE' });
    expect(res.statusCode).toBe(422);
    const { error } = res.json();
    expect(error.code).toBe('STOCK_BLOCKS_DEACTIVATION');
    expect(error.message).toMatch(/tiene 3 piezas en stock/);
    expect(error.details.variants).toEqual([{ sku: variants[1]!.sku, quantity: 3 }]);

    const stored = await app.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(stored.status).toBe('ACTIVE');
    expect(await app.prisma.auditLog.count({ where: { action: 'product.deactivated' } })).toBe(0);
  });

  it('bloquea desactivar una variante con stock y deja las demás intactas', async () => {
    const { product, variants } = await productWithStock([2, 0]);
    const blocked = await patchVariant(variants[0]!.id, { status: 'INACTIVE' });
    expect(blocked.statusCode).toBe(422);
    expect(blocked.json().error.code).toBe('STOCK_BLOCKS_DEACTIVATION');
    expect(blocked.json().error.message).toMatch(/la variante: tiene 2 piezas/);

    // La variante sin stock sí se puede desactivar, y el producto sigue activo.
    const ok = await patchVariant(variants[1]!.id, { status: 'INACTIVE' });
    expect(ok.statusCode).toBe(200);
    const statuses = ok.json().data.variants.map((v: { sku: string; status: string }) => v.status);
    expect(statuses).toEqual(['ACTIVE', 'INACTIVE']);
    expect(ok.json().data.status).toBe('ACTIVE');
    const audit = await app.prisma.auditLog.findFirstOrThrow({
      where: { action: 'variant.deactivated' },
    });
    expect(audit).toMatchObject({ entityId: variants[1]!.id });
    expect(product.id).toBeTruthy();
  });

  it('permite desactivar y reactivar cuando el stock es cero o no hay saldo registrado', async () => {
    const { product, variants } = await productWithStock([0]);
    await app.prisma.inventoryBalance.delete({ where: { variantId: variants[0]!.id } });

    const off = await patchProduct(product.id, { status: 'INACTIVE' });
    expect(off.statusCode).toBe(200);
    expect(off.json().data.status).toBe('INACTIVE');
    expect(await app.prisma.auditLog.count({ where: { action: 'product.deactivated' } })).toBe(1);

    const on = await patchProduct(product.id, { status: 'ACTIVE' });
    expect(on.statusCode).toBe(200);
    expect(await app.prisma.auditLog.count({ where: { action: 'product.activated' } })).toBe(1);

    const variantOff = await patchVariant(variants[0]!.id, { status: 'INACTIVE' });
    expect(variantOff.statusCode).toBe(200);
    const variantOn = await patchVariant(variants[0]!.id, { status: 'ACTIVE' });
    expect(variantOn.json().data.variants[0].status).toBe('ACTIVE');
  });

  it('tras un ajuste a cero el producto ya se puede desactivar', async () => {
    const { product, variants } = await productWithStock([4]);
    expect((await patchProduct(product.id, { status: 'INACTIVE' })).statusCode).toBe(422);
    await app.prisma.inventoryBalance.update({
      where: { variantId: variants[0]!.id },
      data: { quantity: 0 },
    });
    expect((await patchProduct(product.id, { status: 'INACTIVE' })).statusCode).toBe(200);
  });

  it('editar otros campos de un producto con stock sigue funcionando', async () => {
    const { product } = await productWithStock([5]);
    const res = await patchProduct(product.id, { name: 'Nombre nuevo' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ name: 'Nombre nuevo', status: 'ACTIVE' });
  });
});
