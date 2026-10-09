import type { AuthUser, Permission, RoleCode } from '@joyeria/shared';
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import fp from 'fastify-plugin';
import type { Env } from '../config/env.ts';
import { ForbiddenError, UnauthenticatedError } from '../lib/errors.ts';
import type { PrismaClient } from '../lib/prisma.ts';
import { hashToken } from '../lib/tokens.ts';

export interface RequestAuth {
  user: AuthUser;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** preHandler: exige sesión válida. */
    authenticate: preHandlerAsyncHookHandler;
    /** preHandler: exige sesión válida y TODOS los permisos indicados. */
    requirePermission: (...permissions: Permission[]) => preHandlerAsyncHookHandler;
    sessionCookie: SessionCookieHelpers;
  }
  interface FastifyRequest {
    auth: RequestAuth | null;
  }
}

interface SessionCookieHelpers {
  name: string;
  set: (reply: FastifyReply, token: string, expiresAt: Date) => void;
  clear: (reply: FastifyReply) => void;
}

/**
 * Devuelve la sesión de una petición ya protegida con `authenticate`/`requirePermission`.
 * Si se usa en una ruta sin protección, falla con 401 en vez de continuar sin usuario.
 */
export function getAuth(request: FastifyRequest): RequestAuth {
  if (!request.auth) throw new UnauthenticatedError();
  return request.auth;
}

/** Evita escribir en BD en cada request: lastSeenAt se refresca como máximo cada 5 minutos. */
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export async function loadSessionUser(
  prisma: PrismaClient,
  token: string,
): Promise<RequestAuth | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          roles: {
            include: { role: { include: { permissions: { include: { permission: true } } } } },
          },
        },
      },
    },
  });

  const now = new Date();
  if (!session || session.revokedAt || session.expiresAt <= now || !session.user.isActive) {
    return null;
  }

  if (now.getTime() - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  }

  const roles = session.user.roles.map((userRole) => userRole.role.code as RoleCode);
  const permissions = new Set<Permission>();
  for (const { role } of session.user.roles) {
    for (const { permission } of role.permissions) permissions.add(permission.code as Permission);
  }

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      roles,
      permissions: [...permissions].sort(),
    },
  };
}

export const authPlugin = fp<{ env: Env }>(
  async (app, { env }) => {
    // `__Host-` obliga al navegador a exigir Secure + Path=/ y sin Domain (cookie atada al host).
    const cookieName = env.COOKIE_SECURE ? '__Host-sid' : 'sid';

    app.decorate('sessionCookie', {
      name: cookieName,
      set(reply, token, expiresAt) {
        reply.setCookie(cookieName, token, {
          httpOnly: true,
          secure: env.COOKIE_SECURE,
          sameSite: 'strict',
          path: '/',
          expires: expiresAt,
          signed: true,
        });
      },
      clear(reply) {
        reply.clearCookie(cookieName, { path: '/' });
      },
    });

    app.decorateRequest('auth', null);

    async function resolveAuth(request: FastifyRequest): Promise<RequestAuth | null> {
      if (request.auth) return request.auth;
      const raw = request.cookies[cookieName];
      if (!raw) return null;
      const unsigned = request.unsignCookie(raw);
      if (!unsigned.valid || !unsigned.value) return null;
      request.auth = await loadSessionUser(app.prisma, unsigned.value);
      return request.auth;
    }

    const authenticate: preHandlerAsyncHookHandler = async (request) => {
      if (!(await resolveAuth(request))) throw new UnauthenticatedError();
    };
    app.decorate('authenticate', authenticate);

    app.decorate('requirePermission', (...required: Permission[]) => {
      const handler: preHandlerAsyncHookHandler = async (request) => {
        const auth = await resolveAuth(request);
        if (!auth) throw new UnauthenticatedError();
        const missing = required.filter((p) => !auth.user.permissions.includes(p));
        if (missing.length > 0) {
          request.log.warn(
            { userId: auth.user.id, missing, url: request.url },
            'security: acceso denegado por permisos',
          );
          throw new ForbiddenError();
        }
      };
      return handler;
    });
  },
  { name: 'auth', dependencies: ['prisma'] },
);
