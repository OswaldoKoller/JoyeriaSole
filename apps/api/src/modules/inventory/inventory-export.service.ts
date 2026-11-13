import {
  CSV_EXPORT_MAX_ROWS,
  movementTypeLabel,
  todayInLaPaz,
  type MovementFilters,
} from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { Prisma } from '../../generated/prisma/client.ts';
import { CSV_BOM, csvNumber, csvRow, formatLaPazTimestamp, type CsvCell } from '../../lib/csv.ts';
import { BusinessRuleError } from '../../lib/errors.ts';
import { canSeeCosts, canSeeMovementNotes, movementAuthorFor } from '../../lib/permissions.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { recordAudit } from '../audit/audit.service.ts';
import {
  levelFilter,
  movementWhere,
  searchFilter,
  STOCK_QUANTITY,
  stockLevel,
} from './inventory-filters.ts';

/** Filas que se leen de la base por lote: la exportación nunca carga todo en memoria. */
const BATCH_SIZE = 1000;

export interface CsvExport {
  filename: string;
  /** Filas de datos (sin la cabecera), las mismas que quedaron registradas en la auditoría. */
  rows: number;
  stream: Readable;
}

const LEVEL_LABELS = { OUT: 'Sin stock', LOW: 'Bajo mínimo', OK: 'Disponible' } as const;

interface BalanceRow {
  sku: string;
  barcode: string | null;
  label: string | null;
  min_stock: number;
  product_name: string;
  category_id: string;
  status: string;
  quantity: number;
  /** Solo se consulta con `costs:read`. */
  cost_price?: string;
  stock_value?: string;
}

/**
 * Reportes mínimos CSV de inventario y de movimientos (P-44, D1).
 *
 * Orden de las operaciones, pensado para que NO exista una descarga sin su registro:
 * 1) en UNA transacción se cuentan las filas, se aplica el tope y se escribe la auditoría
 *    (`audit_logs`: quién, filtros, nº de filas);
 * 2) recién entonces se transmite el archivo, leyendo la base por lotes (paginación interna por
 *    cursor) y sin acumular el resultado en memoria.
 * Los costos se deciden SOLO por el permiso de la sesión (`costs:read`): no hay parámetro que los
 * active, y sin ese permiso ni siquiera se consultan en la base.
 */
