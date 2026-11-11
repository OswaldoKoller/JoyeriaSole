import type {
  CloseSaleIncidentInput,
  CreateSaleIncidentInput,
  CreateSaleInput,
  PaymentMethod,
  ReceiptFormat,
  ReceiptPrintEvent,
  SaleDetail,
  SaleIncident,
  SaleReceipt,
  SaleSummary,
  UserSummary,
} from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';
import { useAttemptKeys } from '../../lib/idempotency.ts';
import { PAGE_SIZE, useListQuery, type Paged } from '../../lib/paging.ts';
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
  list: (filters: SaleFilters) => ['sales', 'list', filters] as const,
  sellers: ['sales', 'sellers'] as const,
  incidents: ['sale-incidents'] as const,
  incidentList: (page: number, status: string, from: string, to: string) =>
    ['sale-incidents', 'list', page, status, from, to] as const,
};

export interface SaleFilters {
  page: number;
  from: string;
  to: string;
  number: string;
  sellerId: string;
  methodCode: string;
  cashSessionId: string;
}

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

/**
 * V6 · Registrar la impresión ANTES de imprimir: la respuesta dice si es original o copia. Lleva
 * una `Idempotency-Key` por acción de imprimir (opcional en la API), reutilizada si se reintenta
 * tras un fallo: un doble clic o un reintento no registran una «COPIA» falsa.
 */
export function useRegisterPrint(id: string) {
  const client = useQueryClient();
  const attempt = useAttemptKeys();
  return useMutation({
    mutationFn: async (format: ReceiptFormat) =>
      (
        await api.post<{ data: ReceiptPrintEvent }>(
          `/sales/${id}/receipt/print-events`,
          { format },
          { idempotencyKey: attempt.keyFor({ id, format }) },
        )
      ).data,
    onSettled: (_data, error) => {
      attempt.settle(error);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: salesKeys.receipt(id) });
      void client.invalidateQueries({ queryKey: salesKeys.detail(id) });
    },
  });
}

/** V3 · Historial de ventas. Sin `sales:read-all` la API devuelve solo las ventas propias (D-02). */
export function useSales(filters: SaleFilters) {
  const query = new URLSearchParams({ page: String(filters.page), pageSize: String(PAGE_SIZE) });
  for (const key of ['from', 'to', 'number', 'sellerId', 'methodCode', 'cashSessionId'] as const) {
    if (filters[key]) query.set(key, filters[key]);
  }
  return useListQuery(salesKeys.list(filters), () =>
    api.get<Paged<SaleSummary>>(`/sales?${query}`),
  );
}

/**
 * Vendedores para el filtro del historial: solo para quien ve todas las ventas y además puede
 * consultar usuarios (`users:read`); sin ese permiso el filtro no se ofrece.
 */
export function useSellerOptions(enabled: boolean) {
  return useQuery({
    queryKey: salesKeys.sellers,
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () =>
      (await api.get<Paged<UserSummary>>('/users?page=1&pageSize=100&q=&status=all')).data,
  });
}

/**
 * N1 · Reportar una incidencia. Es SOLO trazabilidad: no modifica la venta, el stock, los pagos
 * ni la caja (D-10). Idempotente: una clave por intento, reutilizada en los reintentos.
 */
export function useReportIncident() {
  const client = useQueryClient();
  const attempt = useAttemptKeys();
  return useMutation({
    mutationFn: async (input: CreateSaleIncidentInput) =>
      (
        await api.post<{ data: SaleIncident }>('/sale-incidents', input, {
          idempotencyKey: attempt.keyFor(input),
        })
      ).data,
    onSettled: (_data, error) => {
      attempt.settle(error);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: salesKeys.incidents }),
  });
}

/** N2 · Incidencias (`sales-incidents:manage`, solo Administrador). */
export function useIncidents(page: number, status: string, from: string, to: string) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), status });
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  return useListQuery(salesKeys.incidentList(page, status, from, to), () =>
    api.get<Paged<SaleIncident>>(`/sale-incidents?${query}`),
  );
}

/** N4 · Cerrar una incidencia describiendo lo resuelto FUERA del sistema. */
export function useCloseIncident(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CloseSaleIncidentInput) =>
      (await api.post<{ data: SaleIncident }>(`/sale-incidents/${id}/close`, input)).data,
    onSuccess: () => client.invalidateQueries({ queryKey: salesKeys.incidents }),
  });
}
