import {
  adminOnlyPermissionsIn,
  groupPermissions,
  lockedPermissionsFor,
  ROLES,
  type CreateRoleInput,
  type Permission,
  type UpdateRoleInput,
} from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.ts';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../lib/errors.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { getAuth } from '../../plugins/auth.ts';
import { recordAudit } from '../audit/audit.service.ts';

/** Bloqueo de aviso que serializa las altas, ediciones y bajas de roles (nombres únicos, códigos). */
const ROLES_LOCK = 460_046;
/** Prefijo de los roles creados por pantalla: nunca coinciden con un código de sistema del seed. */
const CUSTOM_PREFIX = 'CUSTOM_';
const CODE_MAX = 50;

const withDetail = {
  permissions: { select: { permission: { select: { code: true } } } },
  _count: { select: { users: true } },
} satisfies Prisma.RoleInclude;
type RoleWithDetail = Prisma.RoleGetPayload<{ include: typeof withDetail }>;

function permissionCodes(role: RoleWithDetail) {
  return role.permissions.map(({ permission }) => permission.code).sort();
}

function toDetail(role: RoleWithDetail) {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: permissionCodes(role),
    lockedPermissions: lockedPermissionsFor(role).sort(),
    userCount: role._count.users,
  };
}

/** Lo que se guarda en `audit_logs` (antes/después): sin contadores que cambian por otras causas. */
function toAudit(role: RoleWithDetail) {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: permissionCodes(role),
  };
}

/** `Cajera de turno` → `CAJERA_DE_TURNO` (sin tildes ni símbolos). */
function slug(name: string) {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base.slice(0, CODE_MAX - CUSTOM_PREFIX.length - 4) || 'ROL';
}

/**
 * Los permisos exclusivos del Administrador (`cash:correct`, `sales-incidents:manage`,
 * `settings:manage`) no se conceden a ningún otro rol, ni siquiera por un Administrador: lo decidió
 * el responsable (R-17, R-09, R-27). El rol Administrador no se edita por pantalla.
 */
function assertNoAdminOnly(permissions: readonly string[]) {
  const forbidden = adminOnlyPermissionsIn(permissions);
  if (forbidden.length > 0) {
    throw new BusinessRuleError(
      `Estos permisos son exclusivos del rol Administrador y no se pueden asignar a otro rol: ${forbidden.join(', ')}`,
      { permissions: forbidden },
    );
  }
}

