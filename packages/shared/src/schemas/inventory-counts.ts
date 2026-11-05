import { z } from 'zod';

/**
 * Conteo físico a ciegas con segundo recuento (ADR-021, enmienda de ADR-009 y ADR-014).
 *
 *   DRAFT → IN_PROGRESS → [RECOUNT] → IN_REVIEW → APPROVED | CANCELLED
 *
 * Mientras el conteo está en captura (IN_PROGRESS) o en segundo recuento (RECOUNT) la API NO
 * devuelve cantidad del sistema, saldo esperado ni diferencias a nadie: solo la identificación de
 * la pieza y lo contado (`view: 'BLIND'`). La cantidad del sistema y las diferencias se muestran
 * únicamente desde la revisión (`view: 'REVIEW'`).
 */
export const INVENTORY_COUNT_STATUSES = [
  'DRAFT',
  'IN_PROGRESS',
  'RECOUNT',
  'IN_REVIEW',
  'APPROVED',
  'CANCELLED',
] as const;
export type InventoryCountStatus = (typeof INVENTORY_COUNT_STATUSES)[number];

export const INVENTORY_COUNT_FINDING_TYPES = ['NOT_FOUND', 'OUT_OF_SCOPE'] as const;
export type InventoryCountFindingType = (typeof INVENTORY_COUNT_FINDING_TYPES)[number];

/** Número legible del conteo (P-11): 7 → «CNT-000007». */
export const countLabel = (number: number) => `CNT-${number.toString().padStart(6, '0')}`;

/** Piezas máximas contadas por variante: evita errores de tipeo y desbordes del saldo. */
export const MAX_COUNT_QUANTITY = 1_000_000;

/** Estados en los que la API oculta el stock del sistema (conteo a ciegas). */
export const BLIND_COUNT_STATUSES: readonly InventoryCountStatus[] = [
  'DRAFT',
  'IN_PROGRESS',
  'RECOUNT',
  'CANCELLED',
];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

export const createInventoryCountSchema = z.object({
  /** Categoría a contar; incluye a todas sus subcategorías. No existe el conteo «total». */
  categoryId: z.uuid('Elija la categoría a contar'),
  notes: optionalText(2000),
});

export const scanInventoryCountSchema = z.object({
  /** SKU, código de barras o código de proveedor (lo que entrega el lector: texto + Enter). */
  code: z.string().trim().min(1, 'Escanee o escriba un código').max(100),
});

export const setCountQuantitySchema = z.object({
  quantity: z
    .number()
    .int('Indique piezas enteras')
    .min(0, 'La cantidad no puede ser negativa')
    .max(MAX_COUNT_QUANTITY),
});

export const findingNoteSchema = z.object({
  note: z.string().trim().max(2000),
});

export const regularizeFindingSchema = z.object({
  note: z.string().trim().min(1, 'Indique cómo se regularizó').max(2000),
});

export const cancelInventoryCountSchema = z.object({
  reason: optionalText(2000),
});

export const inventoryCountListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['all', 'open', ...INVENTORY_COUNT_STATUSES]).default('all'),
});

export const inventoryCountScansQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const inventoryCountSummarySchema = z.object({
  id: z.uuid(),
  number: z.number(),
  status: z.enum(INVENTORY_COUNT_STATUSES),
  categoryId: z.uuid().nullable(),
  /** Ruta de la categoría contada (p. ej. «Joyería › Anillos»). */
  scope: z.string().nullable(),
  notes: z.string().nullable(),
  createdByName: z.string(),
  operatorId: z.uuid().nullable(),
  operatorName: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  firstClosedAt: z.string().nullable(),
  reviewAt: z.string().nullable(),
  approvedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  /** Variantes del alcance (0 mientras es borrador). */
  totalVariants: z.number(),
  /** Variantes con al menos una lectura en la ronda en curso (recuento: las ya recontadas). */
  scannedVariants: z.number(),
  /** Piezas contadas en la ronda en curso. */
  piecesCounted: z.number(),
  /** Variantes que requieren segundo recuento (0 si no hay o aún no se cerró el primer conteo). */
  recountTotal: z.number(),
  /** Hallazgos con piezas registradas. */
  findingsCount: z.number(),
});

