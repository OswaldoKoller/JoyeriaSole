import {
  ERROR_CODES,
  formatMoney,
  parseMoney,
  type CreateSaleExchangeInput,
  type ExchangeHolding,
} from '@joyeria/shared';
import { BusinessRuleError, ConflictError } from '../../lib/errors.ts';
import type { VariantSnapshot } from '../sales/sale-math.ts';

/**
 * Lógica PURA del cambio de pieza (ADR-026), con los datos vigentes leídos bajo bloqueo. Aritmética
 * entera en centavos. Reglas del responsable (2026-11-14): con el comprobante de la venta, sin
 * plazo; la diferencia de precio se cobra; NUNCA se cambia por una pieza más económica.
 */

/** Línea de una venta, tal como se guardó (inmutable). */
export interface SaleItemRow {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  variantLabel: string | null;
  quantity: number;
  /** Precio unitario pagado, con 2 decimales. */
  unitPrice: string;
}

/** Cambio ya registrado de la venta (inmutable). */
export interface ExchangeRow {
  id: string;
  number: number;
  sourceItemId: string | null;
  sourceExchangeId: string | null;
  quantity: number;
  deliveredVariantId: string;
  deliveredSku: string;
  deliveredProductName: string;
  deliveredVariantLabel: string | null;
  deliveredUnitPrice: string;
}

/**
 * Lo que el cliente conserva de la venta y se puede cambiar: cada línea vendida menos lo ya cambiado,
 * y cada pieza entregada en un cambio anterior menos lo que se volvió a cambiar. Solo con saldo > 0.
 */
export function computeHoldings(
  items: readonly SaleItemRow[],
  exchanges: readonly ExchangeRow[],
): ExchangeHolding[] {
  const usedOfItem = new Map<string, number>();
  const usedOfExchange = new Map<string, number>();
  for (const exchange of exchanges) {
    if (exchange.sourceItemId) {
      usedOfItem.set(
        exchange.sourceItemId,
        (usedOfItem.get(exchange.sourceItemId) ?? 0) + exchange.quantity,
      );
    }
    if (exchange.sourceExchangeId) {
      usedOfExchange.set(
        exchange.sourceExchangeId,
        (usedOfExchange.get(exchange.sourceExchangeId) ?? 0) + exchange.quantity,
      );
    }
  }
  const fromItems = items.map((item): ExchangeHolding => ({
    origin: 'SALE',
    sourceItemId: item.id,
    sourceExchangeId: null,
    exchangeNumber: null,
    variantId: item.variantId,
    sku: item.sku,
    productName: item.productName,
    variantLabel: item.variantLabel,
    remaining: item.quantity - (usedOfItem.get(item.id) ?? 0),
    creditUnitPrice: formatMoney(parseMoney(item.unitPrice)),
  }));
  const fromExchanges = [...exchanges]
    .sort((a, b) => a.number - b.number)
    .map((exchange): ExchangeHolding => ({
      origin: 'EXCHANGE',
      sourceItemId: null,
      sourceExchangeId: exchange.id,
      exchangeNumber: exchange.number,
      variantId: exchange.deliveredVariantId,
      sku: exchange.deliveredSku,
      productName: exchange.deliveredProductName,
      variantLabel: exchange.deliveredVariantLabel,
      remaining: exchange.quantity - (usedOfExchange.get(exchange.id) ?? 0),
      // Lo que el cliente pagó por esa pieza: su precio al momento del cambio.
      creditUnitPrice: formatMoney(parseMoney(exchange.deliveredUnitPrice)),
    }));
  return [...fromItems, ...fromExchanges].filter((holding) => holding.remaining > 0);
}

/** ¿Es esta la pieza (línea de venta o cambio anterior) que pide el cambio? */
export function findHolding(
  holdings: readonly ExchangeHolding[],
  source: Pick<CreateSaleExchangeInput, 'sourceItemId' | 'sourceExchangeId'>,
): ExchangeHolding | undefined {
  return holdings.find((holding) =>
    source.sourceItemId
      ? holding.sourceItemId === source.sourceItemId
      : holding.sourceExchangeId === source.sourceExchangeId,
  );
}

