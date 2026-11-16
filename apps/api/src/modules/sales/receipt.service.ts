import {
  receiptPrintEventSchema,
  SALE_CURRENCY,
  type ReceiptPrintEvent,
  type ReceiptPrintInput,
  type SaleReceipt,
} from '@joyeria/shared';
import type { FastifyRequest } from 'fastify';
import { NotFoundError } from '../../lib/errors.ts';
import { idempotentTransaction } from '../../lib/idempotency.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { getAuth } from '../../plugins/auth.ts';
import { idempotencyOf } from '../../plugins/idempotency.ts';
import { recordAudit } from '../audit/audit.service.ts';
import { businessInfoOf, readBusinessSettings } from '../settings/business-settings.service.ts';
import type { SalesService } from './sales.service.ts';

const optionalMoney = (value: { toFixed: (digits: number) => string } | null) =>
  value === null ? null : value.toFixed(2);

/**
 * Comprobante interno (DEC-V12; ADR-024): proyección de las filas INMUTABLES de la venta. Ver el
 * comprobante no escribe nada; imprimir registra la solicitud (append-only) y la audita. Sin costos
 * y sin referencia de pago. Quien no puede ver la venta recibe 404.
 */
export class ReceiptService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly sales: SalesService,
  ) {}

  /** V5 · Datos para la vista previa e impresión. */
  async receipt(id: string, request: FastifyRequest): Promise<SaleReceipt> {
    await this.sales.assertVisible(this.prisma, id, request);
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        items: { orderBy: { id: 'asc' } },
        payments: { include: { method: { select: { sortOrder: true } } } },
        _count: { select: { prints: true } },
      },
    });
    if (!sale) throw new NotFoundError('Venta no encontrada');
    // D-08: encabezado con los datos comerciales VIGENTES; D-04: vendedor solo si se configuró.
    const business = await readBusinessSettings(this.prisma);
    return {
      saleId: sale.id,
      number: sale.number,
      soldAt: sale.soldAt.toISOString(),
      currency: SALE_CURRENCY,
      items: sale.items.map((item) => ({
        sku: item.sku,
        productName: item.productName,
        variantLabel: item.variantLabel,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        lineTotal: item.lineTotal.toFixed(2),
      })),
      total: sale.total.toFixed(2),
      payments: [...sale.payments]
        .sort((a, b) => a.method.sortOrder - b.method.sortOrder)
        .map((payment) => ({
          methodName: payment.methodName,
          amount: payment.amount.toFixed(2),
          tendered: optionalMoney(payment.tenderedAmount),
          changeGiven: optionalMoney(payment.changeGiven),
        })),
      seller: business.receiptShowSeller ? { name: sale.sellerName } : null,
      business: businessInfoOf(business),
      printCount: sale._count.prints,
    };
  }

  /**
   * V6 · Registra una solicitud de impresión. Bloquea SOLO la fila de la venta (FOR UPDATE no la
   * modifica, el trigger de inmutabilidad no se dispara) para numerar las copias sin huecos ni
   * repetidos; la primera es el original y desde la segunda se marca «COPIA» (D-19).
   * Acepta `Idempotency-Key` OPCIONAL (B-5): con la misma clave, un doble clic o un reintento de red
   * devuelve el mismo evento en vez de registrar una «COPIA» falsa. La web debe enviarla siempre.
   */
  async print(
    id: string,
    input: ReceiptPrintInput,
    request: FastifyRequest,
  ): Promise<ReceiptPrintEvent> {
    const { user } = getAuth(request);
    const idempotency = {
      context: idempotencyOf(request),
      responseSchema: receiptPrintEventSchema,
    };
    return idempotentTransaction(this.prisma, idempotency, async (tx) => {
      await this.sales.assertVisible(tx, id, request);
      await tx.$queryRaw`SELECT id FROM sales WHERE id = ${id}::uuid FOR UPDATE`;
      const last = await tx.saleReceiptPrint.aggregate({
        where: { saleId: id },
        _max: { copyNumber: true },
      });
      const copyNumber = (last._max.copyNumber ?? 0) + 1;
      const print = await tx.saleReceiptPrint.create({
        data: { saleId: id, copyNumber, format: input.format, printedById: user.id },
      });
      await recordAudit(
        tx,
        {
          action: 'sale.receipt_printed',
          entityType: 'Sale',
          entityId: id,
          after: { format: input.format, copyNumber },
        },
        request,
      );
      return {
        copyNumber,
        isCopy: copyNumber > 1,
        printedAt: print.printedAt.toISOString(),
      };
    });
  }
}
