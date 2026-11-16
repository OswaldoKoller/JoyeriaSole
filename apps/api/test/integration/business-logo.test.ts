/**
 * Logo del negocio y leyenda del comprobante (ADR-024, ADR-026). Solo el Administrador sube o quita
 * el logo; quien ve comprobantes puede verlo. La imagen se valida por su contenido, se reduce y se
 * guarda re-codificada como WebP (sin metadatos).
 */
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  LOGO_MAX_HEIGHT_PX,
  LOGO_MAX_WIDTH_PX,
  MAX_LOGO_UPLOAD_BYTES,
  RECEIPT_POLICY_NOTE,
  type Permission,
} from '@joyeria/shared';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../../src/app.ts';
import { buildTestApp, login } from '../helpers/app.ts';
import { createTestUser, resetDatabase } from '../helpers/db.ts';
import { makeImage, multipartPayload } from '../helpers/images.ts';
import { seedBusinessSettings } from '../helpers/sales.ts';

const SETTINGS = '/api/v1/settings/business';
const LOGO = `${SETTINGS}/logo`;

// Cada escenario crea usuarios con Argon2 y varias sesiones: en una PC lenta supera los 20 s por defecto.
vi.setConfig({ testTimeout: 120_000 });

let app: App;
beforeEach(async () => {
  app = await buildTestApp();
  await resetDatabase(app.prisma);
});
afterEach(() => app.close());

async function sessionWith(permissions: Permission[]) {
  const { user, password } = await createTestUser(app.prisma, { permissions });
  const { cookie } = await login(app, user.email, password);
  return { user, cookie };
}

function upload(
  cookie: string,
  file: { name: string; type: string; bytes: Uint8Array } | null,
  fieldName?: string,
) {
  const { payload, contentType } = multipartPayload(file, { fieldName });
  return app.inject({
    method: 'PUT',
    url: LOGO,
    headers: { cookie, 'content-type': contentType },
    payload,
  });
}

const png = async (width = 1200, height = 600) => ({
  name: 'logo.png',
  type: 'image/png',
  bytes: await makeImage('png', width, height),
});

describe('permisos', () => {
  it('401 sin sesión; 403 para subir o quitar sin settings:manage', async () => {
    expect((await app.inject({ method: 'GET', url: LOGO })).statusCode).toBe(401);
    expect((await app.inject({ method: 'PUT', url: LOGO })).statusCode).toBe(401);
    expect((await app.inject({ method: 'DELETE', url: LOGO })).statusCode).toBe(401);
    for (const permissions of [
      DEFAULT_ROLE_PERMISSIONS.SELLER.permissions,
      DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER.permissions,
    ]) {
      const { cookie } = await sessionWith([...permissions]);
      expect((await upload(cookie, await png())).statusCode).toBe(403);
      expect(
        (await app.inject({ method: 'DELETE', url: LOGO, headers: { cookie } })).statusCode,
      ).toBe(403);
    }
  });

  it('quien ve comprobantes puede ver el logo; quien no, 403', async () => {
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    expect((await upload(admin.cookie, await png())).statusCode).toBe(200);
    const seller = await sessionWith([...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions]);
    const nobody = await sessionWith(['catalog:read']);
    expect(
      (await app.inject({ method: 'GET', url: LOGO, headers: { cookie: seller.cookie } }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: LOGO, headers: { cookie: nobody.cookie } }))
        .statusCode,
    ).toBe(403);
  });
});

