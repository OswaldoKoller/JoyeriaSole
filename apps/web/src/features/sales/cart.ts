import {
  MONEY_PATTERN,
  SALE_MAX_ITEMS,
  SALE_MAX_QUANTITY,
  lineTotalCents,
  parseMoney,
  saleTotalCents,
  type CreateSaleInput,
  type Product,
  type VariantLookup,
} from '@joyeria/shared';
import { z } from 'zod';

/**
 * Carrito del punto de venta: lógica PURA (sin React ni red). Vive en el navegador hasta que la
 * venta se confirma; nada de esto toca stock ni caja. El total se calcula en centavos enteros
 * con las mismas funciones que la API (`@joyeria/shared`).
 */

/** Una pieza lista para el carrito (de la búsqueda por código o por nombre). */
export interface Piece {
  variantId: string;
  sku: string;
  productName: string;
  variantLabel: string | null;
  /** Precio de venta vigente («120.50»); «0.00» = sin precio. */
  unitPrice: string;
  /** Variante y producto activos. */
  active: boolean;
  /** Stock disponible si el usuario puede verlo; `null` si no se conoce (la API valida igual). */
  available: number | null;
}

export interface CartLine extends Omit<Piece, 'active'> {
  quantity: number;
}

export type AddFailure = 'INACTIVE' | 'NO_PRICE' | 'NO_STOCK' | 'MAX_QUANTITY' | 'MAX_ITEMS';

export type AddResult = { ok: true; cart: CartLine[] } | { ok: false; reason: AddFailure };

/** Etiqueta visible de la variante («Talla 7»); «Única» no aporta y no se muestra. */
export function variantText(label: string | null): string | null {
  return label && label !== 'Única' ? label : null;
}

/** Nombre de la pieza con su variante, para textos y etiquetas accesibles. */
export function pieceName(line: Pick<CartLine, 'productName' | 'variantLabel'>): string {
  const label = variantText(line.variantLabel);
  return label ? `${line.productName} · ${label}` : line.productName;
}

export function pieceFromLookup(found: VariantLookup): Piece {
  return {
    variantId: found.variantId,
    sku: found.sku,
    productName: found.productName,
    variantLabel: found.label,
    unitPrice: found.salePrice,
    active: found.status === 'ACTIVE' && found.productStatus === 'ACTIVE',
    available: found.stockQuantity ?? null,
  };
}

/** Piezas de un resultado de búsqueda por nombre o SKU (una por variante). */
export function piecesFromProducts(products: Product[]): Piece[] {
  return products.flatMap((product) =>
    product.variants.map((variant) => ({
      variantId: variant.id,
      sku: variant.sku,
      productName: product.name,
      variantLabel: variant.label,
      unitPrice: variant.salePrice,
      active: variant.status === 'ACTIVE' && product.status === 'ACTIVE',
      available: variant.stockQuantity ?? null,
    })),
  );
}

function hasPrice(price: string): boolean {
  return MONEY_PATTERN.test(price) && parseMoney(price) > 0n;
}

/** Tope de cantidad de una línea: el stock conocido y el límite técnico (D-15). */
export function maxQuantity(line: Pick<CartLine, 'available'>): number {
  return line.available === null ? SALE_MAX_QUANTITY : Math.min(line.available, SALE_MAX_QUANTITY);
}

/**
 * Agrega una pieza o suma 1 a su línea (una línea por variante). No agrega piezas inactivas, sin
 * precio o sin stock (P-08: no se vende sin stock).
 */
export function addPiece(cart: CartLine[], piece: Piece): AddResult {
  if (!piece.active) return { ok: false, reason: 'INACTIVE' };
  if (!hasPrice(piece.unitPrice)) return { ok: false, reason: 'NO_PRICE' };
  const existing = cart.find((line) => line.variantId === piece.variantId);
  const quantity = (existing?.quantity ?? 0) + 1;
  if (piece.available !== null && quantity > piece.available) {
    return { ok: false, reason: 'NO_STOCK' };
  }
  if (quantity > SALE_MAX_QUANTITY) return { ok: false, reason: 'MAX_QUANTITY' };
  if (!existing && cart.length >= SALE_MAX_ITEMS) return { ok: false, reason: 'MAX_ITEMS' };
  const line: CartLine = {
    variantId: piece.variantId,
    sku: piece.sku,
    productName: piece.productName,
    variantLabel: piece.variantLabel,
    unitPrice: piece.unitPrice,
    available: piece.available,
    quantity,
  };
  return {
    ok: true,
    cart: existing
      ? cart.map((item) => (item.variantId === piece.variantId ? line : item))
      : [...cart, line],
  };
}

/** Cambia la cantidad de una línea, siempre entre 1 y el tope de la línea. */
export function setQuantity(cart: CartLine[], variantId: string, quantity: number): CartLine[] {
  return cart.map((line) =>
    line.variantId === variantId
      ? {
          ...line,
          quantity: Math.max(
            1,
            Math.min(Number.isFinite(quantity) ? Math.floor(quantity) : 1, maxQuantity(line)),
          ),
        }
      : line,
  );
}

