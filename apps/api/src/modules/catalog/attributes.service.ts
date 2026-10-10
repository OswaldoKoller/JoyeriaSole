import type { CreateAttributeOptionInput } from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../lib/errors.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { recordAudit } from '../audit/audit.service.ts';

export class AttributesService {
  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    const items = await this.prisma.attribute.findMany({
      where: { isActive: true },
      include: { options: { orderBy: [{ sortOrder: 'asc' }, { value: 'asc' }] } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return {
      data: items.map((attribute) => ({
        id: attribute.id,
        code: attribute.code,
        name: attribute.name,
        dataType: attribute.dataType,
        unit: attribute.unit,
        isActive: attribute.isActive,
        options: attribute.options.map((option) => ({
          id: option.id,
          value: option.value,
          code: option.code,
          isActive: option.isActive,
          sortOrder: option.sortOrder,
        })),
      })),
    };
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
      const option = await tx.attributeOption.create({
        data: { attributeId, value: input.value, code: input.code || null },
      });
      const after = {
        id: option.id,
        value: option.value,
        code: option.code,
        isActive: option.isActive,
        sortOrder: option.sortOrder,
      };
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
}
