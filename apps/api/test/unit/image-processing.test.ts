import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  detectImageType,
  processPhoto,
  STORED_PHOTO_TYPE,
} from '../../src/modules/catalog/photos/image-processing.ts';
import { makeImage } from '../helpers/images.ts';

describe('detectImageType (firma de bytes)', () => {
  it('reconoce JPEG, PNG y WebP por su contenido', async () => {
    expect(detectImageType(await makeImage('jpeg'))).toBe('image/jpeg');
    expect(detectImageType(await makeImage('png'))).toBe('image/png');
    expect(detectImageType(await makeImage('webp'))).toBe('image/webp');
  });

  it('rechaza otros contenidos aunque el nombre o el Content-Type digan lo contrario', () => {
    const text = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>');
    const gif = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!');
    const exe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00');
    const riffWave = Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt ');
    for (const bytes of [text, gif, exe, riffWave, Buffer.alloc(0), Buffer.from([0xff, 0xd8])]) {
      expect(detectImageType(bytes)).toBeNull();
    }
  });
});

describe('processPhoto', () => {
  it('reduce el lado mayor a 1200 px conservando la proporción', async () => {
    const processed = await processPhoto(await makeImage('jpeg', 3000, 2000));
    expect(processed).toMatchObject({ width: 1200, height: 800, contentType: STORED_PHOTO_TYPE });
    expect(processed.sizeBytes).toBe(processed.bytes.length);
    expect(processed.sha256).toMatch(/^[0-9a-f]{64}$/);
    const vertical = await processPhoto(await makeImage('png', 1000, 2400));
    expect(vertical).toMatchObject({ width: 500, height: 1200 });
  });

  it('no amplía las imágenes pequeñas', async () => {
    const processed = await processPhoto(await makeImage('webp', 300, 200));
    expect(processed).toMatchObject({ width: 300, height: 200 });
  });

  it('siempre re-codifica a WebP y elimina EXIF y otros metadatos', async () => {
    const source = await makeImage('jpeg', 600, 400, { withExif: true });
    expect((await sharp(source).metadata()).exif).toBeDefined();
    const processed = await processPhoto(source);
    const meta = await sharp(processed.bytes).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(processed.bytes.includes(Buffer.from('Secreto'))).toBe(false);
  });

  it('descarta contenido añadido tras la imagen (archivo políglota)', async () => {
    const payload = Buffer.from('<script>alert(1)</script>MARCA-OCULTA');
    const source = Buffer.concat([await makeImage('jpeg'), payload]);
    const processed = await processPhoto(source);
    expect(processed.bytes.includes(Buffer.from('MARCA-OCULTA'))).toBe(false);
  });

  it('rechaza (400) un archivo que no es imagen o está dañado', async () => {
    await expect(
      processPhoto(Buffer.from('esto no es una imagen, solo texto')),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
    const truncated = (await makeImage('png', 800, 800)).subarray(0, 60);
    await expect(processPhoto(truncated)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rechaza imágenes con demasiados píxeles', async () => {
    const huge = await sharp({
      create: { width: 9000, height: 8000, channels: 3, background: '#fff' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await expect(processPhoto(huge)).rejects.toMatchObject({ statusCode: 400 });
  });
});
