import {
  BUSINESS_SETTINGS_DEFAULTS,
  type BusinessSettings,
  type UpdateBusinessSettingsInput,
} from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { getAuth } from '../../plugins/auth.ts';
import { recordAudit } from '../audit/audit.service.ts';

type Db = PrismaClient | Prisma.TransactionClient;

/** Id del registro único de `business_settings` (CHECK id = 1). */
const SETTINGS_ID = 1;

/**
 * Datos del negocio vigentes. Si la fila no existe (base recién vaciada) se usan los valores
 * provisionales `BUSINESS_SETTINGS_DEFAULTS` (D-07) sin escribir nada: leer nunca modifica.
 */
export async function readBusinessSettings(db: Db): Promise<BusinessSettings> {
  const row = await db.businessSettings.findUnique({
    where: { id: SETTINGS_ID },
    include: { updatedBy: { select: { id: true, name: true } } },
  });
  if (!row) return { ...BUSINESS_SETTINGS_DEFAULTS, updatedAt: null, updatedBy: null };
  return {
    tradeName: row.tradeName,
    address: row.address,
    phone: row.phone,
    taxId: row.taxId,
    receiptShowSeller: row.receiptShowSeller,
    // Hasta la primera edición la fila es la sembrada: sin autor ni fecha de edición.
    updatedAt: row.updatedById ? row.updatedAt.toISOString() : null,
    updatedBy: row.updatedBy,
  };
}

/**
 * Datos comerciales del comprobante (C1, C2; ADR-024). Solo el Administrador (`settings:manage`);
 * al resto de roles llegan únicamente dentro del comprobante.
 */
export class BusinessSettingsService {
  constructor(private readonly prisma: PrismaClient) {}

  get(): Promise<BusinessSettings> {
    return readBusinessSettings(this.prisma);
  }

  async update(
    input: UpdateBusinessSettingsInput,
    request: FastifyRequest,
  ): Promise<BusinessSettings> {
    const { user } = getAuth(request);
    return this.prisma.$transaction(async (tx) => {
      // Serializa ediciones simultáneas (sin fila todavía, el upsert lo resuelve el índice primario).
      await tx.$queryRaw`SELECT id FROM business_settings WHERE id = ${SETTINGS_ID} FOR UPDATE`;
      const before = await readBusinessSettings(tx);
      const data = {
        tradeName: input.tradeName,
        address: input.address ?? null,
        phone: input.phone ?? null,
        taxId: input.taxId ?? null,
        receiptShowSeller: input.receiptShowSeller,
        updatedById: user.id,
        updatedAt: new Date(),
      };
      await tx.businessSettings.upsert({
        where: { id: SETTINGS_ID },
        update: data,
        create: { id: SETTINGS_ID, ...data },
      });
      const after = await readBusinessSettings(tx);
      const audited = (settings: BusinessSettings) => ({
        tradeName: settings.tradeName,
        address: settings.address,
        phone: settings.phone,
        taxId: settings.taxId,
        receiptShowSeller: settings.receiptShowSeller,
      });
      await recordAudit(
        tx,
        {
          action: 'business_settings.updated',
          entityType: 'BusinessSettings',
          entityId: String(SETTINGS_ID),
          before: audited(before),
          after: audited(after),
        },
        request,
      );
      return after;
    });
  }
}
