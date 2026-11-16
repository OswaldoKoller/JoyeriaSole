import { createHash } from 'node:crypto';
import { LOGO_MAX_HEIGHT_PX, LOGO_MAX_WIDTH_PX, type BusinessSettings } from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import sharp from 'sharp';
import { NotFoundError, ValidationError } from '../../lib/errors.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { getAuth } from '../../plugins/auth.ts';
import { recordAudit } from '../audit/audit.service.ts';
import {
  MAX_INPUT_PIXELS,
  STORED_PHOTO_TYPE,
  detectImageType,
} from '../catalog/photos/image-processing.ts';
import { readBusinessSettings } from './business-settings.service.ts';

/** Id del registro único de `business_logo` (CHECK id = 1). */
const LOGO_ID = 1;
/** Calidad del WebP del logo: alta, porque es texto y líneas finas que se imprimen. */
const LOGO_QUALITY = 92;

export interface ProcessedLogo {
  bytes: Buffer;
  contentType: typeof STORED_PHOTO_TYPE;
  width: number;
  height: number;
  sizeBytes: number;
  sha256: string;
}

/**
 * Valida y reduce el logo subido:
 *  1. Comprueba la firma del archivo (JPEG, PNG o WebP); cualquier otro contenido (SVG, PDF, un
 *     ejecutable renombrado) se rechaza con 400.
 *  2. Lo decodifica y lo RE-CODIFICA como WebP: se descartan EXIF, perfiles ICC y contenido
 *     incrustado; la transparencia se conserva.
 *  3. Lo reduce para caber en 600 × 300 px, sin ampliarlo.
 */
export async function processLogo(input: Uint8Array): Promise<ProcessedLogo> {
  if (!detectImageType(input)) {
    throw new ValidationError('El archivo no es una imagen válida. Use un logo JPG, PNG o WebP.');
  }
  try {
    const { data, info } = await sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: 'error',
    })
      .rotate()
      .resize({
        width: LOGO_MAX_WIDTH_PX,
        height: LOGO_MAX_HEIGHT_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: LOGO_QUALITY, alphaQuality: 100 })
      .toBuffer({ resolveWithObject: true });
    return {
      bytes: data,
      contentType: STORED_PHOTO_TYPE,
      width: info.width,
      height: info.height,
      sizeBytes: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
    };
  } catch {
    throw new ValidationError(
      'No se pudo leer la imagen: está dañada o es demasiado grande. Pruebe con otro archivo.',
    );
  }
}

/**
 * Logo del negocio para el comprobante (registro único). Solo el Administrador lo cambia
 * (`settings:manage`); todo cambio queda en auditoría (sin los bytes).
 */
export class BusinessLogoService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Bytes y metadatos del logo vigente; 404 si no hay. */
  async read() {
    const logo = await this.prisma.businessLogo.findUnique({ where: { id: LOGO_ID } });
    if (!logo) throw new NotFoundError('El negocio no tiene logo.');
    return logo;
  }

  async replace(file: Buffer, request: FastifyRequest): Promise<BusinessSettings> {
    const processed = await processLogo(file);
    const { user } = getAuth(request);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.businessLogo.findUnique({
        where: { id: LOGO_ID },
        select: { sha256: true },
      });
      const data = {
        contentType: processed.contentType,
        width: processed.width,
        height: processed.height,
        sizeBytes: processed.sizeBytes,
        sha256: processed.sha256,
        bytes: new Uint8Array(processed.bytes),
        updatedAt: new Date(),
        updatedById: user.id,
      };
      await tx.businessLogo.upsert({
        where: { id: LOGO_ID },
        update: data,
        create: { id: LOGO_ID, ...data },
      });
      await recordAudit(
        tx,
        {
          action: 'business_logo.updated',
          entityType: 'BusinessLogo',
          entityId: String(LOGO_ID),
          ...(before && { before: { sha256: before.sha256 } }),
          after: {
            sha256: processed.sha256,
            width: processed.width,
            height: processed.height,
            sizeBytes: processed.sizeBytes,
          },
        },
        request,
      );
      return readBusinessSettings(tx);
    });
  }

  async remove(request: FastifyRequest): Promise<BusinessSettings> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.businessLogo.findUnique({
        where: { id: LOGO_ID },
        select: { sha256: true },
      });
      if (!before) throw new NotFoundError('El negocio no tiene logo.');
      await tx.businessLogo.delete({ where: { id: LOGO_ID } });
      await recordAudit(
        tx,
        {
          action: 'business_logo.removed',
          entityType: 'BusinessLogo',
          entityId: String(LOGO_ID),
          before: { sha256: before.sha256 },
        },
        request,
      );
      return readBusinessSettings(tx);
    });
  }
}
