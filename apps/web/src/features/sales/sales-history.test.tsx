import { todayInLaPaz, type SaleIncident } from '@joyeria/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { apiError, mockApi } from '../../test/api-mock.ts';
import { renderWithProviders } from '../../test/render.tsx';
import { USER_ID, saleDetail } from '../../test/sales-fixtures.ts';
import { IncidentsPage } from './incidents-page.tsx';
import { parseSaleNumber } from './sale-labels.ts';
import { SalePage } from './sale-page.tsx';
import { SalesPage } from './sales-page.tsx';

const SALE = saleDetail();
const PAGE = (data: unknown[]) => ({ data, meta: { page: 1, pageSize: 25, total: data.length } });
const SUMMARY = {
  id: SALE.id,
  number: SALE.number,
  soldAt: SALE.soldAt,
  sellerId: SALE.sellerId,
  sellerName: SALE.sellerName,
  total: SALE.total,
  itemsCount: SALE.itemsCount,
  paymentMethods: SALE.paymentMethods,
  cashSessionId: SALE.cashSessionId,
  cashSessionNumber: SALE.cashSessionNumber,
};

const INCIDENT: SaleIncident = {
  id: '01900000-0000-7000-8000-00000000f001',
  number: 4,
  kind: 'WRONG_PAYMENT',
  description: 'Se registró QR pero pagó en efectivo',
  status: 'OPEN',
  sale: { id: SALE.id, number: SALE.number },
  reportedBy: { id: USER_ID, name: 'Ana Cajera' },
  reportedAt: '2026-11-11T16:00:00.000Z',
  resolution: null,
  resolvedBy: null,
  resolvedAt: null,
};

describe('número de venta escrito', () => {
  it('acepta VTA-000123, vta 123 o 123', () => {
    expect(parseSaleNumber('VTA-000123')).toBe(123);
    expect(parseSaleNumber(' vta 123 ')).toBe(123);
    expect(parseSaleNumber('123')).toBe(123);
    expect(parseSaleNumber('0')).toBeNull();
    expect(parseSaleNumber('abc')).toBeNull();
  });
});

describe('historial de ventas', () => {
  it('por defecto muestra las ventas de hoy y busca por número', async () => {
    const calls = mockApi(
      { 'GET /sales': () => [200, PAGE([SUMMARY])] },
      { permissions: ['sales:read'] },
    );
    renderWithProviders(<SalesPage />);
    const user = userEvent.setup();
    const link = await screen.findByRole('link', { name: 'Abrir la venta VTA-000123' });
    expect(link).toHaveAttribute('href', `/ventas/${SALE.id}`);
    const today = todayInLaPaz();
    expect(calls[0]?.path).toContain(`from=${today}`);
    expect(calls[0]?.path).toContain(`to=${today}`);
    // Sin sales:read-all: sin columna ni filtro de vendedor (solo ve sus ventas).
    expect(screen.queryByLabelText('Vendedor')).not.toBeInTheDocument();
    expect(screen.getByText('Sus ventas registradas.', { exact: false })).toBeVisible();

    await user.type(screen.getByLabelText('Número de venta'), 'VTA-000123');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    const last = calls.at(-1)?.path ?? '';
    expect(last).toContain('number=123');
    expect(last).not.toContain('from=');
  });

  it('con sales:read-all y users:read ofrece el filtro de vendedor', async () => {
    const calls = mockApi(
      {
        'GET /sales': () => [200, PAGE([SUMMARY])],
        'GET /users': () => [
          200,
          PAGE([
            {
              id: USER_ID,
              name: 'Ana Cajera',
              email: 'ana@test.local',
              isActive: true,
              mustChangePassword: false,
              roles: [],
              lastLoginAt: null,
            },
          ]),
        ],
      },
      { permissions: ['sales:read', 'sales:read-all', 'users:read'] },
    );
    renderWithProviders(<SalesPage />);
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Vendedor'), 'Ana Cajera');
    expect(calls.at(-1)?.path).toContain(`sellerId=${USER_ID}`);
    expect(screen.getByRole('columnheader', { name: 'Vendedor' })).toBeVisible();
  });
});

function renderSale(permissions: string[], routes: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi(
    { [`GET /sales/${SALE.id}`]: () => [200, { data: SALE }], ...routes },
    { permissions },
  );
  renderWithProviders(
    <Routes>
      <Route path="/ventas/:id" element={<SalePage />} />
    </Routes>,
    { route: `/ventas/${SALE.id}` },
  );
  return calls;
}

