import type { CreateStockEntryCostTypeInput, UpdateStockEntryCostTypeInput } from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import type { StockEntryCostType } from '../../generated/prisma/client.ts';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../lib/errors.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { recordAudit } from '../audit/audit.service.ts';

function toResponse(type: StockEntryCostType) {
  return {
    id: type.id,
    code: type.code,
    name: type.name,
    isActive: type.isActive,
    isSystem: type.isSystem,
  };
}

/** «Flete aéreo» → «FLETE_AEREO»: código estable y legible para los tipos que agrega el Administrador. */
function slug(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/** Catálogo de tipos de costo adicional de un ingreso (Q-08). */
export class CostTypesService {
  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    const types = await this.prisma.stockEntryCostType.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return types.map(toResponse);
  }

  async create(input: CreateStockEntryCostTypeInput, request: FastifyRequest) {
    const code = `CUSTOM_${slug(input.name)}`;
    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.stockEntryCostType.findFirst({
        where: { OR: [{ code }, { name: { equals: input.name, mode: 'insensitive' } }] },
      });
      if (duplicate) throw new ConflictError('Ya existe un tipo de costo con ese nombre.');
      const last = await tx.stockEntryCostType.aggregate({ _max: { sortOrder: true } });
      const type = await tx.stockEntryCostType.create({
        data: { code, name: input.name, sortOrder: (last._max.sortOrder ?? 0) + 1 },
      });
      const after = toResponse(type);
      await recordAudit(
        tx,
        {
          action: 'stock_entry_cost_type.created',
          entityType: 'StockEntryCostType',
          entityId: type.id,
          after,
        },
        request,
      );
      return after;
    });
  }

  async update(id: string, input: UpdateStockEntryCostTypeInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM stock_entry_cost_types WHERE id = ${id}::uuid FOR UPDATE`;
      const previous = await tx.stockEntryCostType.findUnique({ where: { id } });
      if (!previous) throw new NotFoundError('Tipo de costo no encontrado');
      if (previous.isSystem) {
        throw new BusinessRuleError('Los tipos del sistema no se pueden renombrar ni desactivar.');
      }
      if (input.name && input.name.toLowerCase() !== previous.name.toLowerCase()) {
        const duplicate = await tx.stockEntryCostType.findFirst({
          where: { id: { not: id }, name: { equals: input.name, mode: 'insensitive' } },
        });
        if (duplicate) throw new ConflictError('Ya existe un tipo de costo con ese nombre.');
      }
      const updated = await tx.stockEntryCostType.update({ where: { id }, data: input });
      const before = toResponse(previous);
      const after = toResponse(updated);
      await recordAudit(
        tx,
        {
          action:
            previous.isActive !== updated.isActive
              ? updated.isActive
                ? 'stock_entry_cost_type.activated'
                : 'stock_entry_cost_type.deactivated'
              : 'stock_entry_cost_type.updated',
          entityType: 'StockEntryCostType',
          entityId: id,
          before,
          after,
        },
        request,
      );
      return after;
    });
  }
}
