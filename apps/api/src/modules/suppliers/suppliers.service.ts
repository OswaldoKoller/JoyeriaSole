import type { CreateSupplierInput, UpdateSupplierInput } from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import type { Supplier as SupplierRecord } from '../../generated/prisma/client.ts';
import { NotFoundError } from '../../lib/errors.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { recordAudit } from '../audit/audit.service.ts';

function toResponse(supplier: SupplierRecord) {
  return {
    id: supplier.id,
    name: supplier.name,
    taxId: supplier.taxId,
    contactName: supplier.contactName,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    notes: supplier.notes,
    isActive: supplier.isActive,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
  };
}

export class SuppliersService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(input: { page: number; pageSize: number; q: string; status: string }) {
    const where = {
      ...(input.status !== 'all' && { isActive: input.status === 'active' }),
      ...(input.q && {
        OR: [
          { name: { contains: input.q, mode: 'insensitive' as const } },
          { taxId: { contains: input.q, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return {
      data: items.map(toResponse),
      meta: { page: input.page, pageSize: input.pageSize, total },
    };
  }

  async get(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundError('Proveedor no encontrado');
    return toResponse(supplier);
  }

  async create(input: CreateSupplierInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({ data: input });
      const after = toResponse(supplier);
      await recordAudit(
        tx,
        { action: 'supplier.created', entityType: 'Supplier', entityId: supplier.id, after },
        request,
      );
      return after;
    });
  }

  async update(id: string, input: UpdateSupplierInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      // Serializa cambios a un mismo proveedor para que la auditoría refleje el estado previo real.
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM suppliers WHERE id = ${id}::uuid FOR UPDATE`;
      if (rows.length === 0) throw new NotFoundError('Proveedor no encontrado');
      const previous = await tx.supplier.findUniqueOrThrow({ where: { id } });
      const supplier = await tx.supplier.update({ where: { id }, data: input });
      const before = toResponse(previous);
      const after = toResponse(supplier);
      await recordAudit(
        tx,
        {
          action:
            previous.isActive !== supplier.isActive
              ? supplier.isActive
                ? 'supplier.activated'
                : 'supplier.deactivated'
              : 'supplier.updated',
          entityType: 'Supplier',
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
