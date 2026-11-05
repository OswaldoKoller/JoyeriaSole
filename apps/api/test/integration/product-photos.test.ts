/**
 * S3 · Fotos de producto (Q-09, ADR-020): subida validada por contenido, reducción, límites,
 * portada única, orden, borrado, permisos, auditoría y listados sin bytes.
 */
import { MAX_PHOTO_UPLOAD_BYTES, PERMISSIONS, type Permission } from '@joyeria/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';
import { makeImage, multipartPayload, type TestImageFormat } from '../helpers/images.ts';

const MANAGER: Permission[] = [PERMISSIONS.CATALOG_READ, PERMISSIONS.CATALOG_MANAGE];
const READER: Permission[] = [PERMISSIONS.CATALOG_READ];
const MISSING = '0194a2f0-0000-7000-8000-000000000000';

interface PhotoDto {
  id: string;
  url: string;
  contentType: string;
  width: number;
  height: number;
  sizeBytes: number;
  position: number;
  isCover: boolean;
}

describe('fotos de producto (S3)', () => {
  let app: App;
  let manager: { cookie: string; userId: string };
  let reader: { cookie: string; userId: string };

  beforeEach(async () => {
    app = await buildTestApp();
    await resetDatabase(app.prisma);
    manager = await session(MANAGER);
    reader = await session(READER);
  });
  afterEach(() => app.close());

  async function session(permissions: Permission[]) {
    const { user, password } = await createTestUser(app.prisma, { permissions });
    const { cookie } = await login(app, user.email, password);
    return { cookie, userId: user.id };
  }

  async function newProduct(name = 'Anillo con foto') {
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
    return res.json().data.id as string;
  }

  async function upload(
    productId: string,
    bytes: Uint8Array,
    options: { cookie?: string | undefined; name?: string; type?: string; fieldName?: string } = {},
  ) {
    const body = multipartPayload(
      { name: options.name ?? 'foto.jpg', type: options.type ?? 'image/jpeg', bytes },
      options.fieldName ? { fieldName: options.fieldName } : {},
    );
    const cookie = 'cookie' in options ? options.cookie : manager.cookie;
    return app.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/photos`,
      headers: { 'content-type': body.contentType, ...(cookie && { cookie }) },
      payload: body.payload,
    });
  }

  async function uploadOk(productId: string, format: TestImageFormat = 'jpeg', w = 400, h = 300) {
    const res = await upload(productId, await makeImage(format, w, h));
    expect(res.statusCode).toBe(201);
    return res.json().data as PhotoDto;
  }

  const get = (url: string, cookie: string | undefined = manager.cookie, headers = {}) =>
    app.inject({ method: 'GET', url, headers: { ...(cookie && { cookie }), ...headers } });

  const listPhotos = async (productId: string) =>
    (await get(`/api/v1/products/${productId}/photos`)).json().data as PhotoDto[];

  describe('subida', () => {
    it('exige sesión (401) y permiso catalog:manage (403)', async () => {
      const productId = await newProduct();
      const bytes = await makeImage();
      expect((await upload(productId, bytes, { cookie: undefined })).statusCode).toBe(401);
      expect((await upload(productId, bytes, { cookie: reader.cookie })).statusCode).toBe(403);
      expect(await listPhotos(productId)).toHaveLength(0);
    });

    it('sube una foto, la reduce a WebP de 1200 px y la deja como portada', async () => {
      const productId = await newProduct();
      const res = await upload(productId, await makeImage('jpeg', 3000, 2000));
      expect(res.statusCode).toBe(201);
      const photo = res.json().data as PhotoDto;
      expect(photo).toMatchObject({
        contentType: 'image/webp',
        width: 1200,
        height: 800,
        position: 0,
        isCover: true,
        url: `/api/v1/products/${productId}/photos/${photo.id}`,
      });
      expect(JSON.stringify(res.json())).not.toContain('bytes');
      const blob = await app.prisma.productPhotoBlob.findUniqueOrThrow({
        where: { photoId: photo.id },
      });
      expect(blob.bytes.length).toBe(photo.sizeBytes);
    });

    it('acepta JPG, PNG y WebP', async () => {
      const productId = await newProduct();
      for (const format of ['jpeg', 'png', 'webp'] as const) await uploadOk(productId, format);
      expect(await listPhotos(productId)).toHaveLength(3);
    });

    it('valida por contenido: un archivo no imagen renombrado a .jpg se rechaza (400)', async () => {
      const productId = await newProduct();
      const fakes = [
        Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'),
        Buffer.from('<html><script>alert(1)</script></html>'),
        Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!'),
        Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00'),
      ];
      for (const bytes of fakes) {
        const res = await upload(productId, bytes, { name: 'foto.jpg', type: 'image/jpeg' });
        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('VALIDATION_ERROR');
        expect(res.json().error.message).toMatch(/imagen/i);
      }
      expect(await listPhotos(productId)).toHaveLength(0);
    });

    it('acepta una imagen válida aunque se declare con otra extensión o Content-Type', async () => {
      const productId = await newProduct();
      const res = await upload(productId, await makeImage('png'), {
        name: 'archivo.bin',
        type: 'application/octet-stream',
      });
      expect(res.statusCode).toBe(201);
    });

    it('rechaza una imagen con firma válida pero dañada (400)', async () => {
      const productId = await newProduct();
      const truncated = (await makeImage('png', 800, 800)).subarray(0, 50);
      expect((await upload(productId, truncated)).statusCode).toBe(400);
    });

    it('rechaza archivos de más de 5 MB (413) sin guardar nada', async () => {
      const productId = await newProduct();
      const big = Buffer.concat([await makeImage('jpeg'), Buffer.alloc(MAX_PHOTO_UPLOAD_BYTES)]);
      const res = await upload(productId, big);
      expect(res.statusCode).toBe(413);
      expect(res.json().error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(await app.prisma.productPhoto.count()).toBe(0);
    });

    it('limita a un archivo por petición y exige el campo «file»', async () => {
      const productId = await newProduct();
      const bytes = await makeImage();
      const boundary = '----dos-archivos';
      const part = (name: string) =>
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: image/jpeg\r\n\r\n`;
      const payload = Buffer.concat([
        Buffer.from(part('a.jpg')),
        bytes,
        Buffer.from('\r\n'),
        Buffer.from(part('b.jpg')),
        bytes,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const two = await app.inject({
        method: 'POST',
        url: `/api/v1/products/${productId}/photos`,
        headers: {
          cookie: manager.cookie,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      // Se procesa solo el primero o se rechaza; nunca se guardan dos fotos en una petición.
      expect((await listPhotos(productId)).length).toBeLessThanOrEqual(1);
      expect([201, 413]).toContain(two.statusCode);

      const wrongField = await upload(productId, bytes, { fieldName: 'otro' });
      expect(wrongField.statusCode).toBe(400);
      const json = await app.inject({
        method: 'POST',
        url: `/api/v1/products/${productId}/photos`,
        headers: { cookie: manager.cookie },
        payload: { file: 'x' },
      });
      expect(json.statusCode).toBe(400);
    });

    it('rechaza la 6.ª foto (422) y permite subir de nuevo tras eliminar una', async () => {
      const productId = await newProduct();
      const photos: PhotoDto[] = [];
      for (let i = 0; i < 5; i++) photos.push(await uploadOk(productId));
      const sixth = await upload(productId, await makeImage());
      expect(sixth.statusCode).toBe(422);
      expect(sixth.json().error.message).toMatch(/hasta 5 fotos/);
      expect(await app.prisma.productPhoto.count()).toBe(5);
      const first = photos[0];
      if (!first) throw new Error('sin fotos');
      await app.inject({
        method: 'DELETE',
        url: `/api/v1/products/${productId}/photos/${first.id}`,
        headers: { cookie: manager.cookie },
      });
      expect((await upload(productId, await makeImage())).statusCode).toBe(201);
    });

    it('respeta el máximo con subidas concurrentes', async () => {
      const productId = await newProduct();
      const bytes = await makeImage();
      const results = await Promise.all(Array.from({ length: 8 }, () => upload(productId, bytes)));
      expect(results.filter((res) => res.statusCode === 201)).toHaveLength(5);
      expect(await app.prisma.productPhoto.count()).toBe(5);
      expect((await listPhotos(productId)).map((photo) => photo.position)).toEqual([0, 1, 2, 3, 4]);
    });

    it('devuelve 404 para un producto inexistente y 400 para un id mal formado', async () => {
      const bytes = await makeImage();
      expect((await upload(MISSING, bytes)).statusCode).toBe(404);
      expect((await upload('no-es-uuid', bytes)).statusCode).toBe(400);
    });

    it('registra la auditoría en la misma operación, sin bytes', async () => {
      const productId = await newProduct();
      const photo = await uploadOk(productId);
      const audit = await app.prisma.auditLog.findFirstOrThrow({
        where: { action: 'product.photo_added' },
      });
      expect(audit).toMatchObject({
        entityType: 'Product',
        entityId: productId,
        userId: manager.userId,
      });
      expect(JSON.stringify(audit.after)).toContain(photo.id);
      expect(JSON.stringify(audit.after)).not.toContain('bytes');
    });
  });

  describe('lectura de la imagen', () => {
    it('sirve los bytes con cabeceras seguras, ETag y caché; el Vendedor puede verla', async () => {
      const productId = await newProduct();
      const photo = await uploadOk(productId, 'png');
      for (const cookie of [manager.cookie, reader.cookie]) {
        const res = await get(photo.url, cookie);
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toBe('image/webp');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['cache-control']).toMatch(/private/);
        expect(res.headers['content-security-policy']).toContain("default-src 'none'");
        expect(res.headers.etag).toMatch(/^"[0-9a-f]{64}"$/);
        expect(res.rawPayload.subarray(0, 4).toString()).toBe('RIFF');
        expect(res.rawPayload.length).toBe(photo.sizeBytes);
      }
    });

    it('responde 304 con If-None-Match sin reenviar la imagen', async () => {
      const productId = await newProduct();
      const photo = await uploadOk(productId);
      const first = await get(photo.url);
      const etag = String(first.headers.etag);
      const cached = await get(photo.url, manager.cookie, { 'if-none-match': etag });
      expect(cached.statusCode).toBe(304);
      expect(cached.rawPayload.length).toBe(0);
      const stale = await get(photo.url, manager.cookie, { 'if-none-match': '"otro"' });
      expect(stale.statusCode).toBe(200);
    });

    it('exige sesión (401) y no mezcla fotos de otro producto (404)', async () => {
      const productId = await newProduct('Uno');
      const other = await newProduct('Dos');
      const photo = await uploadOk(productId);
      expect((await get(photo.url, '')).statusCode).toBe(401);
      expect((await get(`/api/v1/products/${other}/photos/${photo.id}`)).statusCode).toBe(404);
      expect((await get(`/api/v1/products/${productId}/photos/${MISSING}`)).statusCode).toBe(404);
    });

    it('un usuario sin catalog:read no ve fotos (403)', async () => {
      const productId = await newProduct();
      const photo = await uploadOk(productId);
      const nobody = await session([]);
      expect((await get(photo.url, nobody.cookie)).statusCode).toBe(403);
      expect((await get(`/api/v1/products/${productId}/photos`, nobody.cookie)).statusCode).toBe(
        403,
      );
    });
  });

  describe('listados sin bytes', () => {
    it('el producto, el listado y la lista de fotos traen solo metadatos', async () => {
      const productId = await newProduct();
      const photo = await uploadOk(productId);
      const second = await uploadOk(productId, 'webp');
      for (const url of ['/api/v1/products', `/api/v1/products/${productId}`]) {
        const res = await get(url, reader.cookie);
        expect(res.statusCode).toBe(200);
        expect(res.body.length).toBeLessThan(6000);
        const data = res.json().data;
        const product = Array.isArray(data) ? data[0] : data;
        expect(product.photos).toEqual([
          expect.objectContaining({ id: photo.id, isCover: true, position: 0 }),
          expect.objectContaining({ id: second.id, isCover: false, position: 1 }),
        ]);
        expect(res.body).not.toContain('"bytes"');
      }
    });
  });

  describe('portada, orden y borrado', () => {
    it('solo hay una portada: marcar otra la mueve', async () => {
      const productId = await newProduct();
      const a = await uploadOk(productId);
      const b = await uploadOk(productId);
      expect([a.isCover, b.isCover]).toEqual([true, false]);
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/products/${productId}/photos/${b.id}/cover`,
        headers: { cookie: manager.cookie },
      });
      expect(res.statusCode).toBe(200);
      const photos = res.json().data as PhotoDto[];
      expect(photos.filter((photo) => photo.isCover).map((photo) => photo.id)).toEqual([b.id]);
      expect(await app.prisma.productPhoto.count({ where: { productId, isCover: true } })).toBe(1);
      const audit = await app.prisma.auditLog.findFirstOrThrow({
        where: { action: 'product.photo_cover_changed' },
      });
      expect(audit.after).toEqual({ coverPhotoId: b.id });
    });

    it('el índice único impide dos portadas en la base', async () => {
      const productId = await newProduct();
      await uploadOk(productId);
      const b = await uploadOk(productId);
      await expect(
        app.prisma.productPhoto.update({ where: { id: b.id }, data: { isCover: true } }),
      ).rejects.toThrow();
    });

    it('reordena y exige el conjunto exacto de fotos', async () => {
      const productId = await newProduct();
      const a = await uploadOk(productId);
      const b = await uploadOk(productId);
      const c = await uploadOk(productId);
      const reorder = (photoIds: string[], cookie = manager.cookie) =>
        app.inject({
          method: 'PUT',
          url: `/api/v1/products/${productId}/photos/order`,
          headers: { cookie },
          payload: { photoIds },
        });
      const res = await reorder([c.id, a.id, b.id]);
      expect(res.statusCode).toBe(200);
      expect((res.json().data as PhotoDto[]).map((photo) => [photo.id, photo.position])).toEqual([
        [c.id, 0],
        [a.id, 1],
        [b.id, 2],
      ]);
      expect((await reorder([a.id, b.id])).statusCode).toBe(400);
      expect((await reorder([a.id, a.id, b.id])).statusCode).toBe(400);
      expect((await reorder([a.id, b.id, MISSING])).statusCode).toBe(400);
      expect((await reorder([])).statusCode).toBe(400);
      expect((await reorder([a.id, b.id, c.id], reader.cookie)).statusCode).toBe(403);
      expect((await reorder([a.id, b.id, c.id], '')).statusCode).toBe(401);
      expect(
        await app.prisma.auditLog.count({ where: { action: 'product.photos_reordered' } }),
      ).toBe(1);
    });

    it('elimina la foto y sus bytes; si era la portada, pasa a la primera restante', async () => {
      const productId = await newProduct();
      const a = await uploadOk(productId);
      const b = await uploadOk(productId);
      const c = await uploadOk(productId);
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/products/${productId}/photos/${a.id}`,
        headers: { cookie: manager.cookie },
      });
      expect(res.statusCode).toBe(200);
      const photos = res.json().data as PhotoDto[];
      expect(photos.map((photo) => [photo.id, photo.position, photo.isCover])).toEqual([
        [b.id, 0, true],
        [c.id, 1, false],
      ]);
      expect(await app.prisma.productPhotoBlob.count({ where: { photoId: a.id } })).toBe(0);
      expect((await get(a.url)).statusCode).toBe(404);
      const audit = await app.prisma.auditLog.findFirstOrThrow({
        where: { action: 'product.photo_removed' },
      });
      expect(audit.entityId).toBe(productId);
    });

    it('el Vendedor no puede borrar ni marcar portada (403) y sin sesión es 401', async () => {
      const productId = await newProduct();
      const a = await uploadOk(productId);
      const calls = [
        { method: 'DELETE', url: `/api/v1/products/${productId}/photos/${a.id}` },
        { method: 'PUT', url: `/api/v1/products/${productId}/photos/${a.id}/cover` },
      ] as const;
      for (const request of calls) {
        const res = await app.inject({ ...request, headers: { cookie: reader.cookie } });
        expect(res.statusCode).toBe(403);
        const anonymous = await app.inject(request);
        expect(anonymous.statusCode).toBe(401);
      }
      expect(await listPhotos(productId)).toHaveLength(1);
    });

    it('404 al borrar o marcar una foto inexistente', async () => {
      const productId = await newProduct();
      for (const method of ['DELETE', 'PUT'] as const) {
        const url =
          method === 'DELETE'
            ? `/api/v1/products/${productId}/photos/${MISSING}`
            : `/api/v1/products/${productId}/photos/${MISSING}/cover`;
        const res = await app.inject({ method, url, headers: { cookie: manager.cookie } });
        expect(res.statusCode).toBe(404);
      }
    });
  });

  describe('eliminación física del producto (B11)', () => {
    it('elimina también las fotos y sus bytes', async () => {
      const admin = await session([...MANAGER, PERMISSIONS.CATALOG_DELETE]);
      const productId = await newProduct();
      await uploadOk(productId);
      await uploadOk(productId, 'png');
      expect(await app.prisma.productPhotoBlob.count()).toBe(2);
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/products/${productId}`,
        headers: { cookie: admin.cookie },
      });
      expect(res.statusCode).toBe(200);
      expect(await app.prisma.productPhoto.count()).toBe(0);
      expect(await app.prisma.productPhotoBlob.count()).toBe(0);
    });
  });
});
