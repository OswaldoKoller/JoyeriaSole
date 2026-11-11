import type {
  CreateSaleInput,
  PaymentMethod,
  ReceiptFormat,
  ReceiptPrintEvent,
  SaleDetail,
  SaleReceipt,
} from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';
import { cashKeys } from '../cash/use-cash.ts';

/**
 * Ventas de mostrador (E1, plan 11 §4.5). Una venta confirmada no se anula, no se borra y no se
 * modifica (DEC-V07): aquí solo hay alta, consulta e impresión del comprobante.
 */
export const salesKeys = {
  all: ['sales'] as const,
  paymentMethods: ['sales', 'payment-methods'] as const,
  detail: (id: string) => ['sales', 'detail', id] as const,
  receipt: (id: string) => ['sales', 'receipt', id] as const,
};

/** V1 · Medios de pago activos, en orden (Efectivo, QR, Transferencia). */
export function usePaymentMethods() {
  return useQuery({
    queryKey: salesKeys.paymentMethods,
    queryFn: async () => (await api.get<{ data: PaymentMethod[] }>('/payment-methods')).data,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * V2 · Confirmar la venta. La `Idempotency-Key` la decide el punto de venta (se genera al entrar a
 * la revisión, se guarda en `sessionStorage` y se reutiliza en los reintentos): por eso viaja
 * como argumento y no se calcula aquí.
 */
export function useCreateSale() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, key }: { body: CreateSaleInput; key: string }) =>
      (await api.post<{ data: SaleDetail }>('/sales', body, { idempotencyKey: key })).data,
    onSuccess: (sale) => {
      client.setQueryData(salesKeys.detail(sale.id), sale);
      void client.invalidateQueries({ queryKey: salesKeys.all });
      void client.invalidateQueries({ queryKey: cashKeys.all });
      // El stock cambió: saldos, movimientos y fichas de producto deben volver a pedirse.
      void client.invalidateQueries({ queryKey: ['inventory'] });
      void client.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useSale(id: string) {
  return useQuery({
    queryKey: salesKeys.detail(id),
    queryFn: async () => (await api.get<{ data: SaleDetail }>(`/sales/${id}`)).data,
  });
}

/** V5 · Comprobante (leerlo no escribe nada). */
export function useSaleReceipt(id: string) {
  return useQuery({
    queryKey: salesKeys.receipt(id),
    queryFn: async () => (await api.get<{ data: SaleReceipt }>(`/sales/${id}/receipt`)).data,
  });
}

/** V6 · Registrar la impresión ANTES de imprimir: la respuesta dice si es original o copia. */
export function useRegisterPrint(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (format: ReceiptFormat) =>
      (
        await api.post<{ data: ReceiptPrintEvent }>(`/sales/${id}/receipt/print-events`, {
          format,
        })
      ).data,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: salesKeys.receipt(id) });
      void client.invalidateQueries({ queryKey: salesKeys.detail(id) });
    },
  });
}
