import {
  REFERENCE_TYPES,
  countLabel,
  type CancelInventoryCountInput,
  type CountScanRecord,
  type CountScanResult,
  type CreateInventoryCountInput,
  type InventoryCountDetail,
  type InventoryCountStatus,
  MAX_COUNT_QUANTITY,
} from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.ts';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../lib/errors.ts';
import { canSeeCosts } from '../../lib/permissions.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { skuCandidates } from '../../lib/sku.ts';
import { getAuth } from '../../plugins/auth.ts';
import { recordAudit } from '../audit/audit.service.ts';
import { applyStockChanges } from '../inventory/stock-ledger.ts';
import {
  finalCountOf,
  findScopeOverlaps,
  needsRecount,
  normalizeScanCode,
  reconcileCount,
} from './count-logic.ts';
import {
  OPEN_STATUSES,
  buildBlindDetail,
  buildReviewDetail,
  countInclude,
  loadFinding,
  loadReconciliation,
  loadStats,
  scanInclude,
  toBlindItem,
  toLastScan,
  toSummary,
  type CountRow,
  type Db,
} from './count-views.ts';

/** Tipo de documento que referencian los movimientos que genera un conteo aprobado. */

/** Bloqueo de aviso (advisory) que serializa la creación/inicio de conteos: evita solapamientos. */
const SCOPE_LOCK = 680_021;

const TX_OPTIONS = { timeout: 60_000, maxWait: 15_000 } as const;

const ENDED = ['APPROVED', 'CANCELLED'];

