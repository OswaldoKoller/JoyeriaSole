import { PERMISSIONS, paymentMethodSchema } from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SalesService } from './sales.service.ts';

/** V1 · Medios de pago activos para cobrar (catálogo fijo, D-09). Bajo `/payment-methods`. */
export const paymentMethodsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new SalesService(app.prisma);

  app.get(
    '/',
    {
      preValidation: app.requirePermission(PERMISSIONS.SALES_CREATE),
      schema: { response: { 200: z.strictObject({ data: z.array(paymentMethodSchema) }) } },
    },
    async () => ({ data: await service.paymentMethods() }),
  );
};
