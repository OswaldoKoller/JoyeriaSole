import { PERMISSIONS, businessSettingsSchema, updateBusinessSettingsSchema } from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { BusinessSettingsService } from './business-settings.service.ts';

const detail = z.strictObject({ data: businessSettingsSchema });

/** Datos del negocio (plan 11 §4.6 S1/S2), bajo `/settings`. Solo `settings:manage` (Administrador). */
export const businessSettingsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new BusinessSettingsService(app.prisma);

  app.get(
    '/business',
    {
      preValidation: app.requirePermission(PERMISSIONS.SETTINGS_MANAGE),
      schema: { response: { 200: detail } },
    },
    async () => ({ data: await service.get() }),
  );

  app.put(
    '/business',
    {
      preValidation: app.requirePermission(PERMISSIONS.SETTINGS_MANAGE),
      schema: { body: updateBusinessSettingsSchema, response: { 200: detail } },
    },
    async (request) => ({ data: await service.update(request.body, request) }),
  );
};
