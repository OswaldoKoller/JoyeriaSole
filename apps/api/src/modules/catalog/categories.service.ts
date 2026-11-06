import { randomBytes } from 'node:crypto';
import type {
  CreateCategoryInput,
  SetCategoryAttributesInput,
  UpdateCategoryInput,
} from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import type { Category, CategoryAttribute } from '../../generated/prisma/client.ts';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../lib/errors.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { recordAudit } from '../audit/audit.service.ts';

type CategoryWithAttributes = Category & { attributes: CategoryAttribute[] };

const withAttributes = { attributes: { orderBy: { sortOrder: 'asc' } } } as const;

function toResponse(category: CategoryWithAttributes) {
  return {
    id: category.id,
    parentId: category.parentId,
    name: category.name,
    slug: category.slug,
    description: category.description,
    isActive: category.isActive,
    sortOrder: category.sortOrder,
    attributes: category.attributes.map((item) => ({
      attributeId: item.attributeId,
      isRequired: item.isRequired,
      isVariantAxisDefault: item.isVariantAxisDefault,
      sortOrder: item.sortOrder,
    })),
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
      include: withAttributes,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
    return { data: items.map(toResponse) };
  }

  async get(id: string) {
    const item = await this.prisma.category.findUnique({ where: { id }, include: withAttributes });
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
        include: withAttributes,
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
      const previous = await tx.category.findUnique({ where: { id }, include: withAttributes });
      if (!previous) throw new NotFoundError('Categoría no encontrada');
      if (input.isActive === false && previous.isActive) {
        const activeChildren = await tx.category.count({ where: { parentId: id, isActive: true } });
        if (activeChildren > 0) {
          throw new BusinessRuleError('Desactive primero las subcategorías de esta categoría', {
            activeChildren,
          });
        }
      }
      if (input.isActive === true && !previous.isActive && previous.parentId) {
        const parent = await tx.category.findUnique({ where: { id: previous.parentId } });
        if (!parent?.isActive) {
          throw new BusinessRuleError('Active primero la categoría principal');
        }
      }
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
      const item = await tx.category.update({
        where: { id },
        data: input,
        include: withAttributes,
      });
      const before = toResponse(previous);
      const after = toResponse(item);
      await recordAudit(
        tx,
        {
          action:
            previous.isActive !== item.isActive
              ? item.isActive
                ? 'category.activated'
                : 'category.deactivated'
              : 'category.updated',
          entityType: 'Category',
          entityId: id,
          before,
          after,
        },
        request,
      );
      return after;
    });
  }

  /**
   * Reemplaza los atributos asignados a la categoría (plantilla de la ficha): cuáles son
   * obligatorios y cuáles se sugieren como eje de variante. Es una guía para la UI.
   */
  async setAttributes(id: string, input: SetCategoryAttributesInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.category.findUnique({ where: { id }, include: withAttributes });
      if (!previous) throw new NotFoundError('Categoría no encontrada');
      const attributes = await tx.attribute.findMany({
        where: { id: { in: input.attributes.map((item) => item.attributeId) } },
      });
      for (const item of input.attributes) {
        const attribute = attributes.find((candidate) => candidate.id === item.attributeId);
        if (!attribute?.isActive) throw new NotFoundError('Atributo activo no encontrado');
        if (item.isVariantAxisDefault && attribute.dataType !== 'OPTION') {
          throw new BusinessRuleError(
            `${attribute.name} no es de tipo lista: no puede ser eje de variante`,
          );
        }
      }
      await tx.categoryAttribute.deleteMany({ where: { categoryId: id } });
      if (input.attributes.length > 0) {
        await tx.categoryAttribute.createMany({
          data: input.attributes.map((item, sortOrder) => ({
            categoryId: id,
            attributeId: item.attributeId,
            isRequired: item.isRequired,
            isVariantAxisDefault: item.isVariantAxisDefault,
            sortOrder,
          })),
        });
      }
      const updated = await tx.category.findUniqueOrThrow({
        where: { id },
        include: withAttributes,
      });
      const before = toResponse(previous);
      const after = toResponse(updated);
      await recordAudit(
        tx,
        { action: 'category.attributes_set', entityType: 'Category', entityId: id, before, after },
        request,
      );
      return after;
    });
  }
}