/** Variante identificada en la captura: nada de stock del sistema. */
export const blindCountItemSchema = z.object({
  variantId: z.uuid(),
  sku: z.string(),
  barcode: z.string().nullable(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
  /** Piezas contadas en la ronda en curso. */
  quantity: z.number(),
  lastScanAt: z.string().nullable(),
});

export const countFindingSchema = z.object({
  id: z.uuid(),
  round: z.number(),
  code: z.string(),
  type: z.enum(INVENTORY_COUNT_FINDING_TYPES),
  sku: z.string().nullable(),
  productName: z.string().nullable(),
  quantity: z.number(),
  note: z.string().nullable(),
  regularized: z.boolean(),
  regularizedAt: z.string().nullable(),
  regularizedByName: z.string().nullable(),
  regularizationNote: z.string().nullable(),
});

export const lastCountScanSchema = z.object({
  /** ITEM = pieza del conteo; FINDING = hallazgo (código desconocido o fuera de alcance). */
  kind: z.enum(['ITEM', 'FINDING']),
  code: z.string(),
  sku: z.string().nullable(),
  productName: z.string().nullable(),
  variantLabel: z.string().nullable(),
  findingType: z.enum(INVENTORY_COUNT_FINDING_TYPES).nullable(),
  delta: z.number(),
  /** Piezas de esa variante (o hallazgo) después de la lectura. */
  quantityAfter: z.number(),
  at: z.string(),
});

const blindDetailFields = {
  view: z.literal('BLIND'),
  items: z.array(blindCountItemSchema),
  findings: z.array(countFindingSchema),
  lastScan: lastCountScanSchema.nullable(),
};

/** Detalle durante captura / recuento (también borrador y cancelado): sin cantidades del sistema. */
export const inventoryCountBlindDetailSchema =
  inventoryCountSummarySchema.extend(blindDetailFields);

export const reviewCountItemSchema = z.object({
  variantId: z.uuid(),
  sku: z.string(),
  barcode: z.string().nullable(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
  /** Foto del sistema al iniciar el conteo. */
  systemQty: z.number(),
  /** Esperado en el momento en que se contó la pieza (saldo vigente − movimientos posteriores). */
  expectedQty: z.number(),
  /** Primer conteo. */
  countedQty: z.number(),
  /** Segundo recuento (null si la variante no lo requirió). */
  recountQty: z.number().nullable(),
  /** Conteo final: el recuento prevalece sobre el primer conteo. */
  finalQty: z.number(),
  /** Movimientos (ingresos, ajustes…) ocurridos desde el conteo y conciliados. */
  reconciledMovements: z.number(),
  /** Diferencia real a ajustar: conteo final − esperado. */
  difference: z.number(),
  /** Saldo vigente (en revisión) o saldo anterior al ajuste (aprobado). */
  currentQty: z.number(),
  /** Saldo con el que quedará (en revisión) o quedó (aprobado). */
  resultingQty: z.number(),
  /** Costo unitario y valor de la diferencia: solo con `costs:read`. */
  unitCost: z.string().nullable(),
  valueImpact: z.string().nullable(),
  movementId: z.string().nullable(),
});

export const inventoryCountReviewDetailSchema = inventoryCountSummarySchema.extend({
  view: z.literal('REVIEW'),
  items: z.array(reviewCountItemSchema),
  findings: z.array(countFindingSchema),
  resolutionNotes: z.string().nullable(),
  approvedByName: z.string().nullable(),
  /** Variantes con diferencia ≠ 0. */
  differencesCount: z.number(),
  /** Suma de las diferencias (piezas). */
  netUnits: z.number(),
  /** Valor neto de las diferencias en Bs. Solo con `costs:read`; si no, null. */
  valueImpact: z.string().nullable(),
  /** Motivos por los que hoy no se puede aprobar (vacío = se puede). Solo en revisión. */
  blockers: z.array(z.string()),
});

export const inventoryCountDetailSchema = z.discriminatedUnion('view', [
  inventoryCountBlindDetailSchema,
  inventoryCountReviewDetailSchema,
]);

/** Respuesta de un escaneo: la lectura y el avance, sin stock del sistema. */
export const countScanResultSchema = z.object({
  /** Última lectura vigente (tras deshacer, la anterior; null si no queda ninguna). */
  scan: lastCountScanSchema.nullable(),
  item: blindCountItemSchema.nullable(),
  finding: countFindingSchema.nullable(),
  piecesCounted: z.number(),
  scannedVariants: z.number(),
});

export const countScanRecordSchema = z.object({
  id: z.string(),
  round: z.number(),
  code: z.string(),
  source: z.enum(['SCAN', 'MANUAL']),
  sku: z.string().nullable(),
  productName: z.string().nullable(),
  findingCode: z.string().nullable(),
  delta: z.number(),
  quantityAfter: z.number(),
  userName: z.string(),
  createdAt: z.string(),
  undone: z.boolean(),
});

export type InventoryCountSummary = z.infer<typeof inventoryCountSummarySchema>;
export type InventoryCountDetail = z.infer<typeof inventoryCountDetailSchema>;
export type InventoryCountBlindDetail = z.infer<typeof inventoryCountBlindDetailSchema>;
export type InventoryCountReviewDetail = z.infer<typeof inventoryCountReviewDetailSchema>;
export type BlindCountItem = z.infer<typeof blindCountItemSchema>;
export type ReviewCountItem = z.infer<typeof reviewCountItemSchema>;
export type CountFinding = z.infer<typeof countFindingSchema>;
export type LastCountScan = z.infer<typeof lastCountScanSchema>;
export type CountScanResult = z.infer<typeof countScanResultSchema>;
export type CountScanRecord = z.infer<typeof countScanRecordSchema>;
export type CreateInventoryCountInput = z.infer<typeof createInventoryCountSchema>;
export type ScanInventoryCountInput = z.infer<typeof scanInventoryCountSchema>;
export type SetCountQuantityInput = z.infer<typeof setCountQuantitySchema>;
export type CancelInventoryCountInput = z.infer<typeof cancelInventoryCountSchema>;
