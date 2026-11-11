import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../test/api-mock.ts';
import { renderWithProviders } from '../../test/render.tsx';
import {
  CLOSED_STATUS,
  OPEN_STATUS,
  closedSession,
  openSession,
} from '../../test/sales-fixtures.ts';
import { CashPage } from './cash-page.tsx';
import { CashSessionPage } from './cash-session-page.tsx';
import { Route, Routes } from 'react-router';

const MANAGER = ['cash:read', 'cash:open', 'cash:close', 'sales:create'];

describe('pantalla de caja', () => {
  it('abre la caja con el fondo inicial (coma decimal y clave de idempotencia)', async () => {
    let open = false;
    const calls = mockApi(
      {
        'GET /cash/status': () => [200, { data: open ? OPEN_STATUS : CLOSED_STATUS }],
        'GET /cash/sessions/current': () => [200, { data: openSession() }],
        'POST /cash/sessions': () => {
          open = true;
          return [201, { data: openSession({ openingAmount: '150.50' }) }];
        },
      },
      { permissions: MANAGER },
    );
    renderWithProviders(<CashPage />);
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { name: 'La caja está cerrada' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Abrir caja' }));

    const dialog = screen.getByRole('dialog', { name: 'Abrir caja' });
    const field = within(dialog).getByLabelText('Fondo inicial (Bs)');
    expect(field).toHaveFocus();
    // Vacío no es cero (D-05).
    await user.click(within(dialog).getByRole('button', { name: 'Abrir caja' }));
    expect(field).toHaveAccessibleDescription(/escriba 0/);
    expect(calls.some((call) => call.method === 'POST')).toBe(false);

    await user.type(field, '150,50');
    await user.click(within(dialog).getByRole('button', { name: 'Abrir caja' }));
    expect(await screen.findByText(/CAJ-000007 abierta con un fondo de/)).toBeVisible();
    const post = calls.find((call) => call.method === 'POST');
    expect(post?.body).toEqual({ openingAmount: '150.50' });
    expect(post?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByRole('heading', { name: /Caja abierta/ })).toBeVisible();
  });

  it('acepta el cero escrito de forma explícita', async () => {
    const calls = mockApi(
      {
        'GET /cash/status': () => [200, { data: CLOSED_STATUS }],
        'POST /cash/sessions': () => [201, { data: openSession({ openingAmount: '0.00' }) }],
      },
      { permissions: ['cash:open'] },
    );
    renderWithProviders(<CashPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Abrir caja' }));
    await user.type(screen.getByLabelText('Fondo inicial (Bs)'), '0');
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Abrir caja' }),
    );
    await screen.findByText(/abierta con un fondo de/);
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ openingAmount: '0' });
  });

  it('con caja abierta muestra cifras en vivo y el acceso al cierre', async () => {
    mockApi(
      {
        'GET /cash/status': () => [200, { data: OPEN_STATUS }],
        'GET /cash/sessions/current': () => [200, { data: openSession() }],
      },
      { permissions: MANAGER },
    );
    renderWithProviders(<CashPage />);
    expect(await screen.findByText(/Abierta por Rosa Responsable/)).toBeVisible();
    expect(await screen.findByText('Efectivo esperado ahora')).toBeVisible();
    expect(screen.getAllByText(/Informado aparte/).length).toBe(2);
    expect(screen.getByRole('link', { name: 'Cerrar caja' })).toHaveAttribute(
      'href',
      '/caja/cierre',
    );
  });

  it('el Vendedor ve el estado sin cifras y no puede abrir ni cerrar', async () => {
    const calls = mockApi(
      { 'GET /cash/status': () => [200, { data: OPEN_STATUS }] },
      { permissions: ['sales:create', 'sales:read'] },
    );
    renderWithProviders(<CashPage />);
    expect(await screen.findByText(/Abierta por Rosa Responsable/)).toBeVisible();
    expect(screen.queryByText('Efectivo esperado ahora')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cerrar caja' })).not.toBeInTheDocument();
    expect(calls.map((call) => call.path)).toEqual(['/cash/status']);
  });

  it('el Vendedor sin caja abierta no ve «Abrir caja»', async () => {
    mockApi(
      { 'GET /cash/status': () => [200, { data: CLOSED_STATUS }] },
      { permissions: ['sales:create'] },
    );
    renderWithProviders(<CashPage />);
    expect(await screen.findByText(/Pida a un Administrador/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Abrir caja' })).not.toBeInTheDocument();
  });
});

describe('detalle de una caja', () => {
  function renderSession(permissions: string[], session = closedSession()) {
    mockApi(
      {
        [`GET /cash/sessions/${session.id}`]: () => [200, { data: session }],
        [`GET /cash/sessions/${session.id}/corrections`]: () => [200, { data: [] }],
      },
      { permissions },
    );
    renderWithProviders(
      <Routes>
        <Route path="/caja/sesiones/:id" element={<CashSessionPage />} />
      </Routes>,
      { route: `/caja/sesiones/${session.id}` },
    );
  }

  it('muestra cifras originales y vigentes y la marca «Corregida (N)»', async () => {
    renderSession(
      ['cash:read', 'cash:correct'],
      closedSession({
        corrections: { count: 1, lastAt: '2026-11-12T10:00:00.000Z' },
        current: {
          openingAmount: '100.00',
          expectedCash: '250.00',
          countedCash: '250.00',
          difference: '0.00',
        },
      }),
    );
    expect(await screen.findByText('Corregida (1)')).toBeVisible();
    expect(screen.getByLabelText('Cierre original')).toHaveTextContent(/Faltante de .*5,00/);
    expect(screen.getByLabelText('Cifras vigentes')).toHaveTextContent('Sin diferencia');
    expect(screen.getByRole('button', { name: 'Corregir cierre' })).toBeVisible();
  });

  it('sin cash:correct no hay «Corregir cierre»', async () => {
    renderSession(['cash:read']);
    await screen.findByRole('heading', { name: 'Caja CAJ-000007' });
    expect(screen.queryByRole('button', { name: 'Corregir cierre' })).not.toBeInTheDocument();
  });

  it('una caja abierta no se corrige', async () => {
    renderSession(['cash:read', 'cash:correct'], openSession());
    await screen.findByRole('heading', { name: 'Caja CAJ-000007' });
    expect(screen.queryByRole('button', { name: 'Corregir cierre' })).not.toBeInTheDocument();
  });
});
