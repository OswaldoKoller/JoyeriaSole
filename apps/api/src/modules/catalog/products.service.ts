import type {
  AssignBarcodeInput,
  ConfigureAxesInput,
  CreateProductInput,
  CreateVariantInput,
  UpdateProductInput,
} from '@joyeria/shared';
import { PERMISSIONS } from '@joyeria/shared';
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

const withDetails = {
  category: true,
  variants: { include: { inventory: true } },
  variantAxes: {
    include: { attribute: { include: { options: true } } },
    orderBy: { sortOrder: 'asc' },
  },
} satisfies Prisma.ProductInclude;
type ProductWithDetails = Prisma.ProductGetPayload<{ include: typeof withDetails }>;

function toResponse(product: ProductWithDetails, showStock = false) {
  return {
    id: product.id,
    categoryId: product.categoryId,
    categoryName: product.category.name,
    name: product.name,
    description: product.description,
    model: product.model,
    status: product.status,
    profileIncomplete: product.profileIncomplete,
    axes: product.variantAxes.map((axis) => ({
      attributeId: axis.attributeId,
      name: axis.attribute.name,
      options: axis.attribute.options
        .filter((option) => option.isActive)
        .map((option) => ({ id: option.id, value: option.value })),
    })),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      barcode: variant.barcode,
      label: variant.label,
      salePrice: variant.salePrice.toString(),
      minStock: variant.minStock,
      status: variant.status,
      ...(showStock &&
        (() => {
          const quantity = variant.inventory?.quantity ?? 0;
          const stockLevel: 'OUT' | 'LOW' | 'OK' =
            quantity === 0
              ? 'OUT'
              : variant.minStock > 0 && quantity <= variant.minStock
                ? 'LOW'
                : 'OK';
          return { stockQuantity: quantity, stockLevel };
        })()),
    })),
  };
}

export class ProductsService {
  constructor(private readonly prisma: PrismaClient) {}

  private async nextSku(tx: Prisma.TransactionClient) {
    const [counter] = await tx.$queryRaw<{ value: bigint }[]>`
      SELECT nextval('product_variant_sku_seq') AS value`;
    if (!counter) throw new BusinessRuleError('No se pudo asignar un SKU');
    const sku = `SKU-${counter.value.toString().padStart(6, '0')}`;
    const usedBarcode = await tx.productVariant.findUnique({ where: { barcode: sku } });
    if (usedBarcode) throw new ConflictError('El SKU coincide con un código de barras existente');
    return sku;
  }

  private async validateSelections(
    tx: Prisma.TransactionClient,
    selections: ConfigureAxesInput['axes'],
  ) {
    const result: { attributeId: string; optionId: string; value: string }[] = [];
    for (const selection of selections) {
      const option = await tx.attributeOption.findUnique({
        where: { id: selection.optionId },
        include: { attribute: true },
      });
      if (
        !option ||
        option.attributeId !== selection.attributeId ||
        !option.isActive ||
        !option.attribute.isActive ||
        option.attribute.dataType !== 'OPTION'
      ) {
        throw new ValidationError('La opción no pertenece a un atributo de lista activo');
      }
      result.push({
        attributeId: selection.attributeId,
        optionId: selection.optionId,
        value: option.value,
      });
    }
    return result;
  }

