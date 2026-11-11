import type {
  CashSessionDetail,
  CashStatus,
  SaleDetail,
  SaleReceipt,
  VariantLookup,
} from '@joyeria/shared';

/** Datos de prueba de caja y ventas (formas exactas de los esquemas de `@joyeria/shared`). */

export const SESSION_ID = '01900000-0000-7000-8000-00000000c001';
export const USER_ID = '01900000-0000-7000-8000-0000000000a1';

export const OPEN_STATUS: CashStatus = {
  open: true,
  session: {
    id: SESSION_ID,
    number: 7,
    openedAt: '2026-11-11T12:00:00.000Z',
    openedByName: 'Rosa Responsable',
  },
};

export const CLOSED_STATUS: CashStatus = { open: false, session: null };

const TRANSFER_TOTAL: CashSessionDetail['totalsByMethod'][number] = {
  methodCode: 'BANK_TRANSFER',
  methodName: 'Transferencia',
  isCash: false,
  amount: '0.00',
  paymentsCount: 0,
};

export function openSession(overrides: Partial<CashSessionDetail> = {}): CashSessionDetail {
  return {
    id: SESSION_ID,
    number: 7,
    status: 'OPEN',
    openedAt: '2026-11-11T12:00:00.000Z',
    openedBy: { id: USER_ID, name: 'Rosa Responsable' },
    openingAmount: '100.00',
    closedAt: null,
    closedBy: null,
    cashSalesTotal: null,
    expectedCash: null,
    countedCash: null,
    difference: null,
    notes: null,
    liveExpectedCash: '250.00',
    totalsByMethod: [
      {
        methodCode: 'CASH',
        methodName: 'Efectivo',
        isCash: true,
        amount: '150.00',
        paymentsCount: 2,
      },
      { methodCode: 'QR', methodName: 'QR', isCash: false, amount: '80.00', paymentsCount: 1 },
      TRANSFER_TOTAL,
    ],
    salesCount: 2,
    salesTotal: '230.00',
    mixedSales: { count: 1, amount: '120.00' },
    current: {
      openingAmount: '100.00',
      expectedCash: '250.00',
      countedCash: null,
      difference: null,
    },
    corrections: { count: 0, lastAt: null },
    ...overrides,
  };
}

export function closedSession(overrides: Partial<CashSessionDetail> = {}): CashSessionDetail {
  return openSession({
    status: 'CLOSED',
    closedAt: '2026-11-11T22:00:00.000Z',
    closedBy: { id: USER_ID, name: 'Rosa Responsable' },
    cashSalesTotal: '150.00',
    expectedCash: '250.00',
    countedCash: '245.00',
    difference: '-5.00',
    notes: 'Faltan 5 Bs',
    liveExpectedCash: null,
    current: {
      openingAmount: '100.00',
      expectedCash: '250.00',
      countedCash: '245.00',
      difference: '-5.00',
    },
    ...overrides,
  });
}

export const RING: VariantLookup = {
  variantId: '01900000-0000-7000-8000-00000000b001',
  productId: '01900000-0000-7000-8000-00000000d001',
  productName: 'Anillo Sol',
  categoryName: 'Anillos',
  label: 'Talla 7',
  sku: 'SKU-000001',
  barcode: '7790000000011',
  salePrice: '120.50',
  status: 'ACTIVE',
  productStatus: 'ACTIVE',
  matchedBy: 'BARCODE',
  stockQuantity: 2,
};

export const CHAIN: VariantLookup = {
  ...RING,
  variantId: '01900000-0000-7000-8000-00000000b002',
  productId: '01900000-0000-7000-8000-00000000d002',
  productName: 'Cadena Luna',
  label: null,
  sku: 'SKU-000002',
  barcode: null,
  salePrice: '80.00',
  stockQuantity: 5,
  matchedBy: 'SKU',
};

export function saleDetail(overrides: Partial<SaleDetail> = {}): SaleDetail {
  return {
    id: '01900000-0000-7000-8000-00000000e001',
    number: 123,
    soldAt: '2026-11-11T15:30:00.000Z',
    sellerId: USER_ID,
    sellerName: 'Ana Cajera',
    total: '200.50',
    itemsCount: 2,
    paymentMethods: ['CASH', 'QR'],
    cashSessionId: SESSION_ID,
    cashSessionNumber: 7,
    items: [
      {
        variantId: RING.variantId,
        sku: RING.sku,
        productName: RING.productName,
        variantLabel: RING.label,
        quantity: 1,
        unitPrice: '120.50',
        lineTotal: '120.50',
      },
      {
        variantId: CHAIN.variantId,
        sku: CHAIN.sku,
        productName: CHAIN.productName,
        variantLabel: null,
        quantity: 1,
        unitPrice: '80.00',
        lineTotal: '80.00',
      },
    ],
    payments: [
      {
        methodCode: 'CASH',
        methodName: 'Efectivo',
        amount: '150.50',
        tendered: '200.00',
        changeGiven: '49.50',
        reference: null,
      },
      {
        methodCode: 'QR',
        methodName: 'QR',
        amount: '50.00',
        tendered: null,
        changeGiven: null,
        reference: 'OP-1',
      },
    ],
    changeGiven: '49.50',
    receiptPrints: 0,
    ...overrides,
  };
}

export function saleReceipt(overrides: Partial<SaleReceipt> = {}): SaleReceipt {
  const sale = saleDetail();
  return {
    saleId: sale.id,
    number: sale.number,
    soldAt: sale.soldAt,
    currency: 'BOB',
    items: sale.items.map((item) => ({
      sku: item.sku,
      productName: item.productName,
      variantLabel: item.variantLabel,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
    total: sale.total,
    payments: sale.payments.map((payment) => ({
      methodName: payment.methodName,
      amount: payment.amount,
      tendered: payment.tendered,
      changeGiven: payment.changeGiven,
    })),
    seller: null,
    business: {
      tradeName: 'Joyería Sole',
      address: 'Calle Comercio 123',
      phone: '70000000',
      taxId: null,
    },
    printCount: 0,
    ...overrides,
  };
}
