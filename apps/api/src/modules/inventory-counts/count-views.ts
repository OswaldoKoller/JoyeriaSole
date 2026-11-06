import {
  type BlindCountItem,
  type CountFinding,
  type InventoryCountBlindDetail,
  type InventoryCountReviewDetail,
  type InventoryCountSummary,
  type LastCountScan,
  type ReviewCountItem,
  formatMoney,
  parseMoney,
} from '@joyeria/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.ts';
import { NotFoundError } from '../../lib/errors.ts';
import { valueOfDelta } from '../inventory/adjustments.service.ts';
import { MAX_BALANCE } from '../inventory/stock-ledger.ts';
import { finalCountOf, reconcileCount } from './count-logic.ts';

/**
 * Armado de las respuestas del conteo. La regla central (ADR-021): mientras el conteo está en
 * captura o recuento (y en borrador/cancelado) se construye la vista `BLIND`, que NO contiene
 * ningún campo de stock del sistema ni de diferencias. La vista `REVIEW` solo existe desde la
 * revisión.
 */
export type Db = PrismaClient | Prisma.TransactionClient;

export const countInclude = {
  category: true,
  operator: true,
  createdBy: true,
  approvedBy: true,
} satisfies Prisma.InventoryCountInclude;
export type CountRow = Prisma.InventoryCountGetPayload<{ include: typeof countInclude }>;

/** Estados con captura a ciegas (más borrador y cancelado, que nunca muestran stock). */
export const CAPTURE_STATUSES = ['IN_PROGRESS', 'RECOUNT'] as const;
export const OPEN_STATUSES = ['DRAFT', 'IN_PROGRESS', 'RECOUNT', 'IN_REVIEW'] as const;

export interface CountStats {
  total: number;
  scanned: number;
  pieces: number;
  recountTotal: number;
  recountDone: number;
  recountPieces: number;
  findings: number;
}

export const EMPTY_STATS: CountStats = {
  total: 0,
  scanned: 0,
  pieces: 0,
  recountTotal: 0,
  recountDone: 0,
  recountPieces: 0,
  findings: 0,
};

/** Avance de varios conteos en pocas consultas (nunca devuelve stock del sistema). */
export async function loadStats(db: Db, ids: readonly string[]): Promise<Map<string, CountStats>> {
  const stats = new Map<string, CountStats>();
  if (ids.length === 0) return stats;
  const items = await db.$queryRaw<
    {
      id: string;
      total: number;
      scanned: number;
      pieces: bigint;
      recount_total: number;
      recount_done: number;
      recount_pieces: bigint;
    }[]
  >`
    SELECT inventory_count_id::text AS id,
           count(*)::int AS total,
           count(counted_qty)::int AS scanned,
           COALESCE(sum(counted_qty), 0)::bigint AS pieces,
           (count(*) FILTER (WHERE needs_recount))::int AS recount_total,
           count(recount_qty)::int AS recount_done,
           COALESCE(sum(recount_qty), 0)::bigint AS recount_pieces
    FROM inventory_count_items
    WHERE inventory_count_id = ANY(${ids as string[]}::uuid[])
    GROUP BY inventory_count_id`;
  const findings = await db.$queryRaw<{ id: string; findings: number }[]>`
    SELECT inventory_count_id::text AS id, (count(*) FILTER (WHERE quantity > 0))::int AS findings
    FROM inventory_count_findings
    WHERE inventory_count_id = ANY(${ids as string[]}::uuid[])
    GROUP BY inventory_count_id`;
  for (const row of items) {
    stats.set(row.id, {
      total: row.total,
      scanned: row.scanned,
      pieces: Number(row.pieces),
      recountTotal: row.recount_total,
      recountDone: row.recount_done,
      recountPieces: Number(row.recount_pieces),
      findings: 0,
    });
  }
  for (const row of findings) {
    const current = stats.get(row.id) ?? { ...EMPTY_STATS };
    stats.set(row.id, { ...current, findings: row.findings });
  }
  return stats;
}

export function toSummary(row: CountRow, stats: CountStats = EMPTY_STATS): InventoryCountSummary {
  const recounting = row.status === 'RECOUNT';
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    categoryId: row.categoryId,
    scope: row.scope,
    notes: row.notes,
    createdByName: row.createdBy.name,
    operatorId: row.operatorId,
    operatorName: row.operator?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    firstClosedAt: row.firstClosedAt?.toISOString() ?? null,
    reviewAt: row.reviewAt?.toISOString() ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    totalVariants: stats.total,
    scannedVariants: recounting ? stats.recountDone : stats.scanned,
    piecesCounted: recounting ? stats.recountPieces : stats.pieces,
    recountTotal: stats.recountTotal,
    findingsCount: stats.findings,
  };
}

const findingInclude = {
  variant: { include: { product: true } },
  regularizedBy: true,
} satisfies Prisma.InventoryCountFindingInclude;
type FindingRow = Prisma.InventoryCountFindingGetPayload<{ include: typeof findingInclude }>;