describe('detalle de una venta', () => {
  it('es de solo lectura: sin anular, editar, devolver ni eliminar', async () => {
    renderSale(['sales:read', 'sales-incidents:report']);
    expect(await screen.findByRole('heading', { name: 'Venta VTA-000123' })).toBeVisible();
    expect(screen.getByRole('row', { name: /Anillo Sol/ })).toBeVisible();
    expect(screen.getByText('Referencia: OP-1')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ver comprobante' })).toHaveAttribute(
      'href',
      `/ventas/${SALE.id}/comprobante`,
    );
    for (const role of ['button', 'link'] as const) {
      expect(
        screen.queryByRole(role, { name: /anular|editar|devolver|eliminar|borrar|reembols/i }),
      ).not.toBeInTheDocument();
    }
  });

  it('reporta una incidencia (sin efecto en stock ni importes) con Idempotency-Key', async () => {
    const calls = renderSale(['sales:read', 'sales-incidents:report'], {
      'POST /sale-incidents': () => [201, { data: INCIDENT }],
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Reportar incidencia' }));
    const dialog = screen.getByRole('dialog', { name: 'Reportar incidencia' });
    expect(dialog).toHaveTextContent('La incidencia no modifica la venta, el stock ni la caja.');
    expect(within(dialog).getByLabelText('Tipo de incidencia')).toHaveFocus();

    // La descripción corta se rechaza antes de llamar a la API.
    await user.type(within(dialog).getByLabelText('Qué pasó'), 'corto');
    await user.click(within(dialog).getByRole('button', { name: 'Reportar incidencia' }));
    expect(calls.some((call) => call.method === 'POST')).toBe(false);

    await user.selectOptions(within(dialog).getByLabelText('Tipo de incidencia'), 'WRONG_PAYMENT');
    await user.type(within(dialog).getByLabelText('Qué pasó'), ': pagó en efectivo, no por QR');
    await user.click(within(dialog).getByRole('button', { name: 'Reportar incidencia' }));
    expect(await screen.findByText(/Incidencia INC-000004 registrada/)).toBeVisible();
    const post = calls.find((call) => call.method === 'POST');
    expect(post?.body).toEqual({
      kind: 'WRONG_PAYMENT',
      description: 'corto: pagó en efectivo, no por QR',
      saleNumber: 123,
    });
    expect(post?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    // Ningún dato de importes, cantidades ni piezas viaja en la incidencia.
    expect(Object.keys(post?.body as object)).toEqual(['kind', 'description', 'saleNumber']);
  });

  it('sin permiso no se ofrece reportar', async () => {
    renderSale(['sales:read']);
    await screen.findByRole('heading', { name: 'Venta VTA-000123' });
    expect(screen.queryByRole('button', { name: 'Reportar incidencia' })).not.toBeInTheDocument();
  });

  it('una venta ajena o inexistente muestra un aviso', async () => {
    mockApi(
      { [`GET /sales/${SALE.id}`]: () => [404, apiError('NOT_FOUND', 'No encontrada')] },
      { permissions: ['sales:read'] },
    );
    renderWithProviders(
      <Routes>
        <Route path="/ventas/:id" element={<SalePage />} />
      </Routes>,
      { route: `/ventas/${SALE.id}` },
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('No se encontró la venta');
  });
});

describe('incidencias (Administrador)', () => {
  it('lista las abiertas y exige la resolución para cerrar', async () => {
    const calls = mockApi(
      {
        'GET /sale-incidents': () => [200, PAGE([INCIDENT])],
        [`POST /sale-incidents/${INCIDENT.id}/close`]: () => [
          200,
          {
            data: {
              ...INCIDENT,
              status: 'CLOSED',
              resolution: 'Se corrigió el arqueo fuera del sistema',
              resolvedBy: { id: USER_ID, name: 'Admin' },
              resolvedAt: '2026-11-12T10:00:00.000Z',
            },
          },
        ],
      },
      { permissions: ['sales-incidents:manage'] },
    );
    renderWithProviders(<IncidentsPage />);
    const user = userEvent.setup();
    expect(calls[0]?.path).toContain('status=OPEN');
    expect(
      screen.getByText(/La incidencia no modifica la venta, el stock ni la caja\./),
    ).toBeVisible();
    await user.click(await screen.findByRole('button', { name: 'Ver la incidencia INC-000004' }));
    const dialog = screen.getByRole('dialog', { name: 'Incidencia INC-000004' });
    expect(dialog).toHaveTextContent('Se registró QR pero pagó en efectivo');
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar incidencia' }));
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    await user.type(
      within(dialog).getByLabelText(/Resolución/),
      'Se corrigió el arqueo fuera del sistema',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar incidencia' }));
    expect(await within(dialog).findByText(/Cerrada por Admin/)).toBeVisible();
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      resolution: 'Se corrigió el arqueo fuera del sistema',
    });
  });
});
