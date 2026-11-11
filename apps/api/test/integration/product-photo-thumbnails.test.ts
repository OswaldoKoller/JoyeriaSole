/**
 * Miniaturas de fotos y portadas por lotes (DT-DAT-17/18, OD-04, nota de ADR-020): anchos en
 * lista blanca, tamaño realmente menor, caché inmutable, fotos antiguas sin miniatura y permisos.
 */
import { PERMISSIONS, type Permission } from '@joyeria/shared';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';
import { makeImage, multipartPayload } from '../helpers/images.ts';

const MANAGER: Permission[] = [PERMISSIONS.CATALOG_READ, PERMISSIONS.CATALOG_MANAGE];
const MISSING = '0194a2f0-0000-7000-8000-000000000000';

interface PhotoDto {
  id: string;
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
  isCover: boolean;
}

/** Foto con ruido (se comprime como una foto real, no como un color liso). */
function noisyJpeg(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: '#b8860b',
      noise: { type: 'gaussian', mean: 128, sigma: 40 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe('miniaturas de fotos (DT-DAT-18) y portadas por lotes (DT-DAT-17)', () => {
  let app: App;
  let manager: { cookie: string };

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
    manager = await session(MANAGER);
  });
  afterEach(() => app.close());

  async function session(permissions: Permission[]) {
    const { user, password } = await createTestUser(app.prisma, { permissions });
    const { cookie } = await login(app, user.email, password);
    return { cookie };
  }

  async function newProduct(name = 'Collar con foto') {
    const category = await app.prisma.category.create({
      data: { name: `Cat ${name}`, slug: `cat-${name.toLowerCase().replaceAll(' ', '-')}` },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: { cookie: manager.cookie },
      payload: { categoryId: category.id, name },
    });
    expect(res.statusCode).toBe(201);
    const productId = res.json().data.id as string;
    const variant = await app.prisma.productVariant.findFirstOrThrow({ where: { productId } });
    return { productId, variantId: variant.id };
  }

  async function upload(productId: string, bytes: Uint8Array) {
    const body = multipartPayload({ name: 'foto.jpg', type: 'image/jpeg', bytes });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/photos`,
      headers: { 'content-type': body.contentType, cookie: manager.cookie },
      payload: body.payload,
    });
    expect(res.statusCode).toBe(201);
    return res.json().data as PhotoDto;
  }

  const get = (url: string, cookie: string | undefined = manager.cookie, headers = {}) =>
    app.inject({ method: 'GET', url, headers: { ...(cookie && { cookie }), ...headers } });

  const storedWidths = async (photoId: string) =>
    (
      await app.prisma.productPhotoThumbnail.findMany({
        where: { photoId },
        select: { width: true },
        orderBy: { width: 'asc' },
      })
    ).map((thumb) => thumb.width);

  describe('miniaturas', () => {
    it('al subir genera 160, 320 y 640 px; cada una pesa menos que la foto y tiene el ancho pedido', async () => {
      const { productId } = await newProduct();
      const photo = await upload(productId, await noisyJpeg(3000, 2000));
      expect(photo).toMatchObject({ width: 1200, height: 800 });
      expect(await storedWidths(photo.id)).toEqual([160, 320, 640]);

      let previous = 0;
      for (const width of [160, 320, 640]) {
        const res = await get(`${photo.url}?w=${width}`);
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toBe('image/webp');
        const meta = await sharp(res.rawPayload).metadata();
        expect(meta.format).toBe('webp');
        expect(meta.width).toBe(width);
        expect(meta.height).toBe(Math.round((width * 800) / 1200));
        expect(res.rawPayload.length).toBeLessThan(photo.sizeBytes);
        expect(res.rawPayload.length).toBeGreaterThan(previous);
        previous = res.rawPayload.length;
      }
      // La de 160 px (listas) pesa una fracción de la foto completa.
      const small = await get(`${photo.url}?w=160`);
      expect(small.rawPayload.length * 10).toBeLessThan(photo.sizeBytes);
    });

    it('rechaza anchos fuera de la lista blanca (400) sin generar nada', async () => {
      const { productId, variantId } = await newProduct();
      const photo = await upload(productId, await makeImage('jpeg', 1000, 800));
      const before = await storedWidths(photo.id);
      for (const w of ['100', '1200', '161', '159.5', 'abc', '', '-160', '1e3']) {
        const res = await get(`${photo.url}?w=${w}`);
        expect(res.statusCode, `w=${w}`).toBe(400);
        expect(res.json().error.code).toBe('VALIDATION_ERROR');
      }
      expect((await get(`${photo.url}?w=160&w=320`)).statusCode).toBe(400);
      expect((await get(`/api/v1/products/variants/${variantId}/cover?w=200`)).statusCode).toBe(
        400,
      );
      expect(await storedWidths(photo.id)).toEqual(before);
    });

    it('cachea las miniaturas como inmutables, con ETag propio y 304 sin reenviar bytes', async () => {
      const { productId } = await newProduct();
      const photo = await upload(productId, await makeImage('jpeg', 1000, 800));
      const res = await get(`${photo.url}?w=320`);
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      const etag = String(res.headers.etag);
      expect(etag).toMatch(/^"[0-9a-f]{64}-w320"$/);
      const original = await get(photo.url);
      expect(original.headers.etag).not.toBe(etag);

      const cached = await get(`${photo.url}?w=320`, manager.cookie, { 'if-none-match': etag });
      expect(cached.statusCode).toBe(304);
      expect(cached.rawPayload.length).toBe(0);
    });

    it('exige sesión (401) y un permiso de pantalla con piezas (403)', async () => {
      const { productId } = await newProduct();
      const photo = await upload(productId, await makeImage('jpeg', 1000, 800));
      expect((await get(`${photo.url}?w=160`, '')).statusCode).toBe(401);
      const nobody = await session([PERMISSIONS.USERS_READ]);
      expect((await get(`${photo.url}?w=160`, nobody.cookie)).statusCode).toBe(403);
      const viewer = await session([PERMISSIONS.INVENTORY_READ]);
      expect((await get(`${photo.url}?w=160`, viewer.cookie)).statusCode).toBe(200);
    });

    it('una foto más angosta que el ancho pedido se sirve completa (no se amplía ni se guarda)', async () => {
      const { productId } = await newProduct();
      const photo = await upload(productId, await makeImage('png', 300, 300));
      expect(await storedWidths(photo.id)).toEqual([160]);
      const original = await get(photo.url);
      const res = await get(`${photo.url}?w=640`);
      expect(res.statusCode).toBe(200);
      expect(res.headers.etag).toBe(original.headers.etag);
      expect(res.rawPayload.equals(original.rawPayload)).toBe(true);
      expect(await storedWidths(photo.id)).toEqual([160]);
    });

    it('una foto anterior a las miniaturas la genera al pedirla y la guarda para la próxima vez', async () => {
      const { productId } = await newProduct();
      const photo = await upload(productId, await makeImage('jpeg', 1000, 800));
      // Simula una foto subida antes de esta versión: sin filas de miniaturas.
      await app.prisma.productPhotoThumbnail.deleteMany({ where: { photoId: photo.id } });

      const res = await get(`${photo.url}?w=320`);
      expect(res.statusCode).toBe(200);
      expect((await sharp(res.rawPayload).metadata()).width).toBe(320);
      expect(res.rawPayload.length).toBeLessThan(photo.sizeBytes);
      expect(await storedWidths(photo.id)).toEqual([320]);

      // Peticiones simultáneas por la misma miniatura no fallan (guardado idempotente).
      const results = await Promise.all([1, 2, 3].map(() => get(`${photo.url}?w=160`)));
      expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200]);
      expect(await storedWidths(photo.id)).toEqual([160, 320]);
      const again = await get(`${photo.url}?w=320`);
      expect(again.rawPayload.equals(res.rawPayload)).toBe(true);
    });

    it('la portada por variante también acepta ?w= y sigue revalidándose', async () => {
      const { productId, variantId } = await newProduct();
      await upload(productId, await makeImage('jpeg', 1000, 800));
      const res = await get(`/api/v1/products/variants/${variantId}/cover?w=160`);
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('private, no-cache');
      expect((await sharp(res.rawPayload).metadata()).width).toBe(160);
    });

    it('al eliminar la foto se eliminan sus miniaturas', async () => {
      const { productId } = await newProduct();
      const photo = await upload(productId, await makeImage('jpeg', 1000, 800));
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/products/${productId}/photos/${photo.id}`,
        headers: { cookie: manager.cookie },
      });
      expect(res.statusCode).toBe(200);
      expect(await app.prisma.productPhotoThumbnail.count()).toBe(0);
    });
  });

  describe('portadas por lotes', () => {
    const coversUrl = (ids: string[]) => `/api/v1/products/variants/covers?ids=${ids.join(',')}`;

    it('devuelve la portada de cada variante en el orden pedido, sin bytes', async () => {
      const withPhotos = await newProduct('Con fotos');
      const withoutPhotos = await newProduct('Sin fotos');
      await upload(withPhotos.productId, await makeImage('jpeg', 400, 300));
      const second = await upload(withPhotos.productId, await makeImage('png', 300, 300));
      const cover = await app.inject({
        method: 'PUT',
        url: `/api/v1/products/${withPhotos.productId}/photos/${second.id}/cover`,
        headers: { cookie: manager.cookie },
      });
      expect(cover.statusCode).toBe(200);

      const ids = [withoutPhotos.variantId, withPhotos.variantId, MISSING, withPhotos.variantId];
      const res = await get(coversUrl(ids));
      expect(res.statusCode).toBe(200);
      const data = res.json().data as { variantId: string; photo: PhotoDto | null }[];
      expect(data.map((item) => item.variantId)).toEqual([
        withoutPhotos.variantId,
        withPhotos.variantId,
        MISSING,
      ]);
      expect(data[0]?.photo).toBeNull();
      expect(data[1]?.photo).toMatchObject({ id: second.id, url: second.url, isCover: true });
      expect(data[2]?.photo).toBeNull();
      expect(res.body).not.toContain('bytes');
      expect(res.body).not.toContain('sha256');
    });

    it('exige sesión (401) y un permiso de pantalla con piezas (403)', async () => {
      const { variantId } = await newProduct();
      expect((await get(coversUrl([variantId]), '')).statusCode).toBe(401);
      const nobody = await session([PERMISSIONS.USERS_READ]);
      expect((await get(coversUrl([variantId]), nobody.cookie)).statusCode).toBe(403);
      const viewer = await session([PERMISSIONS.STOCK_ENTRIES_READ]);
      expect((await get(coversUrl([variantId]), viewer.cookie)).statusCode).toBe(200);
    });

    it('valida los ids: formato, vacío y máximo de 100 por petición (400)', async () => {
      expect((await get(coversUrl(['no-es-un-uuid']))).statusCode).toBe(400);
      expect((await get('/api/v1/products/variants/covers?ids=')).statusCode).toBe(400);
      expect((await get('/api/v1/products/variants/covers')).statusCode).toBe(400);
      const many = Array.from(
        { length: 101 },
        (_, index) => `0194a2f0-0000-7000-8000-${String(index).padStart(12, '0')}`,
      );
      expect((await get(coversUrl(many))).statusCode).toBe(400);
      expect((await get(coversUrl(many.slice(0, 100)))).statusCode).toBe(200);
    });
  });
});
