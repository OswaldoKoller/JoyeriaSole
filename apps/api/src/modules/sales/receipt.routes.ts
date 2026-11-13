import {
  PERMISSIONS,
  receiptPrintEventSchema,
  receiptPrintInputSchema,
  saleIdParamsSchema,
  saleReceiptSchema,
} from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idempotencyHeadersSchema } from '../../plugins/idempotency.ts';
import { ReceiptService } from './receipt.service.ts';
import { SalesService } from './sales.service.ts';

/**
 * Comprobante interno (plan 11 §4.5 V5/V6; ADR-024), bajo `/sales`. Lo ve y lo reimprime quien
 * puede ver la venta (D-06): propias con `sales:read`, todas con `sales:read-all`; ajena → 404.
 */
export const receiptRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new ReceiptService(app.prisma, new SalesService(app.prisma));
  const canRead = app.requireAnyPermission(PERMISSIONS.SALES_READ, PERMISSIONS.SALES_READ_ALL);

  app.get(
    '/:id/receipt',
    {
      preValidation: canRead,
      schema: {
        params: saleIdParamsSchema,
        response: { 200: z.strictObject({ data: saleReceiptSchema }) },
      },
    },
    async (request) => ({ data: await service.receipt(request.params.id, request) }),
  );

  app.post(
    '/:id/receipt/print-events',
    {
      preValidation: canRead,
      schema: {
        headers: idempotencyHeadersSchema,
        params: saleIdParamsSchema,
        body: receiptPrintInputSchema,
        response: {
          200: z.strictObject({ data: receiptPrintEventSchema }),
          201: z.strictObject({ data: receiptPrintEventSchema }),
        },
      },
    },
    async (request, reply) => {
      const data = await service.print(request.params.id, request.body, request);
      // Con Idempotency-Key repetida: el mismo evento, 200 + Idempotent-Replay (B-5).
      return reply.status(request.idempotentReplay ? 200 : 201).send({ data });
    },
  );
};
