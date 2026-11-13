import type {
  AssignBarcodeInput,
  ConfigureAxesInput,
  CreateProductInput,
  CreateVariantInput,
  ProductAttributeInput,
  UpdateProductInput,
  UpdateVariantInput,
  UpdateVariantStatusInput,
  VariantLookup,
} from '@joyeria/shared';
import { ERROR_CODES, PERMISSIONS, hasSalePrice } from '@joyeria/shared';
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
import { skuCandidates } from '../../lib/sku.ts';
import { getAuth } from '../../plugins/auth.ts';
import { recordAudit } from '../audit/audit.service.ts';
import {
  dropEmptyBalances,
  lockVariantsAndBalances,
  lockVariantsOfProduct,
} from '../inventory/stock-locks.ts';
import { recordInitialPrice } from '../pricing/pricing.service.ts';
import { toPhotoResponse } from './photos/photo-response.ts';

const withDetails = {
  category: true,
  variants: { include: { inventory: true }, orderBy: { sku: 'asc' } },
  variantAxes: {
    include: { attribute: { include: { options: true } } },
    orderBy: { sortOrder: 'asc' },
  },
  attributeValues: { include: { attribute: true, option: true } },
  // Solo metadatos: los bytes viven en product_photo_blobs y nunca se cargan en listados.
  photos: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.ProductInclude;
type ProductWithDetails = Prisma.ProductGetPayload<{ include: typeof withDetails }>;

/** C1: una ficha está incompleta si no tiene descripción ni ninguna característica descriptiva. */
const incompleteWhere = {
  OR: [
    { profileIncomplete: true },
    {
      AND: [
        { OR: [{ description: null }, { description: '' }] },
        { attributeValues: { none: {} } },
      ],
    },
  ],
} satisfies Prisma.ProductWhereInput;

/** D9: alguna variante activa con precio de venta 0. */
const withoutPriceWhere = {
  variants: { some: { status: 'ACTIVE', salePrice: 0 } },
} satisfies Prisma.ProductWhereInput;

function displayValue(value: ProductWithDetails['attributeValues'][number]) {
  return (
    value.option?.value ??
    value.valueText ??
    value.valueNumber?.toString() ??
    (value.valueBoolean === null ? '' : value.valueBoolean ? 'Sí' : 'No')
  );
}

function toResponse(product: ProductWithDetails, showStock = false) {
  return {
    id: product.id,
    categoryId: product.categoryId,
    categoryName: product.category.name,
    name: product.name,
    description: product.description,
    model: product.model,
    status: product.status,
    isIncomplete:
      product.profileIncomplete ||
      (!product.description?.trim() && product.attributeValues.length === 0),
    hasMissingPrice: product.variants.some(
      (variant) => variant.status === 'ACTIVE' && variant.salePrice.isZero(),
    ),
    attributes: [...product.attributeValues]
      .sort((a, b) => a.attribute.sortOrder - b.attribute.sortOrder)
      .map((value) => ({
        attributeId: value.attributeId,
        name: value.attribute.name,
        dataType: value.attribute.dataType,
        unit: value.attribute.unit,
        optionId: value.optionId,
        valueText: value.valueText,
        valueNumber: value.valueNumber?.toString() ?? null,
        valueBoolean: value.valueBoolean,
        displayValue: displayValue(value),
      })),
    profileIncomplete: product.profileIncomplete,
    axes: product.variantAxes.map((axis) => ({
      attributeId: axis.attributeId,
      name: axis.attribute.name,
      options: axis.attribute.options
        .filter((option) => option.isActive)
        .map((option) => ({ id: option.id, value: option.value })),
    })),
    photos: product.photos.map(toPhotoResponse),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      barcode: variant.barcode,
      label: variant.label,
      salePrice: variant.salePrice.toFixed(2),
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

/**
 * P-22: un producto o una variante con stock no se desactiva. Sigue el orden de bloqueo del libro
 * de inventario (variantes por id y luego saldos por id; ver `inventory/stock-locks.ts`) para no
 * interbloquear ni dejar pasar una operación de stock en curso: las variantes del producto se
 * bloquean ANTES de leer los saldos (la variante suelta ya la bloquea quien llama), de modo que
 * una confirmación de ingreso o un ajuste que ya las tenga termina primero y su stock se ve aquí.
 * Lanza BusinessRuleError con código estable si algún saldo es mayor que cero.
 */
async function assertNoStock(
  tx: Prisma.TransactionClient,
  scope: { productId: string } | { variantId: string },
) {
  if ('productId' in scope) await lockVariantsOfProduct(tx, scope.productId);
  const rows =
    'productId' in scope
      ? await tx.$queryRaw<{ sku: string; quantity: number }[]>`
          SELECT v.sku, b.quantity
          FROM inventory_balances b
          JOIN product_variants v ON v.id = b.variant_id
          WHERE v.product_id = ${scope.productId}::uuid
          ORDER BY b.variant_id
          FOR UPDATE OF b`
      : await tx.$queryRaw<{ sku: string; quantity: number }[]>`
          SELECT v.sku, b.quantity
          FROM inventory_balances b
          JOIN product_variants v ON v.id = b.variant_id
          WHERE b.variant_id = ${scope.variantId}::uuid
          ORDER BY b.variant_id
          FOR UPDATE OF b`;
  const withStock = rows.filter((row) => row.quantity > 0);
  if (withStock.length === 0) return;
  const pieces = withStock.reduce((sum, row) => sum + row.quantity, 0);
  const subject = 'productId' in scope ? 'el producto' : 'la variante';
  throw new BusinessRuleError(
    `No se puede desactivar ${subject}: tiene ${pieces} ${pieces === 1 ? 'pieza' : 'piezas'} en stock. ` +
      'Registre primero un ajuste de salida hasta dejarlo en cero.',
    { variants: withStock.map((row) => ({ sku: row.sku, quantity: row.quantity })) },
    ERROR_CODES.STOCK_BLOCKS_DEACTIVATION,
  );
}

type Selection = { attributeId: string; optionId: string; value: string };

/** Resultado de ofrecer un código del proveedor como código de barras (Q-10). */
type ProviderCodeCheck = { barcode: string | null; warning: string | null; owner: string | null };

function variantName(variant: { sku: string; label: string | null; product: { name: string } }) {
  const label = variant.label && variant.label !== 'Única' ? ` · ${variant.label}` : '';
  return `${variant.sku} (${variant.product.name}${label})`;
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

  /**
   * Q-10: el código del proveedor se conserva como código de barras solo si no pertenece ya a
   * otra pieza (ni como código de barras ni como SKU). Si está repetido NO se guarda y se avisa:
   * la pieza se identifica por su SKU.
   */
  private async checkProviderCode(
    tx: Prisma.TransactionClient,
    raw: string | null | undefined,
    ownVariantId?: string,
  ): Promise<ProviderCodeCheck> {
    const code = raw?.trim();
    if (!code) return { barcode: null, warning: null, owner: null };
    const clash = await tx.productVariant.findFirst({
      where: {
        ...(ownVariantId && { id: { not: ownVariantId } }),
        OR: [{ barcode: code }, { sku: code }],
      },
      include: { product: true },
    });
    if (!clash) return { barcode: code, warning: null, owner: null };
    const owner = variantName(clash);
    return {
      barcode: null,
      owner,
      warning:
        `El código «${code}» ya pertenece a la pieza ${owner}. No se guardó como código de barras: ` +
        'esta pieza se identifica por su SKU.',
    };
  }

  /**
   * Conserva el código en `SupplierProduct` cuando se conoce el proveedor. Devuelve un aviso si
   * ese proveedor ya usa el mismo código en otra pieza (no se pisa).
   */
  private async linkSupplierCode(
    tx: Prisma.TransactionClient,
    supplierId: string | null | undefined,
    variantId: string,
    rawCode: string | null | undefined,
  ): Promise<string | null> {
    const code = rawCode?.trim();
    if (!supplierId || !code) return null;
    const supplier = await tx.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier?.isActive) throw new NotFoundError('Proveedor activo no encontrado');
    const taken = await tx.supplierProduct.findFirst({
      where: { supplierId, supplierCode: code, variantId: { not: variantId } },
    });
    if (taken) {
      return `El proveedor «${supplier.name}» ya usa el código «${code}» en otra pieza; no se asoció a esta.`;
    }
    await tx.supplierProduct.upsert({
      where: { supplierId_variantId: { supplierId, variantId } },
      update: { supplierCode: code },
      create: { supplierId, variantId, supplierCode: code },
    });
    return null;
  }

  /**
   * El precio de venta solo se fija al CREAR la pieza o variante, y únicamente con `prices:approve`
   * (queda en el historial como INITIAL). Todo cambio posterior pasa por el módulo de precios.
   */
  private assertCanSetInitialPrice(salePrice: string | undefined, request: FastifyRequest) {
    if (
      salePrice !== undefined &&
      hasSalePrice(salePrice) &&
      !getAuth(request).user.permissions.includes(PERMISSIONS.PRICES_APPROVE)
    ) {
      throw new ForbiddenError('No tiene permiso para establecer precios');
    }
  }

  private async validateSelections(
    tx: Prisma.TransactionClient,
    selections: ConfigureAxesInput['axes'],
  ): Promise<Selection[]> {
    const result: Selection[] = [];
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

  /** Valida las características descriptivas: tipo de dato y valor coherentes con el atributo. */
  private async validateAttributes(tx: Prisma.TransactionClient, items: ProductAttributeInput[]) {
    const data: {
      attributeId: string;
      optionId: string | null;
      valueText: string | null;
      valueNumber: string | null;
      valueBoolean: boolean | null;
    }[] = [];
    for (const item of items) {
      const attribute = await tx.attribute.findUnique({ where: { id: item.attributeId } });
      if (!attribute?.isActive) throw new ValidationError('Atributo activo no encontrado');
      const optionId = item.optionId ?? null;
      const valueText = item.valueText ?? null;
      const valueNumber = item.valueNumber ?? null;
      const valueBoolean = item.valueBoolean ?? null;
      const given = [optionId, valueText, valueNumber, valueBoolean].filter(
        (value) => value !== null,
      ).length;
      const expected = {
        OPTION: optionId,
        TEXT: valueText,
        NUMBER: valueNumber,
        BOOLEAN: valueBoolean,
      }[attribute.dataType];
      if (given !== 1 || expected === null) {
        throw new ValidationError(`Valor inválido para ${attribute.name}`);
      }
      if (optionId) {
        const option = await tx.attributeOption.findUnique({ where: { id: optionId } });
        if (!option?.isActive || option.attributeId !== attribute.id) {
          throw new ValidationError('La opción no pertenece al atributo activo');
        }
      }
      data.push({ attributeId: attribute.id, optionId, valueText, valueNumber, valueBoolean });
    }
    return data;
  }

  private labelFor(selections: Selection[], order: string[]) {
    const label = order
      .map((attributeId) => selections.find((item) => item.attributeId === attributeId)?.value)
      .filter((value): value is string => value !== undefined)
      .join(' / ');
    if (label.length > 200) throw new ValidationError('La etiqueta de variante es demasiado larga');
    return label;
  }

  private listWhere(input: {
    q: string;
    status: string;
    categoryId?: string | undefined;
    incomplete: boolean;
    withoutPrice: boolean;
  }): Prisma.ProductWhereInput {
    const filters: Prisma.ProductWhereInput[] = [];
    if (input.status !== 'all') {
      filters.push({ status: input.status as 'DRAFT' | 'ACTIVE' | 'INACTIVE' });
    }
    if (input.categoryId) filters.push({ categoryId: input.categoryId });
    if (input.q) {
      filters.push({
        OR: [
          { name: { contains: input.q, mode: 'insensitive' } },
          {
            variants: {
              some: {
                OR: [
                  { sku: { contains: input.q, mode: 'insensitive' } },
                  { barcode: { contains: input.q, mode: 'insensitive' } },
                  {
                    supplierProducts: {
                      some: { supplierCode: { contains: input.q, mode: 'insensitive' } },
                    },
                  },
                ],
              },
            },
          },
        ],
      });
    }
    // Los filtros de calidad coinciden con los contadores del Inicio: ignoran productos inactivos.
    if (input.incomplete) filters.push({ status: { not: 'INACTIVE' } }, incompleteWhere);
    if (input.withoutPrice) filters.push({ status: { not: 'INACTIVE' } }, withoutPriceWhere);
    return filters.length > 0 ? { AND: filters } : {};
  }

  async list(
    input: {
      page: number;
      pageSize: number;
      q: string;
      status: string;
      categoryId?: string | undefined;
      incomplete: boolean;
      withoutPrice: boolean;
    },
    showStock = false,
  ) {
    const where = this.listWhere(input);
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

  /** Contadores de calidad del catálogo para el Inicio (sin costos). Ignora productos inactivos. */
  async health() {
    const active = { status: { not: 'INACTIVE' } } satisfies Prisma.ProductWhereInput;
    const [activeProducts, incompleteProducts, productsWithoutPrice] = await Promise.all([
      this.prisma.product.count({ where: active }),
      this.prisma.product.count({ where: { AND: [active, incompleteWhere] } }),
      this.prisma.product.count({ where: { AND: [active, withoutPriceWhere] } }),
    ]);
    return { activeProducts, incompleteProducts, productsWithoutPrice };
  }

  async get(id: string, showStock = false) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: withDetails });
    if (!product) throw new NotFoundError('Producto no encontrado');
    return toResponse(product, showStock);
  }

  /**
   * Búsqueda unificada (lector USB/Bluetooth = teclado): SKU, código de barras o código del
   * proveedor. Devuelve la variante o 404. Si el código de un proveedor corresponde a varias
   * piezas distintas, pide usar el SKU (409).
   */
  async lookupVariant(rawCode: string, showStock = false): Promise<VariantLookup> {
    const code = rawCode.trim();
    const include = { product: { include: { category: true } }, inventory: true } as const;
    let matchedBy: VariantLookup['matchedBy'] = 'SKU';
    let variant = await this.prisma.productVariant.findFirst({
      where: { sku: { in: skuCandidates(code) } },
      include,
    });
    if (!variant) {
      matchedBy = 'BARCODE';
      variant = await this.prisma.productVariant.findUnique({ where: { barcode: code }, include });
    }
    if (!variant) {
      matchedBy = 'SUPPLIER_CODE';
      const links = await this.prisma.supplierProduct.findMany({
        where: { supplierCode: code },
        select: { variantId: true },
      });
      const ids = [...new Set(links.map((link) => link.variantId))];
      if (ids.length > 1) {
        throw new ConflictError(
          'Ese código de proveedor corresponde a varias piezas. Búsquela por su SKU.',
          { count: ids.length },
        );
      }
      const [id] = ids;
      if (id) variant = await this.prisma.productVariant.findUnique({ where: { id }, include });
    }
    if (!variant) throw new NotFoundError('No existe una pieza con ese código');
    return {
      variantId: variant.id,
      productId: variant.productId,
      productName: variant.product.name,
      categoryName: variant.product.category.name,
      label: variant.label,
      sku: variant.sku,
      barcode: variant.barcode,
      salePrice: variant.salePrice.toFixed(2),
      status: variant.status,
      productStatus: variant.product.status,
      matchedBy,
      ...(showStock && { stockQuantity: variant.inventory?.quantity ?? 0 }),
    };
  }

  async lookup(code: string, showStock = false) {
    const variant = await this.lookupVariant(code);
    return this.get(variant.productId, showStock);
  }

  async create(input: CreateProductInput, request: FastifyRequest) {
    this.assertCanSetInitialPrice(input.salePrice, request);
    return this.prisma.$transaction((tx) => this.createWithin(tx, input, request));
  }

  /**
   * Alta de producto + variante única dentro de una transacción ajena. La reutiliza el alta
   * rápida de piezas desde un ingreso (C1), que añade `profileIncomplete` y su propia metadata.
   * No comprueba permisos: quien llama debe haberlos validado. Devuelve la ficha y los avisos
   * (p. ej. código de proveedor repetido, Q-10).
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
    const axes = input.axes ? await this.validateSelections(tx, input.axes) : [];
    const attributes = await this.validateAttributes(tx, input.attributes);
    if (attributes.some((item) => axes.some((axis) => axis.attributeId === item.attributeId))) {
      throw new ValidationError('Un eje de variante no puede ser también una característica');
    }
    const code = await this.checkProviderCode(tx, input.barcode);
    const warnings = code.warning ? [code.warning] : [];
    const product = await tx.product.create({
      data: {
        categoryId: input.categoryId,
        name: input.name,
        description: input.description || null,
        model: input.model || null,
        profileIncomplete: options.profileIncomplete ?? false,
        attributeValues: { createMany: { data: attributes } },
        variantAxes: {
          createMany: {
            data: axes.map((axis, sortOrder) => ({ attributeId: axis.attributeId, sortOrder })),
          },
        },
        variants: {
          create: {
            sku,
            label:
              axes.length > 0
                ? this.labelFor(
                    axes,
                    axes.map((axis) => axis.attributeId),
                  )
                : 'Única',
            barcode: code.barcode,
            salePrice: input.salePrice ?? '0',
            minStock: input.minStock,
            attributeValues: {
              createMany: {
                data: axes.map(({ attributeId, optionId }) => ({ attributeId, optionId })),
              },
            },
          },
        },
      },
      include: withDetails,
    });
    const baseVariant = product.variants[0];
    if (baseVariant) {
      const link = await this.linkSupplierCode(tx, input.supplierId, baseVariant.id, input.barcode);
      if (link) warnings.push(link);
      if (input.salePrice !== undefined) {
        await recordInitialPrice(tx, baseVariant, input.salePrice, request);
      }
    }
    const after = toResponse(product);
    const metadata = {
      ...(options.metadata as Record<string, unknown> | undefined),
      ...(warnings.length > 0 && { warnings }),
    } as Prisma.InputJsonValue;
    await recordAudit(
      tx,
      {
        action: 'product.created',
        entityType: 'Product',
        entityId: product.id,
        after,
        ...(Object.keys(metadata).length > 0 && { metadata }),
      },
      request,
    );
    return { product: after, warnings };
  }

  async update(id: string, input: UpdateProductInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${id}::uuid FOR UPDATE`;
      const previous = await tx.product.findUnique({ where: { id }, include: withDetails });
      if (!previous) throw new NotFoundError('Producto no encontrado');
      const deactivating = input.status === 'INACTIVE' && previous.status !== 'INACTIVE';
      if (deactivating) await assertNoStock(tx, { productId: id });
      if (input.attributes) {
        if (
          input.attributes.some((item) =>
            previous.variantAxes.some((axis) => axis.attributeId === item.attributeId),
          )
        ) {
          throw new ValidationError('Un eje de variante no puede ser también una característica');
        }
        const attributes = await this.validateAttributes(tx, input.attributes);
        await tx.productAttributeValue.deleteMany({ where: { productId: id } });
        if (attributes.length > 0) {
          await tx.productAttributeValue.createMany({
            data: attributes.map((item) => ({ ...item, productId: id })),
          });
        }
      }
      const updated = await tx.product.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.model !== undefined && { model: input.model || null }),
          ...(input.description !== undefined && { description: input.description || null }),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.profileIncomplete !== undefined && {
            profileIncomplete: input.profileIncomplete,
          }),
        },
        include: withDetails,
      });
      const before = toResponse(previous);
      const after = toResponse(updated);
      await recordAudit(
        tx,
        {
          action:
            previous.status !== updated.status
              ? updated.status === 'INACTIVE'
                ? 'product.deactivated'
                : 'product.activated'
              : 'product.updated',
          entityType: 'Product',
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
   * B11: eliminación física de una ficha, solo si ni el producto ni sus variantes tienen
   * historial (movimientos, saldo distinto de cero, ítems de ingresos o conteos). Si lo tienen,
   * se debe desactivar (previo ajuste a cero). Deja auditoría con la ficha eliminada.
   */
  async remove(id: string, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${id}::uuid FOR UPDATE`;
      const product = await tx.product.findUnique({ where: { id }, include: withDetails });
      if (!product) throw new NotFoundError('Producto no encontrado');
      const variantIds = product.variants.map((variant) => variant.id);
      // Mismo orden de bloqueo que el libro de inventario (variantes por id y luego saldos), antes
      // de contar: una operación de stock en curso termina primero y su movimiento se ve abajo.
      await lockVariantsAndBalances(tx, variantIds);
      const [movements, balances, entryItems, countItems] = await Promise.all([
        tx.inventoryMovement.count({ where: { variantId: { in: variantIds } } }),
        tx.inventoryBalance.count({
          where: { variantId: { in: variantIds }, quantity: { not: 0 } },
        }),
        tx.stockEntryItem.count({ where: { variantId: { in: variantIds } } }),
        tx.inventoryCountItem.count({ where: { variantId: { in: variantIds } } }),
      ]);
      const reasons = [
        movements > 0 && `${movements} movimiento(s) de inventario`,
        balances > 0 && 'saldo de stock distinto de cero',
        entryItems > 0 && `${entryItems} ítem(s) de ingresos de mercadería`,
        countItems > 0 && `${countItems} registro(s) de inventario físico`,
      ].filter((reason): reason is string => reason !== false);
      if (reasons.length > 0) {
        throw new BusinessRuleError(
          `No se puede eliminar el producto: tiene ${reasons.join(', ')}. ` +
            'Déjelo en cero con un ajuste de salida y desactívelo.',
          { movements, nonZeroBalances: balances, entryItems, countItems },
        );
      }
      // Saldos en cero sin movimientos (si existieran) no son historial.
      await dropEmptyBalances(tx, variantIds);
      await tx.productVariant.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
      await recordAudit(
        tx,
        {
          action: 'product.deleted',
          entityType: 'Product',
          entityId: id,
          before: toResponse(product),
        },
        request,
      );
      return { id };
    });
  }

  /** Activa o desactiva una variante. Desactivar se bloquea con stock disponible (P-22). */
  async updateVariantStatus(
    variantId: string,
    input: UpdateVariantStatusInput,
    request: FastifyRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${variantId}::uuid FOR UPDATE`;
      const previous = await tx.productVariant.findUnique({ where: { id: variantId } });
      if (!previous) throw new NotFoundError('Variante no encontrada');
      if (input.status === 'INACTIVE' && previous.status !== 'INACTIVE') {
        await assertNoStock(tx, { variantId });
      }
      if (previous.status !== input.status) {
        await tx.productVariant.update({
          where: { id: variantId },
          data: { status: input.status },
        });
        await recordAudit(
          tx,
          {
            action: input.status === 'INACTIVE' ? 'variant.deactivated' : 'variant.activated',
            entityType: 'ProductVariant',
            entityId: variantId,
            before: { status: previous.status },
            after: { status: input.status },
          },
          request,
        );
      }
      const product = await tx.product.findUniqueOrThrow({
        where: { id: previous.productId },
        include: withDetails,
      });
      return toResponse(product);
    });
  }

  /** B10: el stock mínimo por variante (0 = alerta desactivada) lo modifica el catálogo. */
  async updateVariant(variantId: string, input: UpdateVariantInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${variantId}::uuid FOR UPDATE`;
      const previous = await tx.productVariant.findUnique({ where: { id: variantId } });
      if (!previous) throw new NotFoundError('Variante no encontrada');
      if (previous.minStock !== input.minStock) {
        await tx.productVariant.update({
          where: { id: variantId },
          data: { minStock: input.minStock },
        });
        await recordAudit(
          tx,
          {
            action: 'variant.min_stock_changed',
            entityType: 'ProductVariant',
            entityId: variantId,
            before: { minStock: previous.minStock },
            after: { minStock: input.minStock },
          },
          request,
        );
      }
      const product = await tx.product.findUniqueOrThrow({
        where: { id: previous.productId },
        include: withDetails,
      });
      return toResponse(product);
    });
  }

  /**
   * Registra el código del proveedor de una variante. Si ya pertenece a otra pieza no se guarda
   * como código de barras (Q-10): con proveedor conocido se conserva en `SupplierProduct` y se
   * avisa; sin proveedor no hay nada que guardar y responde 409.
   */
  async assignBarcode(variantId: string, input: AssignBarcodeInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${variantId}::uuid FOR UPDATE`;
      const previous = await tx.productVariant.findUnique({ where: { id: variantId } });
      if (!previous) throw new NotFoundError('Variante no encontrada');
      if (previous.barcode)
        throw new BusinessRuleError('Esta variante ya tiene un código de barras');
      const code = await this.checkProviderCode(tx, input.barcode, variantId);
      const warnings: string[] = [];
      if (code.warning) {
        if (!input.supplierId) throw new ConflictError(code.warning, { owner: code.owner });
        warnings.push(code.warning);
      } else {
        await tx.productVariant.update({
          where: { id: variantId },
          data: { barcode: code.barcode },
        });
        await recordAudit(
          tx,
          {
            action: 'variant.barcode_assigned',
            entityType: 'ProductVariant',
            entityId: variantId,
            before: { barcode: null },
            after: { barcode: code.barcode },
          },
          request,
        );
      }
      const link = await this.linkSupplierCode(tx, input.supplierId, variantId, input.barcode);
      if (link) warnings.push(link);
      const product = await tx.product.findUniqueOrThrow({
        where: { id: previous.productId },
        include: withDetails,
      });
      return { product: toResponse(product), warnings };
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
        include: { variants: true, variantAxes: true, attributeValues: true },
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
      if (
        input.axes.some((axis) =>
          product.attributeValues.some((value) => value.attributeId === axis.attributeId),
        )
      ) {
        throw new ValidationError('Una característica del producto no puede ser eje de variante');
      }
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
      const label = this.labelFor(
        selections,
        selections.map((item) => item.attributeId),
      );
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
    this.assertCanSetInitialPrice(input.salePrice, request);
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
      const code = await this.checkProviderCode(tx, input.barcode);
      const warnings = code.warning ? [code.warning] : [];
      const label = this.labelFor(
        selections,
        [...axes].sort((a, b) => a.sortOrder - b.sortOrder).map((axis) => axis.attributeId),
      );
      const variant = await tx.productVariant.create({
        data: {
          productId,
          sku,
          barcode: code.barcode,
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
      const link = await this.linkSupplierCode(tx, input.supplierId, variant.id, input.barcode);
      if (link) warnings.push(link);
      if (input.salePrice !== undefined) {
        await recordInitialPrice(tx, variant, input.salePrice, request);
      }
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
          metadata: { productId, ...(warnings.length > 0 && { warnings }) },
        },
        request,
      );
      return { product: after, warnings };
    });
  }
}
