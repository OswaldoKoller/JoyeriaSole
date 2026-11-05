import type {
  CreateAttributeInput,
  CreateAttributeOptionInput,
  UpdateAttributeInput,
  UpdateAttributeOptionInput,
} from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import type { Attribute, AttributeOption, Prisma } from '../../generated/prisma/client.ts';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../lib/errors.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { recordAudit } from '../audit/audit.service.ts';

type AttributeWithOptions = Attribute & { options: AttributeOption[] };

function optionResponse(option: AttributeOption) {
  return {
    id: option.id,
    value: option.value,
    code: option.code,
    isActive: option.isActive,
    sortOrder: option.sortOrder,
  };
}

function attributeResponse(attribute: AttributeWithOptions) {
  return {
    id: attribute.id,
    code: attribute.code,
    name: attribute.name,
    dataType: attribute.dataType,
    unit: attribute.unit,
    suggestedUse: attribute.suggestedUse,
    isSystem: attribute.isSystem,
    isActive: attribute.isActive,
    sortOrder: attribute.sortOrder,
    options: attribute.options.map(optionResponse),
  };
}

/** `Material de cierre` → `material_de_cierre`. Sin tildes, solo [a-z0-9_]. */
export function deriveAttributeCode(name: string) {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
  return /^[a-z]/.test(base) ? base : `attr_${base}`.replace(/_$/, '');
}

const optionsOrder = [
  { sortOrder: 'asc' },
  { value: 'asc' },
] satisfies Prisma.AttributeOptionOrderByWithRelationInput[];

