import { PERMISSIONS, pendingApprovalsSchema, type Permission } from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ForbiddenError } from '../../lib/errors.ts';
import { getAuth } from '../../plugins/auth.ts';
import { ApprovalsService } from './approvals.service.ts';

const APPROVE_PERMISSIONS: Permission[] = [
  PERMISSIONS.INVENTORY_ADJUST_APPROVE,
  PERMISSIONS.PRICES_APPROVE,
  PERMISSIONS.INVENTORY_COUNTS_APPROVE,
];

/**
 * Bandeja «Pendientes de aprobación» (Q-14): solo cuenta; cada total se calcula únicamente si la
 * persona tiene el permiso para resolver ese tipo de pendiente. Sin ninguno de ellos, 403.
 */
export const approvalsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new ApprovalsService(app.prisma);

  app.get(
    '/pending',
    {
      preValidation: [
        app.authenticate,
        async (request) => {
          const { user } = getAuth(request);
          if (
            user.mustChangePassword ||
            !APPROVE_PERMISSIONS.some((p) => user.permissions.includes(p))
          ) {
            throw new ForbiddenError();
          }
        },
      ],
      schema: { response: { 200: z.object({ data: pendingApprovalsSchema }) } },
    },
    async (request) => ({ data: await service.pending(getAuth(request).user.permissions) }),
  );
};