export class InventoryExportService {
  /** `maxRows` solo cambia en las pruebas; en producción rige `CSV_EXPORT_MAX_ROWS`. */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly maxRows: number = CSV_EXPORT_MAX_ROWS,
  ) {}

  private assertWithinLimit(rows: number) {
    if (rows > this.maxRows) {
      throw new BusinessRuleError(
        `La exportación supera el máximo de ${this.maxRows} filas (${rows} encontradas). Acote los filtros, por ejemplo con un rango de fechas menor, e intente de nuevo.`,
      );
    }
  }

  /**
   * Saldos por variante. Incluye las variantes activas y también las inactivas con saldo distinto de
   * cero, para que el valor del inventario no deje piezas físicas fuera. Valor = costo vigente ×
   * saldo a la fecha de exportación (recomendación de D1, rotulado «a costo vigente»).
   */
  async balances(input: { q: string; level: string }, request: FastifyRequest): Promise<CsvExport> {
    const withCosts = canSeeCosts(request);
    const quantity = STOCK_QUANTITY;
    const from = Prisma.sql`
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      LEFT JOIN inventory_balances b ON b.variant_id = v.id
      WHERE ((v.status = 'ACTIVE' AND p.status = 'ACTIVE') OR ${quantity} <> 0)
        ${searchFilter(input.q)} ${levelFilter(input.level)}`;

    const total = await this.prisma.$transaction(async (tx) => {
      const counted = await tx.$queryRaw<{ total: number }[]>(
        Prisma.sql`SELECT COUNT(*)::int AS total ${from}`,
      );
      const rows = counted[0]?.total ?? 0;
      this.assertWithinLimit(rows);
      await recordAudit(
        tx,
        {
          action: 'inventory.export_balances',
          entityType: 'Inventory',
          metadata: {
            format: 'csv',
            filters: definedOnly({ q: input.q || undefined, level: input.level }),
            rows,
            includesCosts: withCosts,
          },
        },
        request,
      );
      return rows;
    });

    const categories = await categoryPaths(this.prisma);
    const costColumns = withCosts
      ? Prisma.sql`, v.cost_price::text AS cost_price, ROUND(v.cost_price * ${quantity}, 2)::text AS stock_value`
      : Prisma.empty;
    const header: CsvCell[] = [
      'SKU',
      'Código de barras',
      'Producto',
      'Variante / atributos',
      'Categoría',
      'Saldo',
      'Stock mínimo',
      'Nivel de stock',
      'Estado de la variante',
      ...(withCosts ? ['Costo unitario vigente (Bs)', 'Valor a costo vigente (Bs)'] : []),
    ];
    const prisma = this.prisma;

    async function* chunks() {
      yield CSV_BOM + csvRow(header);
      let cursor: { name: string; sku: string } | null = null;
      let emitted = 0;
      while (emitted < total) {
        const keyset = cursor
          ? Prisma.sql`AND (p.name, v.sku) > (${cursor.name}, ${cursor.sku})`
          : Prisma.empty;
        const take = Math.min(BATCH_SIZE, total - emitted);
        const batch: BalanceRow[] = await prisma.$queryRaw<BalanceRow[]>(Prisma.sql`
          SELECT v.sku, v.barcode, v.label, v.min_stock, p.name AS product_name,
                 p.category_id, v.status, ${quantity}::int AS quantity ${costColumns}
          ${from} ${keyset}
          ORDER BY p.name ASC, v.sku ASC
          LIMIT ${take}`);
        const last = batch.at(-1);
        if (!last) break;
        cursor = { name: last.product_name, sku: last.sku };
        emitted += batch.length;
        yield batch
          .map((row) =>
            csvRow([
              row.sku,
              row.barcode,
              row.product_name,
              row.label,
              categories.get(row.category_id) ?? '',
              csvNumber(row.quantity),
              csvNumber(row.min_stock),
              LEVEL_LABELS[stockLevel(row.quantity, row.min_stock)],
              row.status === 'ACTIVE' ? 'Activa' : 'Inactiva',
              ...(withCosts
                ? [csvNumber(row.cost_price ?? '0'), csvNumber(row.stock_value ?? '0')]
                : []),
            ]),
          )
          .join('');
      }
    }

    return {
      filename: `inventario-${todayInLaPaz()}.csv`,
      rows: total,
      stream: Readable.from(chunks(), { objectMode: false }),
    };
  }

  /**
   * Historial de movimientos, del más reciente al más antiguo, con los filtros del listado. Se
   * fija el último `id` visible al empezar: el libro es de solo anexar, así que las filas auditadas
   * son exactamente las transmitidas aunque entren movimientos nuevos durante la descarga. La regla
   * D-02/M-1 del listado se aplica igual: en las ventas de otro vendedor el usuario va vacío salvo
   * que se tenga `sales:read-all`. Las observaciones solo con permiso (S-03).
   */
  async movements(filters: MovementFilters, request: FastifyRequest): Promise<CsvExport> {
    const withNotes = canSeeMovementNotes(request);
    const authorOf = movementAuthorFor(request);
    const where = movementWhere(filters);

    const { total, maxId } = await this.prisma.$transaction(async (tx) => {
      const newest = await tx.inventoryMovement.findFirst({
        where,
        orderBy: { id: 'desc' },
        select: { id: true },
      });
      const rows = newest
        ? await tx.inventoryMovement.count({ where: { AND: [where, { id: { lte: newest.id } }] } })
        : 0;
      this.assertWithinLimit(rows);
      await recordAudit(
        tx,
        {
          action: 'inventory.export_movements',
          entityType: 'InventoryMovement',
          metadata: { format: 'csv', filters: definedOnly({ ...filters }), rows },
        },
        request,
      );
      return { total: rows, maxId: newest?.id ?? null };
    });

    const header: CsvCell[] = [
      'ID del movimiento',
      'Fecha y hora (La Paz)',
      'Tipo',
      'Código de tipo',
      'SKU',
      'Producto',
      'Variante / atributos',
      'Cantidad (con signo)',
      'Saldo anterior',
      'Saldo posterior',
      'Motivo',
      ...(withNotes ? ['Observaciones'] : []),
      'Usuario',
    ];
    const prisma = this.prisma;

    async function* chunks() {
      yield CSV_BOM + csvRow(header);
      let before = null as bigint | null;
      let emitted = 0;
      while (maxId !== null && emitted < total) {
        const batch = await prisma.inventoryMovement.findMany({
          where: { AND: [where, { id: before === null ? { lte: maxId } : { lt: before } }] },
          orderBy: { id: 'desc' },
          take: Math.min(BATCH_SIZE, total - emitted),
          include: {
            user: { select: { name: true } },
            variant: { select: { sku: true, label: true, product: { select: { name: true } } } },
          },
        });
        const last = batch.at(-1);
        if (!last) break;
        before = last.id;
        emitted += batch.length;
        yield batch
          .map((row) =>
            csvRow([
              csvNumber(row.id),
              formatLaPazTimestamp(row.createdAt),
              movementTypeLabel(row.type),
              row.type,
              row.variant.sku,
              row.variant.product.name,
              row.variant.label,
              csvNumber(row.quantity),
              csvNumber(row.balanceBefore),
              csvNumber(row.balanceAfter),
              row.reason,
              ...(withNotes ? [row.notes] : []),
              authorOf(row) === null ? '' : row.user.name,
            ]),
          )
          .join('');
      }
    }

    return {
      filename: `movimientos-${todayInLaPaz()}.csv`,
      rows: total,
      stream: Readable.from(chunks(), { objectMode: false }),
    };
  }
}

/** Quita las claves sin valor: la auditoría guarda JSON y `undefined` no es JSON. */
function definedOnly(values: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

/** «Joyas > Anillos» por id de categoría (el árbol es pequeño: una consulta basta). */
async function categoryPaths(prisma: PrismaClient): Promise<Map<string, string>> {
  const all = await prisma.category.findMany({ select: { id: true, name: true, parentId: true } });
  const byId = new Map(all.map((category) => [category.id, category]));
  const paths = new Map<string, string>();
  for (const category of all) {
    const names: string[] = [];
    let current: (typeof all)[number] | undefined = category;
    for (let depth = 0; current && depth < 20; depth += 1) {
      names.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    paths.set(category.id, names.join(' > '));
  }
  return paths;
}
