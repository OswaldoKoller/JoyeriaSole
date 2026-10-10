import type { AssignUserRolesInput, CreateUserInput, UpdateUserInput } from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.ts';
import { BusinessRuleError, NotFoundError, ValidationError } from '../../lib/errors.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { hashPassword } from '../../lib/password.ts';
import { recordAudit } from '../audit/audit.service.ts';

const withRoles = { roles: { include: { role: true } } } satisfies Prisma.UserInclude;
type UserWithRoles = Prisma.UserGetPayload<{ include: typeof withRoles }>;

function toResponse(user: UserWithRoles) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isActive: user.isActive,
    roles: user.roles.map(({ role }) => ({ code: role.code, name: role.name })),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export class UsersService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateUserInput, request: FastifyRequest) {
    const passwordHash = await hashPassword(input.password);
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.role.count({ where: { id: { in: input.roleIds } } });
      if (found !== input.roleIds.length) throw new ValidationError('Uno o más roles no existen');
      const user = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash,
          roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
        },
        include: withRoles,
      });
      const after = toResponse(user);
      await recordAudit(
        tx,
        { action: 'user.created', entityType: 'User', entityId: user.id, after },
        request,
      );
      return after;
    });
  }

  async roles() {
    return this.prisma.role.findMany({
      select: { id: true, code: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async list(input: { page: number; pageSize: number; q: string; status: string }) {
    const where = {
      ...(input.status !== 'all' && { isActive: input.status === 'active' }),
      ...(input.q && {
        OR: [
          { name: { contains: input.q, mode: 'insensitive' as const } },
          { email: { contains: input.q, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: withRoles,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data: users.map(toResponse),
      meta: { page: input.page, pageSize: input.pageSize, total },
    };
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: withRoles });
    if (!user) throw new NotFoundError('Usuario no encontrado');
    return toResponse(user);
  }

  private async lockedUser(tx: Prisma.TransactionClient, id: string) {
    // El bloqueo del rol ADMIN serializa operaciones que podrían quitar el último administrador.
    await tx.$queryRaw`SELECT id FROM roles WHERE code = 'ADMIN' FOR UPDATE`;
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundError('Usuario no encontrado');
    return tx.user.findUniqueOrThrow({ where: { id }, include: withRoles });
  }

  private async protectLastAdmin(tx: Prisma.TransactionClient, previous: UserWithRoles) {
    if (!previous.isActive || !previous.roles.some(({ role }) => role.code === 'ADMIN')) return;
    const count = await tx.user.count({
      where: { isActive: true, roles: { some: { role: { code: 'ADMIN' } } } },
    });
    if (count <= 1)
      throw new BusinessRuleError('No se puede quitar el último administrador activo');
  }

  async update(id: string, input: UpdateUserInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.lockedUser(tx, id);
      if (input.isActive === false && previous.isActive) await this.protectLastAdmin(tx, previous);
      const next = await tx.user.update({ where: { id }, data: input, include: withRoles });
      if (input.isActive === false && previous.isActive) {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      const before = toResponse(previous);
      const after = toResponse(next);
      await recordAudit(
        tx,
        {
          action:
            previous.isActive !== next.isActive
              ? next.isActive
                ? 'user.activated'
                : 'user.deactivated'
              : 'user.updated',
          entityType: 'User',
          entityId: id,
          before,
          after,
        },
        request,
      );
      return after;
    });
  }

  async assignRoles(id: string, input: AssignUserRolesInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.lockedUser(tx, id);
      const roles = await tx.role.findMany({
        where: { id: { in: input.roleIds } },
        select: { id: true, code: true },
      });
      if (roles.length !== input.roleIds.length)
        throw new ValidationError('Uno o más roles no existen');
      const removesAdmin =
        previous.roles.some(({ role }) => role.code === 'ADMIN') &&
        !roles.some((role) => role.code === 'ADMIN');
      if (removesAdmin) await this.protectLastAdmin(tx, previous);
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({
        data: input.roleIds.map((roleId) => ({ userId: id, roleId })),
      });
      const next = await tx.user.findUniqueOrThrow({ where: { id }, include: withRoles });
      const before = toResponse(previous);
      const after = toResponse(next);
      await recordAudit(
        tx,
        { action: 'user.roles_updated', entityType: 'User', entityId: id, before, after },
        request,
      );
      return after;
    });
  }
}