export class InventoryCountsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ------------------------------------------------------------------ lectura

  private async loadRow(db: Db, id: string): Promise<CountRow> {
    const row = await db.inventoryCount.findUnique({ where: { id }, include: countInclude });
    if (!row) throw new NotFoundError('Conteo no encontrado');
    return row;
  }

  /** Vista del conteo según su estado: a ciegas en captura/recuento, completa desde la revisión. */
  private async detail(db: Db, id: string, request: FastifyRequest): Promise<InventoryCountDetail> {
    const row = await this.loadRow(db, id);
    const stats = (await loadStats(db, [id])).get(id);
    if (row.status === 'IN_REVIEW' || row.status === 'APPROVED') {
      return buildReviewDetail(db, row, stats, canSeeCosts(request));
    }
    return buildBlindDetail(db, row, stats);
  }

  async list(input: { page: number; pageSize: number; status: string }) {
    const where: Prisma.InventoryCountWhereInput =
      input.status === 'all'
        ? {}
        : input.status === 'open'
          ? { status: { in: [...OPEN_STATUSES] } }
          : { status: input.status as InventoryCountStatus };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inventoryCount.findMany({
        where,
        include: countInclude,
        orderBy: [{ number: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.inventoryCount.count({ where }),
    ]);
    const stats = await loadStats(
      this.prisma,
      rows.map((row) => row.id),
    );
    return {
      data: rows.map((row) => toSummary(row, stats.get(row.id))),
      meta: { page: input.page, pageSize: input.pageSize, total },
    };
  }

  async get(id: string, request: FastifyRequest) {
    return this.detail(this.prisma, id, request);
  }

  async scans(id: string, input: { page: number; pageSize: number }) {
    await this.loadRow(this.prisma, id);
    const where = { inventoryCountId: id };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inventoryCountScan.findMany({
        where,
        include: { ...scanInclude, user: true },
        orderBy: { id: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.inventoryCountScan.count({ where }),
    ]);
    const data: CountScanRecord[] = rows.map((row) => ({
      id: row.id.toString(),
      round: row.round,
      code: row.code,
      source: row.source,
      variantId: row.variantId ?? null,
      sku: row.variant?.sku ?? null,
      productName: row.variant?.product.name ?? null,
      findingCode: row.finding?.code ?? null,
      delta: row.delta,
      quantityAfter: row.quantityAfter,
      userName: row.user.name,
      createdAt: row.createdAt.toISOString(),
      undone: row.undoneAt !== null,
    }));
    return { data, meta: { page: input.page, pageSize: input.pageSize, total } };
  }

  // ------------------------------------------------------------------ alcance

  /** Categoría y todas sus descendientes (cualquier profundidad). */
  private async categoryTree(db: Db, categoryId: string): Promise<string[]> {
    const rows = await db.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE tree AS (
        SELECT id FROM categories WHERE id = ${categoryId}::uuid
        UNION ALL
        SELECT c.id FROM categories c JOIN tree t ON c.parent_id = t.id
      )
      SELECT id::text AS id FROM tree`;
    return rows.map((row) => row.id);
  }

  /**
   * Variantes del alcance: todas las ACTIVAS de la categoría (y subcategorías) y las inactivas que
   * todavía tienen saldo > 0.
   */
  private async scopeVariantIds(db: Db, categoryId: string): Promise<string[]> {
    const categoryIds = await this.categoryTree(db, categoryId);
    const variants = await db.productVariant.findMany({
      where: {
        product: { categoryId: { in: categoryIds } },
        OR: [
          { status: 'ACTIVE', product: { status: 'ACTIVE' } },
          { inventory: { is: { quantity: { gt: 0 } } } },
        ],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return variants.map((variant) => variant.id);
  }

  /** Rechaza el conteo si alguna variante ya está en otro conteo no terminado (Q-13 B). */
  private async assertNoOverlap(db: Db, variantIds: readonly string[], excludeId: string | null) {
    const others = await db.inventoryCount.findMany({
      where: {
        status: { in: [...OPEN_STATUSES] },
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true, number: true, status: true, categoryId: true },
    });
    if (others.length === 0) return;
    const started = others.filter((other) => other.status !== 'DRAFT');
    const itemRows = started.length
      ? await db.inventoryCountItem.findMany({
          where: { inventoryCountId: { in: started.map((other) => other.id) } },
          select: { inventoryCountId: true, variantId: true },
        })
      : [];
    const byCount = new Map<string, string[]>();
    for (const row of itemRows) {
      const list = byCount.get(row.inventoryCountId) ?? [];
      list.push(row.variantId);
      byCount.set(row.inventoryCountId, list);
    }
    const candidates = [];
    for (const other of others) {
      const ids =
        other.status === 'DRAFT'
          ? other.categoryId
            ? await this.scopeVariantIds(db, other.categoryId)
            : []
          : (byCount.get(other.id) ?? []);
      candidates.push({ id: other.id, number: other.number, variantIds: ids });
    }
    const overlaps = findScopeOverlaps(variantIds, candidates);
    const first = overlaps[0];
    if (first) {
      throw new ConflictError(
        `Las variantes de esta categoría ya están en el conteo ${countLabel(first.number)} (${first.sharedVariants} en común). ` +
          'Termínelo o cancélelo antes, o elija otra categoría: dos conteos simultáneos no pueden compartir variantes.',
        { overlaps },
      );
    }
  }

  private async categoryPath(db: Db, categoryId: string): Promise<string> {
    const names: string[] = [];
    let cursor: string | null = categoryId;
    for (let depth = 0; cursor && depth < 20; depth += 1) {
      const category: { name: string; parentId: string | null } | null =
        await db.category.findUnique({
          where: { id: cursor },
          select: { name: true, parentId: true },
        });
      if (!category) break;
      names.unshift(category.name);
      cursor = category.parentId;
    }
    return names.join(' › ').slice(0, 200);
  }

  // ------------------------------------------------------------------ ciclo de vida

  async create(input: CreateInventoryCountInput, request: FastifyRequest) {
    const userId = getAuth(request).user.id;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SCOPE_LOCK}::bigint)`;
      const category = await tx.category.findUnique({ where: { id: input.categoryId } });
      if (!category) throw new NotFoundError('Categoría no encontrada');
      const variantIds = await this.scopeVariantIds(tx, category.id);
      if (variantIds.length === 0) {
        throw new BusinessRuleError(
          'La categoría no tiene variantes para contar (ni activas ni con saldo).',
        );
      }
      await this.assertNoOverlap(tx, variantIds, null);

      const scope = await this.categoryPath(tx, category.id);
      const created = await tx.inventoryCount.create({
        data: {
          categoryId: category.id,
          scope,
          notes: input.notes ?? null,
          createdById: userId,
        },
      });
      await recordAudit(
        tx,
        {
          action: 'inventory_count.created',
          entityType: 'InventoryCount',
          entityId: created.id,
          after: {
            number: created.number,
            status: 'DRAFT',
            categoryId: category.id,
            scope,
            variants: variantIds.length,
          },
        },
        request,
      );
      return this.detail(tx, created.id, request);
    }, TX_OPTIONS);
  }

  /** Bloquea la fila del conteo: serializa capturas, cierres, aprobaciones y cancelaciones. */
  private async lockCount(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<{ status: InventoryCountStatus; operator_id: string | null }[]>`
      SELECT status::text AS status, operator_id::text AS operator_id
      FROM inventory_counts WHERE id = ${id}::uuid FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new NotFoundError('Conteo no encontrado');
    return { status: row.status, operatorId: row.operator_id };
  }

  /** Bloquea el conteo y exige que esté en captura/recuento y que quien actúa sea el operador. */
  private async lockForCapture(tx: Prisma.TransactionClient, id: string, userId: string) {
    const locked = await this.lockCount(tx, id);
    if (locked.status !== 'IN_PROGRESS' && locked.status !== 'RECOUNT') {
      throw new BusinessRuleError(
        locked.status === 'DRAFT'
          ? 'El conteo aún no se inició.'
          : 'El conteo ya no está en captura.',
        { status: locked.status },
      );
    }
    if (locked.operatorId !== userId) {
      const operator = locked.operatorId
        ? await tx.user.findUnique({ where: { id: locked.operatorId }, select: { name: true } })
        : null;
      throw new ForbiddenError(
        `El conteo lo está capturando ${operator?.name ?? 'otro usuario'}. ` +
          'Use «Tomar el conteo» si debe continuar usted.',
      );
    }
    return {
      status: locked.status,
      round: locked.status === 'RECOUNT' ? (2 as const) : (1 as const),
    };
  }

  private async lockVariants(tx: Prisma.TransactionClient, ids: readonly string[]) {
    if (ids.length === 0) return;
    await tx.$queryRaw`
      SELECT id FROM product_variants WHERE id = ANY(${ids as string[]}::uuid[]) ORDER BY id FOR UPDATE`;
  }

  /** Último movimiento del libro por variante (cursor de conciliación). 0 si no tiene. */
  private async cursorsOf(tx: Prisma.TransactionClient, ids: readonly string[]) {
    const cursors = new Map<string, bigint>();
    if (ids.length === 0) return cursors;
    const rows = await tx.$queryRaw<{ variant_id: string; cursor: bigint }[]>`
      SELECT variant_id::text AS variant_id, max(id) AS cursor
      FROM inventory_movements WHERE variant_id = ANY(${ids as string[]}::uuid[])
      GROUP BY variant_id`;
    for (const row of rows) cursors.set(row.variant_id, row.cursor);
    return cursors;
  }

  /** Inicia el conteo: toma la foto del sistema y el cursor de movimientos, y asigna el operador. */
  async start(id: string, request: FastifyRequest) {
    const userId = getAuth(request).user.id;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SCOPE_LOCK}::bigint)`;
      const locked = await this.lockCount(tx, id);
      if (locked.status !== 'DRAFT') {
        throw new BusinessRuleError('Solo se puede iniciar un conteo en borrador.', {
          status: locked.status,
        });
      }
      const row = await this.loadRow(tx, id);
      if (!row.categoryId) throw new BusinessRuleError('El conteo no tiene categoría.');
      const variantIds = await this.scopeVariantIds(tx, row.categoryId);
      if (variantIds.length === 0) {
        throw new BusinessRuleError('La categoría ya no tiene variantes para contar.');
      }
      await this.assertNoOverlap(tx, variantIds, id);

      // Los saldos y el cursor se leen DESPUÉS de bloquear las variantes: la foto tiene un punto
      // lógico común y ningún movimiento queda "entre" la foto y el cursor.
      await this.lockVariants(tx, variantIds);
      const balances = await tx.inventoryBalance.findMany({
        where: { variantId: { in: variantIds } },
        select: { variantId: true, quantity: true },
      });
      const quantity = new Map(balances.map((balance) => [balance.variantId, balance.quantity]));
      const cursors = await this.cursorsOf(tx, variantIds);
      await tx.inventoryCountItem.createMany({
        data: variantIds.map((variantId) => ({
          inventoryCountId: id,
          variantId,
          systemQty: quantity.get(variantId) ?? 0,
          snapshotCursor: cursors.get(variantId) ?? 0n,
        })),
      });
      await tx.inventoryCount.update({
        where: { id },
        data: { status: 'IN_PROGRESS', startedAt: new Date(), operatorId: userId },
      });
      await recordAudit(
        tx,
        {
          action: 'inventory_count.started',
          entityType: 'InventoryCount',
          entityId: id,
          before: { status: 'DRAFT' },
          after: { status: 'IN_PROGRESS', number: row.number, variants: variantIds.length },
        },
        request,
      );
      return this.detail(tx, id, request);
    }, TX_OPTIONS);
  }

  /** Quien tiene permiso de captura toma el conteo (un solo operador a la vez). */
  async take(id: string, request: FastifyRequest) {
    const userId = getAuth(request).user.id;
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockCount(tx, id);
      if (locked.status !== 'IN_PROGRESS' && locked.status !== 'RECOUNT') {
        throw new BusinessRuleError('Solo se puede tomar un conteo en captura o recuento.', {
          status: locked.status,
        });
      }
      if (locked.operatorId !== userId) {
        await tx.inventoryCount.update({ where: { id }, data: { operatorId: userId } });
        await recordAudit(
          tx,
          {
            action: 'inventory_count.taken',
            entityType: 'InventoryCount',
            entityId: id,
            before: { operatorId: locked.operatorId },
            after: { operatorId: userId, status: locked.status },
          },
          request,
        );
      }
      return this.detail(tx, id, request);
    }, TX_OPTIONS);
  }

  // ------------------------------------------------------------------ captura

  /** Resuelve el código leído: SKU, código de barras o código de proveedor (en ese orden). */
  private async resolveVariant(tx: Prisma.TransactionClient, code: string) {
    const include = { product: true } as const;
    const bySku = await tx.productVariant.findFirst({
      where: { sku: { in: skuCandidates(code) } },
      include,
    });
    if (bySku) return bySku;
    const byBarcode = await tx.productVariant.findFirst({ where: { barcode: code }, include });
    if (byBarcode) return byBarcode;
    const supplier = await tx.supplierProduct.findMany({
      where: { supplierCode: code },
      select: { variantId: true },
    });
    const ids = [...new Set(supplier.map((entry) => entry.variantId))];
    if (ids.length > 1) {
      throw new BusinessRuleError(
        `El código de proveedor «${code}» corresponde a varias piezas: escanee el SKU o el código de barras.`,
        { code },
      );
    }
    const only = ids[0];
    return only ? tx.productVariant.findUnique({ where: { id: only }, include }) : null;
  }

  private async progressOf(tx: Prisma.TransactionClient, id: string, round: 1 | 2) {
    const stats = (await loadStats(tx, [id])).get(id);
    return round === 2
      ? { piecesCounted: stats?.recountPieces ?? 0, scannedVariants: stats?.recountDone ?? 0 }
      : { piecesCounted: stats?.pieces ?? 0, scannedVariants: stats?.scanned ?? 0 };
  }

  /** Bloquea la variante y devuelve su último movimiento: el «momento» de esta captura. */
  private async captureCursor(tx: Prisma.TransactionClient, variantId: string) {
    await this.lockVariants(tx, [variantId]);
    return (await this.cursorsOf(tx, [variantId])).get(variantId) ?? 0n;
  }

  /**
   * Escaneo: el código se resuelve a una variante y suma 1 pieza. Cada lectura se guarda al
   * instante (pieza por pieza), de modo que el conteo se reanuda sin pérdida (E5).
   */
  async scan(id: string, rawCode: string, request: FastifyRequest): Promise<CountScanResult> {
    const userId = getAuth(request).user.id;
    const code = normalizeScanCode(rawCode);
    if (!code) throw new BusinessRuleError('Escanee o escriba un código.');
    return this.prisma.$transaction(async (tx) => {
      const { round } = await this.lockForCapture(tx, id, userId);
      const variant = await this.resolveVariant(tx, code);
      const item = variant
        ? await tx.inventoryCountItem.findUnique({
            where: { inventoryCountId_variantId: { inventoryCountId: id, variantId: variant.id } },
          })
        : null;

      if (variant && item) {
        if (round === 2 && !item.needsRecount) {
          throw new BusinessRuleError('Esta pieza no está en la lista de recuento.');
        }
        const current = round === 2 ? (item.recountQty ?? 0) : (item.countedQty ?? 0);
        if (current + 1 > MAX_COUNT_QUANTITY) {
          throw new BusinessRuleError(`No se pueden contar más de ${MAX_COUNT_QUANTITY} piezas.`);
        }
        return this.recordItemChange(tx, {
          countId: id,
          round,
          itemId: item.id,
          variantId: variant.id,
          code,
          source: 'SCAN',
          next: current + 1,
          current,
          userId,
        });
      }
      return this.recordFinding(tx, { countId: id, round, code, variant, userId });
    }, TX_OPTIONS);
  }

  private async recordItemChange(
    tx: Prisma.TransactionClient,
    input: {
      countId: string;
      round: 1 | 2;
      itemId: string;
      variantId: string;
      code: string;
      source: 'SCAN' | 'MANUAL';
      current: number;
      next: number;
      userId: string;
    },
  ): Promise<CountScanResult> {
    const delta = input.next - input.current;
    if (delta === 0) {
      const item = await tx.inventoryCountItem.findUniqueOrThrow({
        where: { id: input.itemId },
        include: { variant: { include: { product: true } } },
      });
      return {
        scan: await this.lastScanOf(tx, input.countId),
        item: toBlindItem(item, input.round),
        finding: null,
        ...(await this.progressOf(tx, input.countId, input.round)),
      };
    }
    const cursor = await this.captureCursor(tx, input.variantId);
    const now = new Date();
    const item = await tx.inventoryCountItem.update({
      where: { id: input.itemId },
      data:
        input.round === 2
          ? { recountQty: input.next, recountCursor: cursor, recountedAt: now }
          : {
              countedQty: input.next,
              countedCursor: cursor,
              countedAt: now,
              countedById: input.userId,
            },
      include: { variant: { include: { product: true } } },
    });
    const scan = await tx.inventoryCountScan.create({
      data: {
        inventoryCountId: input.countId,
        round: input.round,
        variantId: input.variantId,
        code: input.code,
        source: input.source,
        delta,
        quantityAfter: input.next,
        movementCursor: cursor,
        userId: input.userId,
      },
      include: scanInclude,
    });
    return {
      scan: toLastScan(scan),
      item: toBlindItem(item, input.round),
      finding: null,
      ...(await this.progressOf(tx, input.countId, input.round)),
    };
  }

  private async lastScanOf(tx: Prisma.TransactionClient, countId: string) {
    const row = await tx.inventoryCountScan.findFirst({
      where: { inventoryCountId: countId, undoneAt: null },
      include: scanInclude,
      orderBy: { id: 'desc' },
    });
    return row ? toLastScan(row) : null;
  }

  /** Código desconocido o de otra categoría: se registra como hallazgo, sin tocar el stock. */
  private async recordFinding(
    tx: Prisma.TransactionClient,
    input: {
      countId: string;
      round: 1 | 2;
      code: string;
      variant: { id: string; sku: string } | null;
      userId: string;
    },
  ): Promise<CountScanResult> {
    const type = input.variant ? ('OUT_OF_SCOPE' as const) : ('NOT_FOUND' as const);
    // Las piezas fuera de alcance se agrupan por SKU (varios códigos de la misma pieza se suman).
    const code = (input.variant ? input.variant.sku : input.code).slice(0, 100);
    const finding = await tx.inventoryCountFinding.upsert({
      where: {
        inventoryCountId_round_code: { inventoryCountId: input.countId, round: input.round, code },
      },
      create: {
        inventoryCountId: input.countId,
        round: input.round,
        code,
        type,
        variantId: input.variant?.id ?? null,
        quantity: 1,
      },
      update: { quantity: { increment: 1 } },
    });
    if (finding.quantity > MAX_COUNT_QUANTITY) {
      throw new BusinessRuleError(`No se pueden registrar más de ${MAX_COUNT_QUANTITY} piezas.`);
    }
    const scan = await tx.inventoryCountScan.create({
      data: {
        inventoryCountId: input.countId,
        round: input.round,
        findingId: finding.id,
        code: input.code.slice(0, 100),
        source: 'SCAN',
        delta: 1,
        quantityAfter: finding.quantity,
        userId: input.userId,
      },
      include: scanInclude,
    });
    return {
      scan: toLastScan(scan),
      item: null,
      finding: await loadFinding(tx, finding.id),
      ...(await this.progressOf(tx, input.countId, input.round)),
    };
  }

  /** Fija a mano la cantidad contada de una variante en la ronda en curso. */
  async setQuantity(id: string, variantId: string, quantity: number, request: FastifyRequest) {
    const userId = getAuth(request).user.id;
    return this.prisma.$transaction(async (tx) => {
      const { round } = await this.lockForCapture(tx, id, userId);
      const item = await tx.inventoryCountItem.findUnique({
        where: { inventoryCountId_variantId: { inventoryCountId: id, variantId } },
        include: { variant: true },
      });
      if (!item || (round === 2 && !item.needsRecount)) {
        throw new NotFoundError('La pieza no forma parte de esta ronda del conteo.');
      }
      const current = round === 2 ? (item.recountQty ?? 0) : (item.countedQty ?? 0);
      return this.recordItemChange(tx, {
        countId: id,
        round,
        itemId: item.id,
        variantId,
        code: item.variant.sku,
        source: 'MANUAL',
        current,
        next: quantity,
        userId,
      });
    }, TX_OPTIONS);
  }

  /** Deshace la última lectura vigente de la ronda en curso (escaneo o cantidad fijada). */
  async undo(id: string, request: FastifyRequest): Promise<CountScanResult> {
    const userId = getAuth(request).user.id;
    return this.prisma.$transaction(async (tx) => {
      const { round } = await this.lockForCapture(tx, id, userId);
      const last = await tx.inventoryCountScan.findFirst({
        where: { inventoryCountId: id, round, undoneAt: null },
        orderBy: { id: 'desc' },
      });
      if (!last) throw new BusinessRuleError('No hay ninguna lectura para deshacer.');
      await tx.inventoryCountScan.update({
        where: { id: last.id },
        data: { undoneAt: new Date() },
      });

      let item = null;
      let finding = null;
      if (last.variantId) {
        const where = {
          inventoryCountId: id,
          round,
          variantId: last.variantId,
          undoneAt: null,
        };
        const sum = await tx.inventoryCountScan.aggregate({ where, _sum: { delta: true } });
        const previous = await tx.inventoryCountScan.findFirst({
          where,
          orderBy: { id: 'desc' },
        });
        const data =
          round === 2
            ? {
                recountQty: previous ? (sum._sum.delta ?? 0) : null,
                recountCursor: previous?.movementCursor ?? null,
                recountedAt: previous?.createdAt ?? null,
              }
            : {
                countedQty: previous ? (sum._sum.delta ?? 0) : null,
                countedCursor: previous?.movementCursor ?? null,
                countedAt: previous?.createdAt ?? null,
                countedById: previous?.userId ?? null,
              };
        item = await tx.inventoryCountItem.update({
          where: {
            inventoryCountId_variantId: { inventoryCountId: id, variantId: last.variantId },
          },
          data,
          include: { variant: { include: { product: true } } },
        });
      } else if (last.findingId) {
        const sum = await tx.inventoryCountScan.aggregate({
          where: { findingId: last.findingId, undoneAt: null },
          _sum: { delta: true },
        });
        await tx.inventoryCountFinding.update({
          where: { id: last.findingId },
          data: { quantity: sum._sum.delta ?? 0 },
        });
        finding = await loadFinding(tx, last.findingId);
      }
      return {
        scan: await this.lastScanOf(tx, id),
        item: item ? toBlindItem(item, round) : null,
        finding,
        ...(await this.progressOf(tx, id, round)),
      };
    }, TX_OPTIONS);
  }

  /** Nota del operador sobre un hallazgo (durante la captura). */
  async noteFinding(id: string, findingId: string, note: string, request: FastifyRequest) {
    const userId = getAuth(request).user.id;
    return this.prisma.$transaction(async (tx) => {
      await this.lockForCapture(tx, id, userId);
      const finding = await tx.inventoryCountFinding.findFirst({
        where: { id: findingId, inventoryCountId: id },
      });
      if (!finding) throw new NotFoundError('Hallazgo no encontrado');
      await tx.inventoryCountFinding.update({
        where: { id: findingId },
        data: { note: note || null },
      });
      return loadFinding(tx, findingId);
    }, TX_OPTIONS);
  }

  // ------------------------------------------------------------------ cierre de rondas

  /**
   * Cierra la ronda en curso. Primer conteo: las variantes sin lecturas cuentan como 0; si alguna
   * difiere de lo esperado (conciliado con los movimientos ocurridos), pasa a RECOUNT (segundo
   * recuento obligatorio, a ciegas, solo de esas variantes); si no, directo a revisión. Recuento:
   * las variantes sin lecturas cuentan como 0 y pasa a revisión.
   */
  async close(id: string, request: FastifyRequest) {
    const userId = getAuth(request).user.id;
    return this.prisma.$transaction(async (tx) => {
      const { status } = await this.lockForCapture(tx, id, userId);
      const items = await tx.inventoryCountItem.findMany({
        where: { inventoryCountId: id },
        orderBy: { id: 'asc' },
      });
      const now = new Date();
      const recounting = status === 'RECOUNT';

      // Las variantes sin lecturas se cuentan como 0 «en este momento».
      const empty = items.filter((item) =>
        recounting ? item.needsRecount && item.recountQty === null : item.countedQty === null,
      );
      if (empty.length > 0) {
        const ids = empty.map((item) => item.variantId);
        await this.lockVariants(tx, ids);
        const cursors = await this.cursorsOf(tx, ids);
        for (const item of empty) {
          const cursor = cursors.get(item.variantId) ?? 0n;
          await tx.inventoryCountItem.update({
            where: { id: item.id },
            data: recounting
              ? { recountQty: 0, recountCursor: cursor, recountedAt: now }
              : { countedQty: 0, countedCursor: cursor, countedAt: now, countedById: userId },
          });
        }
      }

      if (recounting) {
        await tx.inventoryCount.update({
          where: { id },
          data: { status: 'IN_REVIEW', reviewAt: now },
        });
        await recordAudit(
          tx,
          {
            action: 'inventory_count.recount_closed',
            entityType: 'InventoryCount',
            entityId: id,
            before: { status: 'RECOUNT' },
            after: { status: 'IN_REVIEW', recounted: items.filter((i) => i.needsRecount).length },
          },
          request,
        );
        return this.detail(tx, id, request);
      }

      // Primer conteo: ¿qué variantes difieren de lo esperado?
      const reconciliation = await loadReconciliation(tx, id);
      const byId = new Map(reconciliation.map((entry) => [entry.itemId, entry]));
      const fresh = await tx.inventoryCountItem.findMany({ where: { inventoryCountId: id } });
      const toRecount = fresh.filter((item) => {
        const live = byId.get(item.id);
        return needsRecount({
          countedQty: item.countedQty ?? 0,
          currentQty: live?.currentQty ?? 0,
          movementsSince: live?.since ?? 0,
        });
      });
      if (toRecount.length > 0) {
        await tx.inventoryCountItem.updateMany({
          where: { id: { in: toRecount.map((item) => item.id) } },
          data: { needsRecount: true },
        });
        await tx.inventoryCount.update({
          where: { id },
          data: { status: 'RECOUNT', firstClosedAt: now },
        });
      } else {
        await tx.inventoryCount.update({
          where: { id },
          data: { status: 'IN_REVIEW', firstClosedAt: now, reviewAt: now },
        });
      }
      await recordAudit(
        tx,
        {
          action: 'inventory_count.first_closed',
          entityType: 'InventoryCount',
          entityId: id,
          before: { status: 'IN_PROGRESS' },
          after: {
            status: toRecount.length > 0 ? 'RECOUNT' : 'IN_REVIEW',
            recountVariants: toRecount.length,
            variants: fresh.length,
          },
        },
        request,
      );
      return this.detail(tx, id, request);
    }, TX_OPTIONS);
  }

  // ------------------------------------------------------------------ aprobación y cancelación

  /**
   * Aprobación (ADR-014 + ADR-021). En UNA transacción: bloquea el conteo, bloquea las variantes,
   * concilia los movimientos ocurridos desde que se contó cada pieza, calcula la diferencia real y
   * genera un COUNT_ADJUSTMENT por variante con diferencia mediante el libro de stock (sin saldo
   * negativo), congela el resultado en las líneas y audita. Si algo falla, todo se revierte.
   */
  async approve(id: string, request: FastifyRequest) {
    const userId = getAuth(request).user.id;
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockCount(tx, id);
      if (locked.status !== 'IN_REVIEW') {
        throw new BusinessRuleError(
          locked.status === 'APPROVED'
            ? 'El conteo ya fue aprobado.'
            : 'Solo se puede aprobar un conteo en revisión.',
          { status: locked.status },
        );
      }
      const row = await this.loadRow(tx, id);
      const items = await tx.inventoryCountItem.findMany({
        where: { inventoryCountId: id },
        include: { variant: true },
        orderBy: { variantId: 'asc' },
      });
      // Con las variantes bloqueadas nadie mueve su saldo mientras se concilia y se ajusta.
      await this.lockVariants(
        tx,
        items.map((item) => item.variantId),
      );
      const reconciliation = new Map(
        (await loadReconciliation(tx, id)).map((entry) => [entry.itemId, entry]),
      );

      const plans = items.map((item) => {
        if (item.countedQty === null) {
          throw new BusinessRuleError('El conteo tiene variantes sin contar.');
        }
        const live = reconciliation.get(item.id);
        const final = finalCountOf(
          { qty: item.countedQty, cursor: item.countedCursor },
          { qty: item.recountQty, cursor: item.recountCursor },
        );
        const currentQty = live?.currentQty ?? 0;
        const since = live?.since ?? 0;
        return {
          item,
          finalQty: final.qty,
          currentQty,
          since,
          ...reconcileCount({ countedQty: final.qty, currentQty, movementsSince: since }),
        };
      });

      const withDifference = plans.filter((plan) => plan.difference !== 0);
      const applied = await applyStockChanges(
        tx,
        withDifference.map((plan) => ({
          variantId: plan.item.variantId,
          type: 'COUNT_ADJUSTMENT' as const,
          quantity: plan.difference,
          unitCost: plan.item.variant.costPrice.toFixed(4),
          referenceType: REFERENCE_TYPES.INVENTORY_COUNT,
          referenceId: id,
          reason: `Conteo ${countLabel(row.number)}`,
          notes:
            plan.since !== 0
              ? `Conciliado con movimientos posteriores al conteo (${plan.since > 0 ? '+' : ''}${plan.since}).`
              : null,
          userId,
          label: plan.item.variant.sku,
        })),
      );
      const appliedByVariant = new Map(
        withDifference.map((plan, index) => [plan.item.variantId, applied[index]]),
      );

      const audited: Record<string, string | number>[] = [];
      for (const plan of plans) {
        const result = appliedByVariant.get(plan.item.variantId);
        await tx.inventoryCountItem.update({
          where: { id: plan.item.id },
          data: {
            expectedQty: plan.expectedQty,
            finalQty: plan.finalQty,
            reconciledMovements: plan.since,
            difference: plan.difference,
            balanceBefore: result?.balanceBefore ?? plan.currentQty,
            balanceAfter: result?.balanceAfter ?? plan.currentQty,
            unitCost: plan.item.variant.costPrice.toFixed(4),
            movementId: result?.movementId ?? null,
          },
        });
        if (result) {
          audited.push({
            variantId: plan.item.variantId,
            sku: plan.item.variant.sku,
            expectedQty: plan.expectedQty,
            finalQty: plan.finalQty,
            difference: plan.difference,
            balanceBefore: result.balanceBefore,
            balanceAfter: result.balanceAfter,
            movementId: result.movementId.toString(),
          });
        }
      }

      await tx.inventoryCount.update({
        where: { id },
        data: { status: 'APPROVED', approvedAt: new Date(), approvedById: userId },
      });
      await recordAudit(
        tx,
        {
          action: 'inventory_count.approved',
          entityType: 'InventoryCount',
          entityId: id,
          before: { status: 'IN_REVIEW' },
          after: {
            status: 'APPROVED',
            number: row.number,
            variants: items.length,
            adjustments: audited,
          },
        },
        request,
      );
      return this.detail(tx, id, request);
    }, TX_OPTIONS);
  }

  /** Cancela el conteo (cualquier estado no terminado). No mueve stock. */
  async cancel(id: string, input: CancelInventoryCountInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockCount(tx, id);
      if (ENDED.includes(locked.status)) {
        throw new BusinessRuleError(
          locked.status === 'APPROVED'
            ? 'Un conteo aprobado no se puede cancelar.'
            : 'El conteo ya fue cancelado.',
          { status: locked.status },
        );
      }
      const row = await this.loadRow(tx, id);
      await tx.inventoryCount.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          resolutionNotes: input.reason ?? null,
        },
      });
      await recordAudit(
        tx,
        {
          action: 'inventory_count.cancelled',
          entityType: 'InventoryCount',
          entityId: id,
          before: { status: locked.status },
          after: { status: 'CANCELLED', number: row.number, reason: input.reason ?? null },
        },
        request,
      );
      return this.detail(tx, id, request);
    }, TX_OPTIONS);
  }

  /** El aprobador marca un hallazgo como regularizado (la regularización en sí es manual). */
  async regularizeFinding(id: string, findingId: string, note: string, request: FastifyRequest) {
    const userId = getAuth(request).user.id;
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockCount(tx, id);
      if (locked.status !== 'IN_REVIEW' && locked.status !== 'APPROVED') {
        throw new BusinessRuleError('Los hallazgos se regularizan desde la revisión del conteo.', {
          status: locked.status,
        });
      }
      const finding = await tx.inventoryCountFinding.findFirst({
        where: { id: findingId, inventoryCountId: id },
      });
      if (!finding) throw new NotFoundError('Hallazgo no encontrado');
      if (finding.regularizedAt) throw new BusinessRuleError('El hallazgo ya fue regularizado.');
      await tx.inventoryCountFinding.update({
        where: { id: findingId },
        data: { regularizedAt: new Date(), regularizedById: userId, regularizationNote: note },
      });
      await recordAudit(
        tx,
        {
          action: 'inventory_count.finding_regularized',
          entityType: 'InventoryCount',
          entityId: id,
          after: { findingId, code: finding.code, quantity: finding.quantity, note },
        },
        request,
      );
      return loadFinding(tx, findingId);
    }, TX_OPTIONS);
  }
}
