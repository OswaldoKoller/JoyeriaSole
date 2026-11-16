import { parseMoney, type ExchangeHolding } from '@joyeria/shared';
import type { Piece } from '../sales/cart.ts';

/**
 * Vista previa PURA del cambio de pieza (ADR-026), en centavos enteros y con las mismas reglas que
 * la API (que vuelve a validar todo): la pieza nueva debe ser otra, estar activa, tener precio y
 * stock, y NUNCA costar menos que lo que el cliente pagó por la que devuelve (regla del
 * responsable, 2026-11-14). La diferencia (cantidad × (nueva − pagada)) es lo que se cobra.
 */

export type ExchangeIssue = 'SAME_PIECE' | 'INACTIVE' | 'NO_PRICE' | 'NO_STOCK' | 'CHEAPER';

export interface ExchangePreview {
  /** Primer problema que impide el cambio, o `null` si se puede registrar. */
  issue: ExchangeIssue | null;
  /** Lo que se cobra por la diferencia de precio (0 si ambas piezas valen lo mismo). */
  differenceCents: bigint;
}

export function previewExchange(
  holding: ExchangeHolding,
  quantity: number,
  piece: Piece,
): ExchangePreview {
  const credit = parseMoney(holding.creditUnitPrice);
  const price = /^\d+(\.\d{1,2})?$/.test(piece.unitPrice) ? parseMoney(piece.unitPrice) : 0n;
  const none = { differenceCents: 0n };
  if (piece.variantId === holding.variantId) return { issue: 'SAME_PIECE', ...none };
  if (!piece.active) return { issue: 'INACTIVE', ...none };
  if (price <= 0n) return { issue: 'NO_PRICE', ...none };
  if (piece.available !== null && piece.available < quantity) {
    return { issue: 'NO_STOCK', ...none };
  }
  if (price < credit) return { issue: 'CHEAPER', ...none };
  return { issue: null, differenceCents: BigInt(quantity) * (price - credit) };
}

/** Texto para el vendedor según el problema; sencillo y sin tecnicismos. */
export function exchangeIssueMessage(
  issue: ExchangeIssue,
  prices: { credit: string; piece: string },
  piece: Pick<Piece, 'available'>,
): string {
  switch (issue) {
    case 'SAME_PIECE':
      return 'Esta es la misma pieza que el cliente devuelve. Elija otra pieza.';
    case 'INACTIVE':
      return 'Esta pieza está inactiva: no se puede entregar.';
    case 'NO_PRICE':
      return 'Esta pieza no tiene precio de venta: no se puede entregar.';
    case 'NO_STOCK':
      return piece.available === 0
        ? 'Esta pieza no tiene stock.'
        : `No hay stock suficiente de esta pieza: quedan ${String(piece.available ?? 0)}.`;
    case 'CHEAPER':
      return `Esta pieza cuesta menos (${prices.piece}) que la que el cliente pagó (${prices.credit}). Solo se puede cambiar por una pieza de igual o mayor precio.`;
  }
}

/** Clave de una pieza que se puede cambiar: su línea de venta o el cambio que la entregó. */
export function holdingKey(holding: Pick<ExchangeHolding, 'sourceItemId' | 'sourceExchangeId'>) {
  return holding.sourceItemId ?? holding.sourceExchangeId ?? '';
}