export class AttributesService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Lista las definiciones. `includeInactive` es para la pantalla de gestión. */
  async list(includeInactive = false) {
    const items = await this.prisma.attribute.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { options: { orderBy: optionsOrder } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return { data: items.map(attributeResponse) };
  }

  /** Crea una definición nueva (las de sistema las crea el seed). */
  async create(input: CreateAttributeInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      const code = input.code ?? deriveAttributeCode(input.name);
      const duplicate = await tx.attribute.findFirst({
        where: { OR: [{ code }, { name: { equals: input.name, mode: 'insensitive' } }] },
      });
      if (duplicate) throw new ConflictError('Ya existe un atributo con ese código o nombre');
      const last = await tx.attribute.aggregate({ _max: { sortOrder: true } });
      const attribute = await tx.attribute.create({
        data: {
          code,
          name: input.name,
          dataType: input.dataType,
          // La unidad solo tiene sentido en listas y números (cm, mm, g).
          unit:
            input.dataType === 'OPTION' || input.dataType === 'NUMBER' ? input.unit || null : null,
          // Solo las listas pueden ser eje de variante (ADR-006).
          suggestedUse: input.dataType === 'OPTION' ? input.suggestedUse : 'DESCRIPTIVE',
          sortOrder: (last._max.sortOrder ?? 0) + 1,
        },
        include: { options: true },
      });
      const after = attributeResponse(attribute);
      await recordAudit(
        tx,
        { action: 'attribute.created', entityType: 'Attribute', entityId: attribute.id, after },
        request,
      );
      return after;
    });
  }

  async update(id: string, input: UpdateAttributeInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.attribute.findUnique({
        where: { id },
        include: { options: { orderBy: optionsOrder } },
      });
      if (!previous) throw new NotFoundError('Atributo no encontrado');
      if (input.isActive === false && previous.isActive) {
        if (previous.isSystem) {
          throw new BusinessRuleError('Los atributos base del sistema no se pueden desactivar');
        }
        const [products, axes, variants, categories] = await Promise.all([
          tx.productAttributeValue.count({ where: { attributeId: id } }),
          tx.productVariantAxis.count({ where: { attributeId: id } }),
          tx.variantAttributeValue.count({ where: { attributeId: id } }),
          tx.categoryAttribute.count({ where: { attributeId: id } }),
        ]);
        if (products + axes + variants + categories > 0) {
          throw new BusinessRuleError(
            'No se puede desactivar un atributo que está en uso en productos o categorías',
            { products, axes, variants, categories },
          );
        }
      }
      if (input.name && input.name.toLowerCase() !== previous.name.toLowerCase()) {
        const duplicate = await tx.attribute.findFirst({
          where: { id: { not: id }, name: { equals: input.name, mode: 'insensitive' } },
        });
        if (duplicate) throw new ConflictError('Ya existe un atributo con ese nombre');
      }
      if (input.suggestedUse === 'VARIANT_AXIS' && previous.dataType !== 'OPTION') {
        throw new BusinessRuleError('Solo un atributo de lista puede ser eje de variante');
      }
      const updated = await tx.attribute.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.unit !== undefined && {
            unit:
              previous.dataType === 'OPTION' || previous.dataType === 'NUMBER'
                ? input.unit || null
                : null,
          }),
          ...(input.suggestedUse !== undefined && { suggestedUse: input.suggestedUse }),
          ...(input.isActive !== undefined && { isActive: input.isActive }),
          ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        },
        include: { options: { orderBy: optionsOrder } },
      });
      const before = attributeResponse(previous);
      const after = attributeResponse(updated);
      await recordAudit(
        tx,
        { action: 'attribute.updated', entityType: 'Attribute', entityId: id, before, after },
        request,
      );
      return after;
    });
  }

  async addOption(attributeId: string, input: CreateAttributeOptionInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      const attribute = await tx.attribute.findUnique({ where: { id: attributeId } });
      if (!attribute) throw new NotFoundError('Atributo no encontrado');
      if (!attribute.isActive || attribute.dataType !== 'OPTION') {
        throw new BusinessRuleError('Este atributo no acepta valores de lista');
      }
      const duplicate = await tx.attributeOption.findFirst({
        where: { attributeId, value: { equals: input.value, mode: 'insensitive' } },
      });
      if (duplicate) throw new ConflictError('Ya existe ese valor para el atributo');
      const last = await tx.attributeOption.aggregate({
        where: { attributeId },
        _max: { sortOrder: true },
      });
      const option = await tx.attributeOption.create({
        data: {
          attributeId,
          value: input.value,
          code: input.code || null,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
      });
      const after = optionResponse(option);
      await recordAudit(
        tx,
        {
          action: 'attribute_option.created',
          entityType: 'AttributeOption',
          entityId: option.id,
          after,
          metadata: { attributeId },
        },
        request,
      );
      return after;
    });
  }

  /**
   * Edita o desactiva un valor de lista. Si cambia el texto, se recalculan las etiquetas de las
   * variantes que lo usan («Plata 925 / 16»), que son una copia derivada.
   */
  async updateOption(
    attributeId: string,
    optionId: string,
    input: UpdateAttributeOptionInput,
    request: FastifyRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.attributeOption.findUnique({ where: { id: optionId } });
      if (previous?.attributeId !== attributeId) throw new NotFoundError('Valor no encontrado');
      if (input.value && input.value.toLowerCase() !== previous.value.toLowerCase()) {
        const duplicate = await tx.attributeOption.findFirst({
          where: {
            attributeId,
            id: { not: optionId },
            value: { equals: input.value, mode: 'insensitive' },
          },
        });
        if (duplicate) throw new ConflictError('Ya existe ese valor para el atributo');
      }
      const updated = await tx.attributeOption.update({
        where: { id: optionId },
        data: {
          ...(input.value !== undefined && { value: input.value }),
          ...(input.code !== undefined && { code: input.code || null }),
          ...(input.isActive !== undefined && { isActive: input.isActive }),
          ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        },
      });
      if (updated.value !== previous.value) await relabelVariants(tx, optionId);
      const before = optionResponse(previous);
      const after = optionResponse(updated);
      await recordAudit(
        tx,
        {
          action:
            updated.isActive === previous.isActive
              ? 'attribute_option.updated'
              : updated.isActive
                ? 'attribute_option.activated'
                : 'attribute_option.deactivated',
          entityType: 'AttributeOption',
          entityId: optionId,
          before,
          after,
          metadata: { attributeId },
        },
        request,
      );
      return after;
    });
  }
}

/** Recalcula `label` de las variantes que usan el valor: valores de los ejes en orden. */
async function relabelVariants(tx: Prisma.TransactionClient, optionId: string) {
  const affected = await tx.variantAttributeValue.findMany({
    where: { optionId },
    select: { variantId: true },
  });
  for (const { variantId } of affected) {
    const variant = await tx.productVariant.findUniqueOrThrow({
      where: { id: variantId },
      include: {
        attributeValues: { include: { option: true, attribute: true } },
        product: { include: { variantAxes: true } },
      },
    });
    const order = new Map(
      variant.product.variantAxes.map((axis) => [axis.attributeId, axis.sortOrder]),
    );
    const label = variant.attributeValues
      .sort((a, b) => (order.get(a.attributeId) ?? 0) - (order.get(b.attributeId) ?? 0))
      .map((value) => value.option.value)
      .join(' / ');
    await tx.productVariant.update({ where: { id: variantId }, data: { label } });
  }
}