export class RolesService {
  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    const roles = await this.prisma.role.findMany({
      include: withDetail,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    });
    return roles.map(toDetail);
  }

  permissionCatalog() {
    return groupPermissions();
  }

  async create(input: CreateRoleInput, request: FastifyRequest) {
    assertNoAdminOnly(input.permissions);
    this.assertCanGrant(input.permissions, [], request);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ROLES_LOCK}::bigint)`;
      await this.assertUniqueName(tx, input.name);
      const permissionIds = await this.permissionIds(tx, input.permissions);
      const role = await tx.role.create({
        data: {
          code: await this.freeCode(tx, input.name),
          name: input.name,
          description: input.description ?? null,
          isSystem: false,
          permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
        },
        include: withDetail,
      });
      await recordAudit(
        tx,
        { action: 'role.created', entityType: 'Role', entityId: role.id, after: toAudit(role) },
        request,
      );
      return toDetail(role);
    });
  }

  async update(id: string, input: UpdateRoleInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ROLES_LOCK}::bigint)`;
      const previous = await this.lockedRole(tx, id);
      if (previous.code === ROLES.ADMIN) {
        throw new BusinessRuleError(
          'El rol Administrador no se puede modificar: conserva siempre todos los permisos',
        );
      }

      const renames = input.name !== undefined && input.name !== previous.name;
      const describes =
        input.description !== undefined && input.description !== previous.description;
      if (previous.isSystem && (renames || describes)) {
        throw new BusinessRuleError(
          'Los roles del sistema no se renombran ni cambian su descripción',
        );
      }
      if (renames && input.name !== undefined) await this.assertUniqueName(tx, input.name, id);

      const current = permissionCodes(previous);
      if (input.permissions) {
        const next = input.permissions;
        const locked = lockedPermissionsFor(previous).filter((code) => !next.includes(code));
        if (locked.length > 0) {
          throw new BusinessRuleError(
            'Los permisos base de un rol del sistema no se pueden quitar',
            { permissions: locked },
          );
        }
        assertNoAdminOnly(next);
        this.assertCanGrant(next, current, request);
        const permissionIds = await this.permissionIds(tx, next);
        await tx.rolePermission.deleteMany({
          where: { roleId: id, permissionId: { notIn: permissionIds } },
        });
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
          skipDuplicates: true,
        });
      }

      const role = await tx.role.update({
        where: { id },
        data: {
          ...(renames && { name: input.name }),
          ...(describes && { description: input.description }),
        },
        include: withDetail,
      });
      // Los permisos se leen en cada petición (plugins/auth.ts, sin caché): las sesiones abiertas de
      // los usuarios del rol ven el cambio en su siguiente petición, sin cerrar sesión.
      await recordAudit(
        tx,
        {
          action: 'role.updated',
          entityType: 'Role',
          entityId: id,
          before: toAudit(previous),
          after: toAudit(role),
        },
        request,
      );
      return toDetail(role);
    });
  }

  /**
   * Eliminación física solo de roles creados por pantalla y SIN usuarios (activos o inactivos): no
   * tienen historial propio; su rastro queda en `audit_logs` (estado anterior completo).
   */
  async remove(id: string, request: FastifyRequest) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ROLES_LOCK}::bigint)`;
      const previous = await this.lockedRole(tx, id);
      if (previous.isSystem || previous.code === ROLES.ADMIN) {
        throw new BusinessRuleError('Los roles del sistema no se pueden eliminar');
      }
      if (previous._count.users > 0) {
        throw new BusinessRuleError(
          `El rol tiene ${String(previous._count.users)} usuario(s) asignado(s): quíteselo antes de eliminarlo`,
          { userCount: previous._count.users },
        );
      }
      await tx.role.delete({ where: { id } });
      await recordAudit(
        tx,
        { action: 'role.deleted', entityType: 'Role', entityId: id, before: toAudit(previous) },
        request,
      );
    });
  }

  /**
   * Bloquea la fila del rol: una asignación simultánea a un usuario (INSERT en user_roles toma un
   * bloqueo KEY SHARE sobre el rol) espera a esta transacción, y el conteo de usuarios es exacto.
   */
  private async lockedRole(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM roles WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundError('Rol no encontrado');
    return tx.role.findUniqueOrThrow({ where: { id }, include: withDetail });
  }

  /**
   * Nadie concede lo que no tiene: quien administra roles sin ser Administrador no puede agregar a
   * un rol (ni al suyo) permisos que su propia sesión no tenga. Evita la escalada de privilegios.
   */
  private assertCanGrant(next: readonly string[], current: string[], request: FastifyRequest) {
    const own = getAuth(request).user.permissions as string[];
    const missing = next.filter((code) => !current.includes(code) && !own.includes(code));
    if (missing.length > 0) {
      throw new ForbiddenError(
        `No puede conceder permisos que usted no tiene: ${missing.join(', ')}`,
      );
    }
  }

  private async assertUniqueName(tx: Prisma.TransactionClient, name: string, exceptId?: string) {
    const clash = await tx.role.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictError('Ya existe un rol con ese nombre');
  }

  /** Los permisos deben existir en la base (los crea el seed desde el catálogo compartido). */
  private async permissionIds(tx: Prisma.TransactionClient, codes: readonly Permission[]) {
    const rows = await tx.permission.findMany({
      where: { code: { in: [...codes] } },
      select: { id: true, code: true },
    });
    if (rows.length !== codes.length) {
      const found = new Set(rows.map((row) => row.code));
      throw new ValidationError('Uno o más permisos no están registrados; ejecute el seed', [
        ...codes
          .filter((code) => !found.has(code))
          .map((code) => ({ field: 'permissions', message: `Permiso no registrado: ${code}` })),
      ]);
    }
    return rows.map((row) => row.id);
  }

  private async freeCode(tx: Prisma.TransactionClient, name: string) {
    const base = `${CUSTOM_PREFIX}${slug(name)}`;
    const taken = new Set(
      (
        await tx.role.findMany({ where: { code: { startsWith: base } }, select: { code: true } })
      ).map((role) => role.code),
    );
    if (!taken.has(base)) return base;
    for (let n = 2; ; n += 1) {
      const candidate = `${base}_${String(n)}`;
      if (!taken.has(candidate)) return candidate;
    }
  }
}