export function toFinding(row: FindingRow): CountFinding {
  return {
    id: row.id,
    round: row.round,
    code: row.code,
    type: row.type,
    variantId: row.variantId ?? null,
    sku: row.variant?.sku ?? null,
    productName: row.variant?.product.name ?? null,
    quantity: row.quantity,
    note: row.note,
    regularized: row.regularizedAt !== null,
    regularizedAt: row.regularizedAt?.toISOString() ?? null,
    regularizedByName: row.regularizedBy?.name ?? null,
    regularizationNote: row.regularizationNote,
  };
}

export async function loadFindings(db: Db, countId: string): Promise<CountFinding[]> {
  const rows = await db.inventoryCountFinding.findMany({
    where: { inventoryCountId: countId, quantity: { gt: 0 } },
    include: findingInclude,
    orderBy: [{ round: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toFinding);
}

export async function loadFinding(db: Db, findingId: string): Promise<CountFinding> {
  const row = await db.inventoryCountFinding.findUnique({
    where: { id: findingId },
    include: findingInclude,
  });
  if (!row) throw new NotFoundError('Hallazgo no encontrado');
  return toFinding(row);
}

const scanInclude = {
  variant: { include: { product: true } },
  finding: true,
} satisfies Prisma.InventoryCountScanInclude;
type ScanRow = Prisma.InventoryCountScanGetPayload<{ include: typeof scanInclude }>;

export function toLastScan(row: ScanRow): LastCountScan {
  return {
    kind: row.variantId ? 'ITEM' : 'FINDING',
    code: row.code,
    variantId: row.variantId ?? null,
    sku: row.variant?.sku ?? null,
    productName: row.variant?.product.name ?? null,
    variantLabel: row.variant?.label ?? null,
    findingType: row.finding?.type ?? null,
    delta: row.delta,
    quantityAfter: row.quantityAfter,
    at: row.createdAt.toISOString(),
  };
}

export async function loadLastScan(db: Db, countId: string): Promise<LastCountScan | null> {
  const row = await db.inventoryCountScan.findFirst({
    where: { inventoryCountId: countId, undoneAt: null },
    include: scanInclude,
    orderBy: { id: 'desc' },
  });
  return row ? toLastScan(row) : null;
}

export { scanInclude };

const itemInclude = {
  variant: { include: { product: true } },
} satisfies Prisma.InventoryCountItemInclude;
type ItemRow = Prisma.InventoryCountItemGetPayload<{ include: typeof itemInclude }>;

export function toBlindItem(item: ItemRow, round: 1 | 2): BlindCountItem {
  return {
    variantId: item.variantId,
    sku: item.variant.sku,
    barcode: item.variant.barcode,
    productName: item.variant.product.name,
    variantLabel: item.variant.label,
    quantity: round === 2 ? (item.recountQty ?? 0) : (item.countedQty ?? 0),
    lastScanAt: (round === 2 ? item.recountedAt : item.countedAt)?.toISOString() ?? null,
  };
}

/** Detalle a ciegas: identificación de las piezas y lo contado. Jamás stock del sistema. */
export async function buildBlindDetail(
  db: Db,
  row: CountRow,
  stats: CountStats = EMPTY_STATS,
): Promise<InventoryCountBlindDetail> {
  const recounting = row.status === 'RECOUNT';
  const items = await db.inventoryCountItem.findMany({
    where: {
      inventoryCountId: row.id,
      ...(recounting ? { needsRecount: true } : { countedQty: { not: null } }),
    },
    include: itemInclude,
  });
  const round = recounting ? 2 : 1;
  const mapped = items.map((item) => toBlindItem(item, round));
  mapped.sort((a, b) =>
    recounting
      ? a.sku.localeCompare(b.sku)
      : (b.lastScanAt ?? '').localeCompare(a.lastScanAt ?? '') || a.sku.localeCompare(b.sku),
  );
  return {
    ...toSummary(row, stats),
    view: 'BLIND',
    items: mapped,
    findings: await loadFindings(db, row.id),
    lastScan: await loadLastScan(db, row.id),
  };
}

export interface ReconciliationRow {
  itemId: string;
  currentQty: number;
  since: number;
}

/**
 * Saldo vigente y movimientos posteriores al momento de cada conteo (el del recuento si existe,
 * si no el del primer conteo). Es la base de la conciliación de ADR-014.
 */
export async function loadReconciliation(db: Db, countId: string): Promise<ReconciliationRow[]> {
  const rows = await db.$queryRaw<{ item_id: string; current_qty: number; since: bigint }[]>`
    SELECT i.id::text AS item_id,
           COALESCE(b.quantity, 0)::int AS current_qty,
           COALESCE((
             SELECT sum(m.quantity) FROM inventory_movements m
             WHERE m.variant_id = i.variant_id
               AND m.id > COALESCE(i.recount_cursor, i.counted_cursor, i.snapshot_cursor)
           ), 0)::bigint AS since
    FROM inventory_count_items i
    LEFT JOIN inventory_balances b ON b.variant_id = i.variant_id
    WHERE i.inventory_count_id = ${countId}::uuid`;
  return rows.map((r) => ({
    itemId: r.item_id,
    currentQty: r.current_qty,
    since: Number(r.since),
  }));
}

export interface ReviewComputation {
  item: ReviewCountItem;
  targetQty: number;
}

function reviewItemOf(
  item: ItemRow,
  live: ReconciliationRow | undefined,
  approved: boolean,
  canSeeCosts: boolean,
): ReviewComputation {
  const final = finalCountOf(
    { qty: item.countedQty, cursor: item.countedCursor },
    { qty: item.recountQty, cursor: item.recountCursor },
  );
  let expectedQty: number;
  let difference: number;
  let currentQty: number;
  let resultingQty: number;
  let since: number;
  let finalQty = final.qty;
  if (approved && item.expectedQty !== null && item.difference !== null) {
    expectedQty = item.expectedQty;
    difference = item.difference;
    currentQty = item.balanceBefore ?? 0;
    resultingQty = item.balanceAfter ?? 0;
    since = item.reconciledMovements ?? 0;
    finalQty = item.finalQty ?? final.qty;
  } else {
    since = live?.since ?? 0;
    currentQty = live?.currentQty ?? 0;
    const rec = reconcileCount({ countedQty: final.qty, currentQty, movementsSince: since });
    expectedQty = rec.expectedQty;
    difference = rec.difference;
    resultingQty = rec.targetQty;
  }
  const unitCost = approved
    ? (item.unitCost?.toFixed(4) ?? null)
    : item.variant.costPrice.toFixed(4);
  return {
    targetQty: resultingQty,
    item: {
      variantId: item.variantId,
      sku: item.variant.sku,
      barcode: item.variant.barcode,
      productName: item.variant.product.name,
      variantLabel: item.variant.label,
      systemQty: item.systemQty,
      expectedQty,
      countedQty: item.countedQty ?? 0,
      recountQty: item.recountQty,
      finalQty,
      reconciledMovements: since,
      difference,
      currentQty,
      resultingQty,
      unitCost: canSeeCosts ? unitCost : null,
      valueImpact: canSeeCosts && unitCost !== null ? valueOfDelta(difference, unitCost) : null,
      movementId: item.movementId?.toString() ?? null,
    },
  };
}

/** Revisión del aprobador: aquí (y solo aquí) aparecen el sistema, lo esperado y las diferencias. */
export async function buildReviewDetail(
  db: Db,
  row: CountRow,
  stats: CountStats = EMPTY_STATS,
  canSeeCosts = false,
): Promise<InventoryCountReviewDetail> {
  const approved = row.status === 'APPROVED';
  const items = await db.inventoryCountItem.findMany({
    where: { inventoryCountId: row.id },
    include: itemInclude,
  });
  const live = approved ? [] : await loadReconciliation(db, row.id);
  const liveById = new Map(live.map((entry) => [entry.itemId, entry]));
  const computed = items.map((item) =>
    reviewItemOf(item, liveById.get(item.id), approved, canSeeCosts),
  );
  computed.sort(
    (a, b) =>
      Number(b.item.difference !== 0) - Number(a.item.difference !== 0) ||
      a.item.sku.localeCompare(b.item.sku),
  );

  const blockers: string[] = [];
  if (row.status === 'IN_REVIEW') {
    for (const { item, targetQty } of computed) {
      if (targetQty < 0) {
        blockers.push(
          `El saldo de ${item.sku} quedaría en ${targetQty}: contado ${item.finalQty} y salidas posteriores superiores. Revise o cancele el conteo.`,
        );
      } else if (targetQty > MAX_BALANCE) {
        blockers.push(`El saldo de ${item.sku} superaría el máximo permitido.`);
      }
    }
  }

  let valueCents: string | null = null;
  if (canSeeCosts) {
    let total = 0n;
    for (const { item } of computed) {
      if (item.valueImpact === null) continue;
      const negative = item.valueImpact.startsWith('-');
      const cents = parseMoney(negative ? item.valueImpact.slice(1) : item.valueImpact);
      total += negative ? -cents : cents;
    }
    valueCents = formatMoney(total);
  }
  return {
    ...toSummary(row, stats),
    view: 'REVIEW',
    items: computed.map((entry) => entry.item),
    findings: await loadFindings(db, row.id),
    resolutionNotes: row.resolutionNotes,
    approvedByName: row.approvedBy?.name ?? null,
    differencesCount: computed.filter((entry) => entry.item.difference !== 0).length,
    netUnits: computed.reduce((sum, entry) => sum + entry.item.difference, 0),
    valueImpact: valueCents,
    blockers,
  };
}
