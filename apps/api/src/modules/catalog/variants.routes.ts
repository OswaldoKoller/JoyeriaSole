import { PERMISSIONS, variantLookupSchema } from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getAuth } from '../../plugins/auth.ts';
import { ProductsService } from './products.service.ts';

/**
 * Búsqueda unificada de piezas (Q-10): SKU, código de barras o código del proveedor.
 * El lector se comporta como teclado (texto + Enter), así que el cliente solo envía el texto.
 * Se monta en `/api/v1/catalog/variants`.
 */
export const catalogVariantsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new ProductsService(app.prisma);
  app.get(
    '/lookup',
    {
      preValidation: app.requirePermission(PERMISSIONS.CATALOG_READ),
      schema: {
        querystring: z.object({ code: z.string().trim().min(1).max(64) }),
        response: { 200: z.object({ data: variantLookupSchema }) },
      },
    },
    async (request) => ({
      data: await service.lookupVariant(
        request.query.code,
        getAuth(request).user.permissions.includes(PERMISSIONS.INVENTORY_READ),
      ),
    }),
  );
};
