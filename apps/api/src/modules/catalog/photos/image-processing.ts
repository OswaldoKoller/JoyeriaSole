import { createHash } from 'node:crypto';
import { PHOTO_MAX_SIDE_PX } from '@joyeria/shared';
import sharp from 'sharp';
import { ValidationError } from '../../../lib/errors.ts';

/** Formatos aceptados al subir, detectados por el CONTENIDO (firma de bytes), nunca por la extensión. */
export type DetectedImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/** Tipo con el que se guarda y se sirve toda foto (lista blanca de una sola entrada). */
export const STORED_PHOTO_TYPE = 'image/webp';
export const STORED_PHOTO_QUALITY = 82;
/** Tope de píxeles de la imagen decodificada (defensa contra «bombas de descompresión»). */
export const MAX_INPUT_PIXELS = 30_000_000;

// Sin caché interna de libvips: las fotos se procesan una vez y no se reutilizan.
sharp.cache(false);
sharp.concurrency(2);

/** Máximo de imágenes decodificándose a la vez: acota la memoria del contenedor único. */
const MAX_CONCURRENT_JOBS = 2;
let running = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(job: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT_JOBS) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  running += 1;
  try {
    return await job();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

/** Identifica JPEG, PNG o WebP por su firma. Devuelve `null` para cualquier otro contenido. */
export function detectImageType(bytes: Uint8Array): DetectedImageType | null {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png';
  // WebP: «RIFF» + tamaño (4 bytes) + «WEBP».
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }
  return null;
}

export interface ProcessedPhoto {
  bytes: Buffer;
  contentType: typeof STORED_PHOTO_TYPE;
  width: number;
  height: number;
  sizeBytes: number;
  sha256: string;
}

/**
 * Valida y reduce una foto subida (Q-09):
 *  1. Comprueba la firma del archivo (JPEG/PNG/WebP); lo demás se rechaza con 400.
 *  2. La decodifica y la RE-CODIFICA siempre como WebP: se descartan EXIF, GPS, perfiles ICC y
 *     cualquier contenido incrustado o añadido tras la imagen; se aplica la orientación EXIF.
 *  3. Reduce el lado mayor a ~1200 px sin ampliar imágenes pequeñas.
 * Solo se toma el primer fotograma (no se conservan animaciones).
 */
export async function processPhoto(input: Uint8Array): Promise<ProcessedPhoto> {
  const type = detectImageType(input);
  if (!type) {
    throw new ValidationError('El archivo no es una imagen válida. Use una foto JPG, PNG o WebP.');
  }
  try {
    const { data, info } = await withSlot(() =>
      sharp(input, {
        limitInputPixels: MAX_INPUT_PIXELS,
        failOn: 'error',
      })
        .rotate()
        .resize({
          width: PHOTO_MAX_SIDE_PX,
          height: PHOTO_MAX_SIDE_PX,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: STORED_PHOTO_QUALITY })
        .toBuffer({ resolveWithObject: true }),
    );
    return {
      bytes: data,
      contentType: STORED_PHOTO_TYPE,
      width: info.width,
      height: info.height,
      sizeBytes: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
    };
  } catch {
    // Archivo con firma válida pero dañado, truncado o demasiado grande en píxeles.
    throw new ValidationError(
      'No se pudo leer la imagen: está dañada o es demasiado grande. Pruebe con otra foto.',
    );
  }
}
