import { describe, expect, it } from 'vitest';
import { EMPTY_PAYMENTS, type PaymentDraft } from './cart.ts';
import { summarizePayments } from './payments.ts';

const TOTAL = 20050n; // Bs 200,50

function pay(values: Partial<PaymentDraft>) {
  return summarizePayments(TOTAL, { ...EMPTY_PAYMENTS, ...values });
}

describe('cobro', () => {
  it('efectivo con vuelto: se aplica el total y el resto es vuelto', () => {
    const summary = pay({ cash: '250' });
    expect(summary.ready).toBe(true);
    expect(summary.changeCents).toBe(4950n);
    expect(summary.payments).toEqual([
      { methodCode: 'CASH', amount: '200.50', tendered: '250.00' },
    ]);
  });

  it('efectivo exacto con coma decimal', () => {
    const summary = pay({ cash: '200,50' });
    expect(summary.ready).toBe(true);
    expect(summary.changeCents).toBe(0n);
  });

  it('pago mixto: QR + efectivo con vuelto (el vuelto solo sale del efectivo)', () => {
    const summary = pay({ qr: '50', cash: '200', qrReference: '  OP-1 ' });
    expect(summary.ready).toBe(true);
    expect(summary.cashAppliedCents).toBe(15050n);
    expect(summary.changeCents).toBe(4950n);
    expect(summary.payments).toEqual([
      { methodCode: 'CASH', amount: '150.50', tendered: '200.00' },
      { methodCode: 'QR', amount: '50.00', reference: 'OP-1' },
    ]);
  });

  it('QR y transferencia sin efectivo', () => {
    const summary = pay({ qr: '100', transfer: '100.50' });
    expect(summary.ready).toBe(true);
    expect(summary.payments.map((payment) => payment.methodCode)).toEqual(['QR', 'BANK_TRANSFER']);
    expect(summary.payments[1]).not.toHaveProperty('reference');
  });

  it('muestra lo que falta y no permite revisar', () => {
    const summary = pay({ cash: '100' });
    expect(summary.ready).toBe(false);
    expect(summary.remainingCents).toBe(10050n);
    expect(summary.payments).toEqual([]);
  });

  it('QR y transferencia no pueden superar el total', () => {
    const summary = pay({ qr: '300' });
    expect(summary.ready).toBe(false);
    expect(summary.error).toMatch(/no pueden superar el total/);
  });

  it('si el total ya está cubierto sin efectivo, el efectivo recibido sobra', () => {
    const summary = pay({ qr: '200.50', cash: '10' });
    expect(summary.ready).toBe(false);
    expect(summary.error).toMatch(/deje vacío el efectivo/);
  });

  it('un importe inválido marca el campo', () => {
    const summary = pay({ cash: '12.345' });
    expect(summary.ready).toBe(false);
    expect(summary.fieldErrors.cash).toMatch(/Importe inválido/);
  });

  it('un cero explícito equivale a no usar el medio', () => {
    const summary = pay({ qr: '0', cash: '200.50' });
    expect(summary.ready).toBe(true);
    expect(summary.payments.map((payment) => payment.methodCode)).toEqual(['CASH']);
  });

  it('nunca hay pagos negativos', () => {
    expect(pay({ cash: '-10' }).fieldErrors.cash).toBeDefined();
  });
});