export interface ExchangePlan {
  creditUnitPrice: string;
  deliveredUnitPrice: string;
  /** cantidad × (entregada − crédito), en centavos y como texto. */
  differenceCents: bigint;
  difference: string;
}

/**
 * Valida el cambio con los datos vigentes. Orden: pieza entregada vendible (→ 422
 * `VARIANT_NOT_SELLABLE`), distinta de la devuelta (→ 422 `EXCHANGE_SAME_PIECE`), cantidad dentro
 * de lo que queda (→ 422 `EXCHANGE_QUANTITY_EXCEEDED`), precio esperado vigente (→ 409
 * `PRICE_CHANGED`), NO más económica (→ 422 `EXCHANGE_CHEAPER_NOT_ALLOWED`) y stock suficiente
 * (→ 422 `INSUFFICIENT_STOCK`). Ningún mensaje ni detalle incluye costos.
 */
export function planExchange(
  input: Pick<CreateSaleExchangeInput, 'quantity' | 'expectedDeliveredUnitPrice'>,
  holding: ExchangeHolding,
  delivered: VariantSnapshot | undefined,
): ExchangePlan {
  const notSellable = (sku: string | null, reason: 'NOT_FOUND' | 'INACTIVE' | 'NO_PRICE') =>
    new BusinessRuleError(
      'La pieza que se entrega no se puede vender (inexistente, inactiva o sin precio).',
      { items: [{ variantId: delivered?.id ?? null, sku, reason }] },
      ERROR_CODES.VARIANT_NOT_SELLABLE,
    );
  if (!delivered) throw notSellable(null, 'NOT_FOUND');
  if (!delivered.active) throw notSellable(delivered.sku, 'INACTIVE');
  const deliveredPrice = parseMoney(delivered.salePrice);
  if (deliveredPrice <= 0n) throw notSellable(delivered.sku, 'NO_PRICE');

  if (delivered.id === holding.variantId) {
    throw new BusinessRuleError(
      'La pieza que se entrega debe ser distinta de la que se devuelve.',
      { variantId: delivered.id },
      ERROR_CODES.EXCHANGE_SAME_PIECE,
    );
  }
  if (input.quantity > holding.remaining) {
    throw new BusinessRuleError(
      holding.remaining === 1
        ? 'Solo queda 1 unidad de esta pieza por cambiar.'
        : `Solo quedan ${holding.remaining} unidades de esta pieza por cambiar.`,
      { remaining: holding.remaining, requested: input.quantity },
      ERROR_CODES.EXCHANGE_QUANTITY_EXCEEDED,
    );
  }
  const deliveredUnitPrice = formatMoney(deliveredPrice);
  if (parseMoney(input.expectedDeliveredUnitPrice) !== deliveredPrice) {
    throw new ConflictError(
      'El precio de la pieza que se entrega cambió. Revise el cambio antes de cobrar.',
      {
        expectedUnitPrice: formatMoney(parseMoney(input.expectedDeliveredUnitPrice)),
        currentUnitPrice: deliveredUnitPrice,
      },
      ERROR_CODES.PRICE_CHANGED,
    );
  }
  const creditCents = parseMoney(holding.creditUnitPrice);
  if (deliveredPrice < creditCents) {
    throw new BusinessRuleError(
      'No se puede cambiar por una pieza de menor precio. Elija una pieza de igual o mayor precio.',
      { creditUnitPrice: holding.creditUnitPrice, deliveredUnitPrice },
      ERROR_CODES.EXCHANGE_CHEAPER_NOT_ALLOWED,
    );
  }
  if (delivered.available < input.quantity) {
    throw new BusinessRuleError(
      'No hay stock suficiente de la pieza que se entrega.',
      {
        items: [
          {
            variantId: delivered.id,
            sku: delivered.sku,
            available: Math.max(delivered.available, 0),
            requested: input.quantity,
          },
        ],
      },
      ERROR_CODES.INSUFFICIENT_STOCK,
    );
  }
  const differenceCents = BigInt(input.quantity) * (deliveredPrice - creditCents);
  return {
    creditUnitPrice: holding.creditUnitPrice,
    deliveredUnitPrice,
    differenceCents,
    difference: formatMoney(differenceCents),
  };
}
