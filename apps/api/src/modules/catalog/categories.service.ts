import { randomBytes } from 'node:crypto';
import type { CreateCategoryInput, UpdateCategoryInput } from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import type { Category } from '../../generated/prisma/client.ts';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../lib/errors.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { recordAudit } from '../audit/audit.service.ts';

function toResponse(category: Category) {
  return {
    id: category.id,
    parentId: category.parentId,
    name: category.name,
    slug: category.slug,
    description: category.description,
    isActive: category.isActive,
    sortOrder: category.sortOrder,
  };
}

function makeSlug(name: string) {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
  return `${base || 'categoria'}-${randomBytes(4).toString('hex')}`;
}

export class CategoriesService {
  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    const items = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
    return { data: items.map(toResponse) };
  }

  async get(id: string) {
    const item = await this.prisma.category.findUnique({ where: { id } });
    if (!item) throw new NotFoundError('Categoría no encontrada');
    return toResponse(item);
  }

  async create(input: CreateCategoryInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      const parentId = input.parentId ?? null;
      if (parentId) {
        const parent = await tx.category.findUnique({ where: { id: parentId } });
        if (!parent) throw new NotFoundError('Categoría principal no encontrada');
        if (parent.parentId || !parent.isActive) {
          throw new BusinessRuleError(
            'Solo una categoría principal activa puede tener subcategorías',
          );
        }
      }
      const duplicate = await tx.category.findFirst({
        where: { parentId, name: { equals: input.name, mode: 'insensitive' } },
      });
      if (duplicate)
        throw new ConflictError('Ya existe una categoría con ese nombre en este nivel');
      const item = await tx.category.create({
        data: {
          name: input.name,
          parentId,
          description: input.description ?? null,
          sortOrder: input.sortOrder,
          slug: makeSlug(input.name),
        },
      });
      const after = toResponse(item);
      await recordAudit(
        tx,
        { action: 'category.created', entityType: 'Category', entityId: item.id, after },
        request,
      );
      return after;
    });
  }

  async update(id: string, input: UpdateCategoryInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.category.findUnique({ where: { id } });
      if (!previous) throw new NotFoundError('Categoría no encontrada');
      if (input.name && input.name !== previous.name) {
        const duplicate = await tx.category.findFirst({
          where: {
            id: { not: id },
            parentId: previous.parentId,
            name: { equals: input.name, mode: 'insensitive' },
          },
        });
        if (duplicate)
          throw new ConflictError('Ya existe una categoría con ese nombre en este nivel');
      }
      const item = await tx.category.update({ where: { id }, data: input });
      const before = toResponse(previous);
      const after = toResponse(item);
      await recordAudit(
        tx,
        { action: 'category.updated', entityType: 'Category', entityId: id, before, after },
        request,
      );
      return after;
    });
  }
}