describe('subida del logo', () => {
  it('404 mientras no hay logo', async () => {
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    expect(
      (await app.inject({ method: 'GET', url: LOGO, headers: { cookie: admin.cookie } }))
        .statusCode,
    ).toBe(404);
    const settings = await app.inject({
      method: 'GET',
      url: SETTINGS,
      headers: { cookie: admin.cookie },
    });
    expect(settings.json().data.logo).toBeNull();
  });

  it('guarda el logo reducido como WebP, lo sirve con ETag y 304, y lo audita', async () => {
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    const res = await upload(admin.cookie, await png(1200, 600));
    expect(res.statusCode).toBe(200);
    const logo = res.json().data.logo as {
      sha256: string;
      width: number;
      height: number;
      sizeBytes: number;
    };
    expect(logo.width).toBeLessThanOrEqual(LOGO_MAX_WIDTH_PX);
    expect(logo.height).toBeLessThanOrEqual(LOGO_MAX_HEIGHT_PX);
    expect(logo.sha256).toMatch(/^[0-9a-f]{64}$/);

    const served = await app.inject({
      method: 'GET',
      url: LOGO,
      headers: { cookie: admin.cookie },
    });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/webp');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers.etag).toBe(`"${logo.sha256}"`);
    expect((await sharp(served.rawPayload).metadata()).format).toBe('webp');
    expect(served.rawPayload.length).toBe(logo.sizeBytes);

    const cached = await app.inject({
      method: 'GET',
      url: LOGO,
      headers: { cookie: admin.cookie, 'if-none-match': `"${logo.sha256}"` },
    });
    expect(cached.statusCode).toBe(304);

    const audit = await app.prisma.auditLog.findFirstOrThrow({
      where: { action: 'business_logo.updated' },
    });
    expect(audit.userId).toBe(admin.user.id);
    expect(JSON.stringify(audit.after)).not.toContain('bytes');
  });

  it('no amplía un logo pequeño y elimina los metadatos (EXIF)', async () => {
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    const bytes = await makeImage('jpeg', 200, 100, { withExif: true });
    const res = await upload(admin.cookie, { name: 'logo.jpg', type: 'image/jpeg', bytes });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.logo).toMatchObject({ width: 200, height: 100 });
    const served = await app.inject({
      method: 'GET',
      url: LOGO,
      headers: { cookie: admin.cookie },
    });
    expect((await sharp(served.rawPayload).metadata()).exif).toBeUndefined();
  });

  it('cambiar el logo reemplaza el anterior (una sola fila)', async () => {
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    const first = (await upload(admin.cookie, await png(300, 100))).json().data.logo.sha256;
    const blue = await makeImage('png', 300, 100, { color: '#0000ff' });
    const second = (
      await upload(admin.cookie, { name: 'otro.png', type: 'image/png', bytes: blue })
    ).json().data.logo.sha256;
    expect(second).not.toBe(first);
    expect(await app.prisma.businessLogo.count()).toBe(1);
  });

  it('rechaza lo que no es una imagen válida, aunque se llame .png', async () => {
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    const cases = [
      {
        name: 'logo.png',
        type: 'image/png',
        bytes: Buffer.from('esto no es una imagen, es texto'),
      },
      {
        name: 'logo.png',
        type: 'image/png',
        bytes: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        ),
      },
      {
        name: 'logo.png',
        type: 'image/png',
        bytes: Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00ejecutable'),
      },
    ];
    for (const file of cases) {
      const res = await upload(admin.cookie, file);
      expect(res.statusCode).toBe(400);
    }
    expect(await app.prisma.businessLogo.count()).toBe(0);
  });

  it('rechaza archivo vacío, campo con otro nombre, no multipart y archivos demasiado grandes', async () => {
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    expect(
      (await upload(admin.cookie, { name: 'a.png', type: 'image/png', bytes: Buffer.alloc(0) }))
        .statusCode,
    ).toBe(400);
    expect((await upload(admin.cookie, await png(), 'otro')).statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: LOGO,
          headers: { cookie: admin.cookie },
          payload: { file: 'x' },
        })
      ).statusCode,
    ).toBe(400);
    const huge = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(MAX_LOGO_UPLOAD_BYTES + 1024),
    ]);
    expect(
      (await upload(admin.cookie, { name: 'enorme.png', type: 'image/png', bytes: huge }))
        .statusCode,
    ).toBe(413);
    expect(await app.prisma.businessLogo.count()).toBe(0);
  });
});

describe('quitar el logo', () => {
  it('lo elimina, lo audita y un segundo intento es 404', async () => {
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    await upload(admin.cookie, await png());
    const res = await app.inject({
      method: 'DELETE',
      url: LOGO,
      headers: { cookie: admin.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.logo).toBeNull();
    expect(await app.prisma.businessLogo.count()).toBe(0);
    expect(await app.prisma.auditLog.count({ where: { action: 'business_logo.removed' } })).toBe(1);
    expect(
      (await app.inject({ method: 'DELETE', url: LOGO, headers: { cookie: admin.cookie } }))
        .statusCode,
    ).toBe(404);
  });
});

describe('leyenda al pie del comprobante', () => {
  const put = (cookie: string, payload: unknown) =>
    app.inject({ method: 'PUT', url: SETTINGS, headers: { cookie }, payload: payload as object });
  const base = { tradeName: 'Joyería Sole', receiptShowSeller: false };

  it('por defecto es la política de la tienda: sin devoluciones, solo cambio de pieza', async () => {
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    await seedBusinessSettings(app.prisma);
    const res = await app.inject({
      method: 'GET',
      url: SETTINGS,
      headers: { cookie: admin.cookie },
    });
    expect(res.json().data.receiptFooterNote).toBe(RECEIPT_POLICY_NOTE);
    expect(RECEIPT_POLICY_NOTE).toMatch(/devoluciones/);
    expect(RECEIPT_POLICY_NOTE).toMatch(/cambios de pieza/);
  });

  it('se edita, se quita dejándola vacía y no admite más de 300 caracteres', async () => {
    const admin = await sessionWith([...ALL_PERMISSIONS]);
    const edited = await put(admin.cookie, {
      ...base,
      receiptFooterNote: '  Cambios con comprobante.  ',
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().data.receiptFooterNote).toBe('Cambios con comprobante.');
    const cleared = await put(admin.cookie, { ...base, receiptFooterNote: '   ' });
    expect(cleared.json().data.receiptFooterNote).toBeNull();
    const tooLong = await put(admin.cookie, { ...base, receiptFooterNote: 'x'.repeat(301) });
    expect(tooLong.statusCode).toBe(400);
  });
});