  async list(
    input: { page: number; pageSize: number; q: string; status: string },
    showStock = false,
  ) {
    const where: Prisma.ProductWhereInput = {
      ...(input.status !== 'all' && { status: input.status as 'DRAFT' | 'ACTIVE' | 'INACTIVE' }),
      ...(input.q && {
        OR: [
          { name: { contains: input.q, mode: 'insensitive' } },
          {
            variants: {
              some: {
                OR: [
                  { sku: { contains: input.q, mode: 'insensitive' } },
                  { barcode: { contains: input.q, mode: 'insensitive' } },
                ],
              },
            },
          },
        ],
      }),
    };
    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: withDetails,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      data: products.map((product) => toResponse(product, showStock)),
      meta: { page: input.page, pageSize: input.pageSize, total },
    };
  }

  async get(id: string, showStock = false) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: withDetails });
    if (!product) throw new NotFoundError('Producto no encontrado');
    return toResponse(product, showStock);
  }

  async lookup(code: string, showStock = false) {
    const variant =
      (await this.prisma.productVariant.findUnique({ where: { sku: code } })) ??
      (await this.prisma.productVariant.findUnique({ where: { barcode: code } }));
    if (!variant) throw new NotFoundError('No existe una variante con ese código');
    return this.get(variant.productId, showStock);
  }

  async create(input: CreateProductInput, request: FastifyRequest) {
    if (
      input.salePrice !== undefined &&
      !getAuth(request).user.permissions.includes(PERMISSIONS.PRICES_MANAGE)
    ) {
      throw new ForbiddenError('No tiene permiso para establecer precios');
    }
    return this.prisma.$transaction((tx) => this.createWithin(tx, input, request));
  }

  /**
   * Alta de producto + variante única dentro de una transacción ajena. La reutiliza el alta
   * rápida de piezas desde un ingreso (C1), que añade `profileIncomplete` y su propia metadata.
   * No comprueba permisos: quien llama debe haberlos validado.
   */
  async createWithin(
    tx: Prisma.TransactionClient,
    input: CreateProductInput,
    request: FastifyRequest,
    options: { profileIncomplete?: boolean; metadata?: Prisma.InputJsonValue } = {},
  ) {
    const category = await tx.category.findUnique({ where: { id: input.categoryId } });
    if (!category || !category.isActive) throw new NotFoundError('Categoría activa no encontrada');
    const sku = await this.nextSku(tx);
    if (input.barcode) {
      const usedSku = await tx.productVariant.findUnique({ where: { sku: input.barcode } });
      if (usedSku) throw new BusinessRuleError('Ese código coincide con el SKU de otra pieza');
    }
    const product = await tx.product.create({
      data: {
        categoryId: input.categoryId,
        name: input.name,
        description: input.description || null,
        model: input.model || null,
        profileIncomplete: options.profileIncomplete ?? false,
        variants: {
          create: {
            sku,
            label: 'Única',
            barcode: input.barcode || null,
            salePrice: input.salePrice ?? '0',
            minStock: input.minStock,
          },
        },
      },
      include: withDetails,
    });
    const after = toResponse(product);
    await recordAudit(
      tx,
      {
        action: 'product.created',
        entityType: 'Product',
        entityId: product.id,
        after,
        ...(options.metadata !== undefined && { metadata: options.metadata }),
      },
      request,
    );
    return after;
  }

  async update(id: string, input: UpdateProductInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.product.findUnique({ where: { id }, include: withDetails });
      if (!previous) throw new NotFoundError('Producto no encontrado');
      const updated = await tx.product.update({ where: { id }, data: input, include: withDetails });
      const before = toResponse(previous);
      const after = toResponse(updated);
      await recordAudit(
        tx,
        { action: 'product.updated', entityType: 'Product', entityId: id, before, after },
        request,
      );
      return after;
    });
  }

  async assignBarcode(variantId: string, input: AssignBarcodeInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${variantId}::uuid FOR UPDATE`;
      const previous = await tx.productVariant.findUnique({ where: { id: variantId } });
      if (!previous) throw new NotFoundError('Variante no encontrada');
      if (previous.barcode)
        throw new BusinessRuleError('Esta variante ya tiene un código de barras');
      const usedSku = await tx.productVariant.findUnique({ where: { sku: input.barcode } });
      if (usedSku && usedSku.id !== variantId) {
        throw new BusinessRuleError('Ese código coincide con el SKU de otra pieza');
      }
      const updated = await tx.productVariant.update({
        where: { id: variantId },
        data: { barcode: input.barcode },
      });
      await recordAudit(
        tx,
        {
          action: 'variant.barcode_assigned',
          entityType: 'ProductVariant',
          entityId: variantId,
          before: { barcode: null },
          after: { barcode: updated.barcode },
        },
        request,
      );
      const product = await tx.product.findUniqueOrThrow({
        where: { id: updated.productId },
        include: withDetails,
      });
      return toResponse(product);
    });
  }

  async generateBarcode(variantId: string, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${variantId}::uuid FOR UPDATE`;
      const variant = await tx.productVariant.findUnique({
        where: { id: variantId },
        include: { product: true },
      });
      if (!variant) throw new NotFoundError('Variante no encontrada');
      if (variant.barcode)
        throw new BusinessRuleError('Esta variante ya tiene un código de barras');
      if (variant.product.status !== 'ACTIVE') {
        throw new BusinessRuleError('Complete y active el producto antes de generar su código');
      }
      // UUID único de la variante: el contenido CODE128 puede generarse después de guardar la ficha.
      const barcode = `SOLE-${variant.id.replaceAll('-', '').toUpperCase()}`;
      await tx.productVariant.update({ where: { id: variantId }, data: { barcode } });
      await recordAudit(
        tx,
        {
          action: 'variant.barcode_generated',
          entityType: 'ProductVariant',
          entityId: variantId,
          before: { barcode: null },
          after: { barcode },
        },
        request,
      );
      const product = await tx.product.findUniqueOrThrow({
        where: { id: variant.productId },
        include: withDetails,
      });
      return toResponse(product);
    });
  }

  async configureAxes(productId: string, input: ConfigureAxesInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
      const product = await tx.product.findUnique({
        where: { id: productId },
        include: { variants: true, variantAxes: true },
      });
      if (!product) throw new NotFoundError('Producto no encontrado');
      if (product.variantAxes.length > 0 || product.variants.length !== 1) {
        throw new BusinessRuleError('Los ejes solo se configuran antes de crear más variantes');
      }
      const base = product.variants[0];
      if (!base) throw new BusinessRuleError('El producto debe tener una variante base');
      await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${base.id}::uuid FOR UPDATE`;
      const movements = await tx.inventoryMovement.count({ where: { variantId: base.id } });
      if (movements > 0)
        throw new BusinessRuleError('No se pueden cambiar ejes con historial de stock');
      const selections = await this.validateSelections(tx, input.axes);
      await tx.productVariantAxis.createMany({
        data: selections.map((item, sortOrder) => ({
          productId,
          attributeId: item.attributeId,
          sortOrder,
        })),
      });
      await tx.variantAttributeValue.createMany({
        data: selections.map((item) => ({
          variantId: base.id,
          attributeId: item.attributeId,
          optionId: item.optionId,
        })),
      });
      const label = selections.map((item) => item.value).join(' / ');
      if (label.length > 200)
        throw new ValidationError('La etiqueta de variante es demasiado larga');
      await tx.productVariant.update({ where: { id: base.id }, data: { label } });
      const updated = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        include: withDetails,
      });
      const after = toResponse(updated);
      await recordAudit(
        tx,
        { action: 'product.axes_configured', entityType: 'Product', entityId: productId, after },
        request,
      );
      return after;
    });
  }

  async addVariant(productId: string, input: CreateVariantInput, request: FastifyRequest) {
    if (
      input.salePrice !== undefined &&
      !getAuth(request).user.permissions.includes(PERMISSIONS.PRICES_MANAGE)
    ) {
      throw new ForbiddenError('No tiene permiso para establecer precios');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
      const product = await tx.product.findUnique({
        where: { id: productId },
        include: { variantAxes: true },
      });
      if (!product) throw new NotFoundError('Producto no encontrado');
      const axes = product.variantAxes;
      if (axes.length === 0) throw new BusinessRuleError('Configure los ejes de variante primero');
      if (
        input.values.length !== axes.length ||
        axes.some((axis) => !input.values.some((item) => item.attributeId === axis.attributeId))
      ) {
        throw new ValidationError('La variante debe tener un valor por cada eje');
      }
      const selections = await this.validateSelections(tx, input.values);
      const existing = await tx.productVariant.findMany({
        where: { productId },
        include: { attributeValues: true },
      });
      if (
        existing.some((variant) =>
          selections.every((item) =>
            variant.attributeValues.some(
              (value) => value.attributeId === item.attributeId && value.optionId === item.optionId,
            ),
          ),
        )
      ) {
        throw new ConflictError('Ya existe una variante con esa combinación');
      }
      const sku = await this.nextSku(tx);
      if (input.barcode) {
        const usedSku = await tx.productVariant.findUnique({ where: { sku: input.barcode } });
        if (usedSku) throw new ConflictError('Ese código coincide con el SKU de otra pieza');
      }
      const ordered = [...axes]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(
          (axis) => selections.find((item) => item.attributeId === axis.attributeId)?.value ?? '',
        );
      const label = ordered.join(' / ');
      if (label.length > 200)
        throw new ValidationError('La etiqueta de variante es demasiado larga');
      const variant = await tx.productVariant.create({
        data: {
          productId,
          sku,
          barcode: input.barcode || null,
          label,
          salePrice: input.salePrice ?? '0',
          minStock: input.minStock,
        },
      });
      await tx.variantAttributeValue.createMany({
        data: selections.map((item) => ({
          variantId: variant.id,
          attributeId: item.attributeId,
          optionId: item.optionId,
        })),
      });
      const updated = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        include: withDetails,
      });
      const after = toResponse(updated);
      await recordAudit(
        tx,
        {
          action: 'variant.created',
          entityType: 'ProductVariant',
          entityId: variant.id,
          after: { sku: variant.sku, label: variant.label, barcode: variant.barcode },
          metadata: { productId },
        },
        request,
      );
      return after;
    });
  }
}
