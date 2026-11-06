import type { AuthUser, Permission, RoleCode } from '@joyeria/shared';
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import fp from 'fastify-plugin';
import type { Env } from '../config/env.ts';
import {
  ForbiddenError,
  PasswordChangeRequiredError,
  UnauthenticatedError,
} from '../lib/errors.ts';
import type { PrismaClient } from '../lib/prisma.ts';
import { hashToken } from '../lib/tokens.ts';

export interface RequestAuth {
  user: AuthUser;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * preHandler: exige sesión válida. Lo usan solo las rutas `/auth/*`, que también atienden a
     * quien tiene una clave temporal pendiente de cambio.
     */
    authenticate: preHandlerAsyncHookHandler;
    /**
     * preHandler: exige sesión válida y TODOS los permisos indicados. Mientras la clave sea
     * temporal (mustChangePassword) responde 403 PASSWORD_CHANGE_REQUIRED sin evaluar permisos.
     */
    requirePermission: (...permissions: Permission[]) => preHandlerAsyncHookHandler;
    /**
     * Igual que `requirePermission`, pero basta AL MENOS UNO de los permisos indicados (p. ej.
     * solicitar o aprobar precios). También responde 403 PASSWORD_CHANGE_REQUIRED con clave temporal.
     */
    requireAnyPermission: (...permissions: Permission[]) => preHandlerAsyncHookHandler;
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

interface SessionRow {
  session_id: string;
  revoked_at: Date | null;
  expires_at: Date;
  last_seen_at: Date;
  user_id: string;
  email: string;
  name: string;
  is_active: boolean;
  must_change_password: boolean;
  roles: string[];
  permissions: string[];
}

/** Evita escribir en BD en cada request: lastSeenAt se refresca como máximo cada 5 minutos. */
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export async function loadSessionUser(
  prisma: PrismaClient,
  token: string,
): Promise<RequestAuth | null> {
  // Sin caché (la revocación y los cambios de permisos rigen de inmediato) y con UNA sola consulta
  // (sesión + usuario + roles + permisos) que devuelve únicamente las columnas necesarias:
  // nunca se trae passwordHash. SQL con plantilla etiquetada: nada se concatena.
  const [row] = await prisma.$queryRaw<SessionRow[]>`
    SELECT s.id AS session_id, s.revoked_at, s.expires_at, s.last_seen_at,
           u.id AS user_id, u.email, u.name, u.is_active, u.must_change_password,
           COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles,
           COALESCE(array_agg(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    LEFT JOIN permissions p ON p.id = rp.permission_id
    WHERE s.token_hash = ${hashToken(token)}
    GROUP BY s.id, u.id`;

  const now = new Date();
  if (!row || row.revoked_at || row.expires_at <= now || !row.is_active) return null;

  if (now.getTime() - row.last_seen_at.getTime() > LAST_SEEN_THROTTLE_MS) {
    await prisma.session.update({ where: { id: row.session_id }, data: { lastSeenAt: now } });
  }

  return {
    sessionId: row.session_id,
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name,
      roles: [...row.roles].sort() as RoleCode[],
      permissions: [...row.permissions].sort() as Permission[],
      mustChangePassword: row.must_change_password,
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
        // Mismos atributos que al crearla: con el prefijo `__Host-` el navegador ignoraría el
        // borrado si no lleva Secure.
        reply.clearCookie(cookieName, {
          httpOnly: true,
          secure: env.COOKIE_SECURE,
          sameSite: 'strict',
          path: '/',
          signed: true,
        });
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
        if (auth.user.mustChangePassword) throw new PasswordChangeRequiredError();
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

    app.decorate('requireAnyPermission', (...allowed: Permission[]) => {
      const handler: preHandlerAsyncHookHandler = async (request) => {
        const auth = await resolveAuth(request);
        if (!auth) throw new UnauthenticatedError();
        if (auth.user.mustChangePassword) throw new PasswordChangeRequiredError();
        if (!allowed.some((p) => auth.user.permissions.includes(p))) {
          request.log.warn(
            { userId: auth.user.id, required: allowed, url: request.url },
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
