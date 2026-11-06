import type { ChangePasswordInput, LoginInput } from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import { UnauthenticatedError, ValidationError } from '../../lib/errors.ts';
import { hashPassword, verifyPassword } from '../../lib/password.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { generateSessionToken, hashToken } from '../../lib/tokens.ts';
import { recordAudit } from '../audit/audit.service.ts';

const INVALID_CREDENTIALS = 'Correo o contraseña incorrectos';

// Hash ficticio para que un correo inexistente tarde lo mismo que una contraseña incorrecta
// (evita enumerar usuarios midiendo tiempos de respuesta).
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword('dummy-password-for-timing'));

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly sessionTtlHours: number,
  ) {}

  async login(input: LoginInput, request: FastifyRequest) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const passwordOk = await verifyPassword(
      user?.passwordHash ?? (await getDummyHash()),
      input.password,
    );

    if (!user || !passwordOk || !user.isActive) {
      await recordAudit(
        this.prisma,
        {
          action: 'auth.login_failed',
          userId: user?.id ?? null,
          metadata: {
            email: input.email,
            reason: !user ? 'unknown_user' : !passwordOk ? 'bad_password' : 'inactive_user',
          },
        },
        request,
      );
      request.log.warn({ email: input.email }, 'security: intento de login fallido');
      throw new UnauthenticatedError(INVALID_CREDENTIALS);
    }

    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + this.sessionTtlHours * 60 * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.session.create({
        data: {
          tokenHash: hashToken(token),
          userId: user.id,
          expiresAt,
          ip: request.ip,
          userAgent: request.headers['user-agent']?.slice(0, 500) ?? null,
        },
      });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await recordAudit(tx, { action: 'auth.login', userId: user.id }, request);
    });

    return { token, expiresAt, mustChangePassword: user.mustChangePassword };
  }

  async logout(sessionId: string, userId: string, request: FastifyRequest) {
    await this.prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await recordAudit(tx, { action: 'auth.logout', userId }, request);
    });
  }

  async changePassword(userId: string, input: ChangePasswordInput, request: FastifyRequest) {
    await this.prisma.$transaction(async (tx) => {
      // Serializa cambios de contraseña y altas/bajas de acceso del mismo usuario.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || !user.isActive) throw new UnauthenticatedError();
      if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
        throw new ValidationError('Contraseña actual incorrecta');
      }
      // Con clave temporal (F2) la nueva debe ser distinta: si no, el restablecimiento no serviría.
      if (user.mustChangePassword && input.newPassword === input.currentPassword) {
        throw new ValidationError('La nueva contraseña debe ser distinta de la temporal');
      }
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false },
      });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await recordAudit(
        tx,
        { action: 'user.password_changed', userId, entityType: 'User', entityId: userId },
        request,
      );
    });
  }
}