export function removeLine(cart: CartLine[], variantId: string): CartLine[] {
  return cart.filter((line) => line.variantId !== variantId);
}

/** Líneas cuya cantidad supera el stock conocido (p. ej. tras `422 INSUFFICIENT_STOCK`). */
export function linesOverStock(cart: CartLine[]): CartLine[] {
  return cart.filter((line) => line.available !== null && line.quantity > line.available);
}

export function lineTotal(line: CartLine): bigint {
  return lineTotalCents(line.quantity, line.unitPrice);
}

export function cartTotal(cart: CartLine[]): bigint {
  return saleTotalCents(cart);
}

export function cartUnits(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + line.quantity, 0);
}

/** Líneas del cuerpo de `POST /sales`: el precio que vio el vendedor viaja como esperado. */
export function saleItemsInput(cart: CartLine[]): CreateSaleInput['items'] {
  return cart.map((line) => ({
    variantId: line.variantId,
    quantity: line.quantity,
    expectedUnitPrice: line.unitPrice,
  }));
}

/** Aplica los precios vigentes que informó la API (`409 PRICE_CHANGED`). */
export function applyCurrentPrices(
  cart: CartLine[],
  prices: readonly { variantId: string; currentUnitPrice: string | null }[],
): CartLine[] {
  return cart.map((line) => {
    const change = prices.find((item) => item.variantId === line.variantId);
    return change?.currentUnitPrice ? { ...line, unitPrice: change.currentUnitPrice } : line;
  });
}

/** Aplica el stock disponible que informó la API (`422 INSUFFICIENT_STOCK`). */
export function applyAvailable(
  cart: CartLine[],
  stock: readonly { variantId: string; available: number }[],
): CartLine[] {
  return cart.map((line) => {
    const found = stock.find((item) => item.variantId === line.variantId);
    return found ? { ...line, available: found.available } : line;
  });
}

// ---------------------------------------------------------------------------------------------
// Borrador del cobro en `sessionStorage` (por pestaña): carrito, pagos escritos y el intento de
// confirmación con su `Idempotency-Key`. Sobrevive a una recarga o a un corte de red; se borra al
// registrar la venta. No contiene datos sensibles (solo piezas e importes).
// ---------------------------------------------------------------------------------------------

export const POS_DRAFT_STORAGE_KEY = 'joyeria.pos.cart';

const cartLineSchema = z.object({
  variantId: z.string(),
  sku: z.string(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
  unitPrice: z.string().regex(MONEY_PATTERN),
  available: z.number().int().nullable(),
  quantity: z.number().int().min(1).max(SALE_MAX_QUANTITY),
});

const paymentDraftSchema = z.object({
  cash: z.string(),
  qr: z.string(),
  transfer: z.string(),
  qrReference: z.string(),
  transferReference: z.string(),
});

const attemptSchema = z.object({
  /** `Idempotency-Key` del intento: la misma en todos sus reintentos. */
  key: z.string(),
  /** Cuerpo exacto enviado: un reintento repite exactamente la misma operación. */
  body: z.string(),
  /** El último envío terminó sin respuesta clara (corte de red o 5xx): no cobrar de nuevo. */
  uncertain: z.boolean(),
});

const posDraftSchema = z.object({
  lines: z.array(cartLineSchema).max(SALE_MAX_ITEMS),
  payments: paymentDraftSchema,
  attempt: attemptSchema.nullable(),
});

export type PaymentDraft = z.infer<typeof paymentDraftSchema>;
export type SaleAttempt = z.infer<typeof attemptSchema>;
export type PosDraft = z.infer<typeof posDraftSchema>;

export const EMPTY_PAYMENTS: PaymentDraft = {
  cash: '',
  qr: '',
  transfer: '',
  qrReference: '',
  transferReference: '',
};

export const EMPTY_DRAFT: PosDraft = { lines: [], payments: EMPTY_PAYMENTS, attempt: null };

/** Lee el borrador; cualquier fallo (almacenamiento bloqueado, dato corrupto) da uno vacío. */
export function loadPosDraft(): PosDraft {
  try {
    const raw = window.sessionStorage.getItem(POS_DRAFT_STORAGE_KEY);
    if (raw) {
      const parsed = posDraftSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    }
  } catch {
    // Modo privado o datos de sitio bloqueados: el borrador solo vive en memoria.
  }
  return { ...EMPTY_DRAFT, payments: { ...EMPTY_PAYMENTS } };
}

export function savePosDraft(draft: PosDraft): void {
  try {
    if (draft.lines.length === 0 && draft.attempt === null) {
      window.sessionStorage.removeItem(POS_DRAFT_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(POS_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    }
  } catch {
    // Sin almacenamiento: el borrador se pierde al recargar, la venta sigue siendo idempotente.
  }
}
