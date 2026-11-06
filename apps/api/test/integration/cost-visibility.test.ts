/**
 * Q-15.2 / P-02: el Vendedor ve el inicio y el stock, pero NINGUNA respuesta de la API que reciba
 * incluye costos ni valorizaciones. Se prueba con los permisos reales del rol Vendedor.
 */
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';

const COST_MARKER = '777.1234';

describe('visibilidad de costos (Q-15.2)', () => {
  let app: App;
  let sellerCookie: string;
  let managerCookie: string;
  let productId: string;
  let variantId: string;
  let sku: string;

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);

    const seller = await createTestUser(app.prisma, {
      permissions: [...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions],
    });
    sellerCookie = (await login(app, seller.user.email, seller.password)).cookie;
    const manager = await createTestUser(app.prisma, {
      permissions: [...DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions],
    });
    managerCookie = (await login(app, manager.user.email, manager.password)).cookie;

    const category = await app.prisma.category.create({
      data: { name: 'Anillos', slug: 'anillos' },
    });
    const product = await app.prisma.product.create({
      data: { categoryId: category.id, name: 'Anillo premium' },
    });
    const variant = await app.prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: 'SKU-PREMIUM',
        barcode: '7790001112223',
        label: 'Talla 16',
        costPrice: COST_MARKER,
        salePrice: '1500.00',
        minStock: 2,
      },
    });
    productId = product.id;
    variantId = variant.id;
    sku = variant.sku;
    await app.prisma.inventoryBalance.create({ data: { variantId, quantity: 1 } });
    await app.prisma.inventoryMovement.create({
      data: {
        variantId,
        type: 'INITIAL_STOCK',
        quantity: 1,
        balanceBefore: 0,
        balanceAfter: 1,
        reason: 'Conteo de apertura',
        userId: manager.user.id,
      },
    });
  });
  afterEach(() => app.close());

  const get = (url: string, cookie: string) =>
    app.inject({ method: 'GET', url, headers: { cookie } });

  it('las respuestas que recibe el Vendedor no contienen costos ni valorizaciones', async () => {
    const urls = [
      '/api/v1/auth/me',
      '/api/v1/products',
      `/api/v1/products/${productId}`,
      `/api/v1/products/lookup?code=${sku}`,
      '/api/v1/categories',
      '/api/v1/attributes',
      '/api/v1/inventory',
      '/api/v1/inventory?level=LOW',
      `/api/v1/inventory/${variantId}/movements`,
      '/api/v1/inventory/movements',
    ];
    for (const url of urls) {
      const res = await get(url, sellerCookie);
      expect(res.statusCode, url).toBe(200);
      expect(res.body, url).not.toContain(COST_MARKER);
      expect(res.body, url).not.toMatch(/cost|valuation|valor_?total|totalValue|inventoryValue/i);
    }
    // Sí ve lo que necesita: precio de venta y stock.
    const detail = (await get(`/api/v1/products/${productId}`, sellerCookie)).json().data;
    expect(detail.variants[0]).toMatchObject({ salePrice: '1500.00', stockQuantity: 1 });
  });

  it('el Vendedor no accede a documentos de compra, proveedores, usuarios ni auditoría', async () => {
    for (const url of [
      '/api/v1/stock-entries',
      '/api/v1/suppliers',
      '/api/v1/users',
      '/api/v1/users/roles',
    ]) {
      expect((await get(url, sellerCookie)).statusCode, url).toBe(403);
    }
    const initial = await app.inject({
      method: 'POST',
      url: `/api/v1/inventory/${variantId}/initial`,
      headers: { cookie: sellerCookie },
      payload: { quantity: 1, reason: 'x' },
    });
    expect(initial.statusCode).toBe(403);
  });

  it('el catálogo del Responsable tampoco expone el costo de la variante en el listado', async () => {
    // El costo se consulta en los documentos de ingreso (costs:read), nunca en el catálogo.
    for (const url of ['/api/v1/products', `/api/v1/products/${productId}`, '/api/v1/inventory']) {
      const res = await get(url, managerCookie);
      expect(res.statusCode, url).toBe(200);
      expect(res.body, url).not.toContain(COST_MARKER);
    }
  });

  it('el Responsable sí puede consultar ingresos (documentos con costos)', async () => {
    expect(DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions).toContain(
      PERMISSIONS.COSTS_READ,
    );
    expect((await get('/api/v1/stock-entries', managerCookie)).statusCode).toBe(200);
  });

  describe('notas de los movimientos (S-03)', () => {
    const NOTE = 'Faltante de 3 piezas, costo 777.1234';
    const movementUrls = () => [
      '/api/v1/inventory/movements',
      `/api/v1/inventory/${variantId}/movements`,
    ];

    beforeEach(async () => {
      // El libro es append-only (no admite UPDATE): se agrega un movimiento más reciente con nota.
      const first = await app.prisma.inventoryMovement.findFirstOrThrow({ where: { variantId } });
      await app.prisma.inventoryMovement.create({
        data: {
          variantId,
          type: 'ADJUSTMENT',
          quantity: 1,
          balanceBefore: 1,
          balanceAfter: 2,
          reason: 'Ajuste con nota',
          notes: NOTE,
          userId: first.userId,
        },
      });
    });

    it('el Vendedor recibe las notas como null en el kardex y en el historial global', async () => {
      for (const url of movementUrls()) {
        const res = await get(url, sellerCookie);
        expect(res.statusCode, url).toBe(200);
        expect(res.body, url).not.toContain(NOTE);
        const rows = res.json().data as { notes: string | null; reason: string }[];
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((row) => row.notes === null)).toBe(true);
      }
    });

    it('quien ajusta inventario o audita sí ve las notas', async () => {
      for (const permission of [
        PERMISSIONS.INVENTORY_ADJUST,
        PERMISSIONS.STOCK_ENTRIES_READ,
        PERMISSIONS.AUDIT_READ,
      ]) {
        const user = await createTestUser(app.prisma, {
          permissions: [PERMISSIONS.INVENTORY_READ, permission],
        });
        const { cookie } = await login(app, user.user.email, user.password);
        for (const url of movementUrls()) {
          const res = await get(url, cookie);
          expect(res.statusCode, `${permission} ${url}`).toBe(200);
          expect(res.json().data[0].notes, `${permission} ${url}`).toBe(NOTE);
        }
      }
    });

    it('el Responsable de inventario conserva las notas', async () => {
      for (const url of movementUrls()) {
        expect((await get(url, managerCookie)).json().data[0].notes).toBe(NOTE);
      }
    });
  });

  it('el kardex y el historial se ordenan por id descendente, no por created_at', async () => {
    const base = await app.prisma.inventoryMovement.findFirstOrThrow({ where: { variantId } });
    // Un movimiento posterior (id mayor) cuyo created_at es ANTERIOR: el orden manda el id.
    const later = await app.prisma.inventoryMovement.create({
      data: {
        variantId,
        type: 'ADJUSTMENT',
        quantity: 1,
        balanceBefore: 1,
        balanceAfter: 2,
        reason: 'Posterior',
        userId: base.userId,
        createdAt: new Date(base.createdAt.getTime() - 60_000),
      },
    });
    for (const url of ['/api/v1/inventory/movements', `/api/v1/inventory/${variantId}/movements`]) {
      const res = await get(url, managerCookie);
      expect(res.statusCode, url).toBe(200);
      expect(res.json().data.map((row: { id: string }) => row.id)).toEqual([
        later.id.toString(),
        base.id.toString(),
      ]);
    }
  });
});
