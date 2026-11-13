import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, mockApi } from '../../test/api-mock.ts';
import { renderWithProviders } from '../../test/render.tsx';
import { SESSION_ID, closedSession, openSession } from '../../test/sales-fixtures.ts';
import { CashClosePage } from './cash-close-page.tsx';

const CLOSER = ['cash:read', 'cash:close'];
const CLOSE = `POST /cash/sessions/${SESSION_ID}/close`;

async function countAndContinue(amount: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Efectivo contado (Bs)'), amount);
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
  await screen.findByRole('heading', { name: '2. Revise el arqueo' });
  return user;
}

describe('cierre de caja', () => {
  it('anuncia la diferencia y exige la observación antes de cerrar (R-14)', async () => {
    const calls = mockApi(
      {
        'GET /cash/sessions/current': () => [200, { data: openSession() }],
        [CLOSE]: () => [200, { data: closedSession() }],
      },
      { permissions: CLOSER },
    );
    renderWithProviders(<CashClosePage />);
    const user = await countAndContinue('245');

    expect(screen.getByText(/Faltante de .*5,00/).closest('[aria-live]')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(screen.getByText(/QR y transferencia se informan aparte/)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Observación \(obligatoria: hay diferencia\)/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/explique el motivo/);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);

    await user.type(screen.getByLabelText(/Observación/), 'Faltan 5 Bs');
    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Cerrar la caja?' });
    expect(dialog).toHaveTextContent('El cierre no se puede reabrir');
    // El foco entra al botón de confirmación del diálogo.
    expect(within(dialog).getByRole('button', { name: 'Confirmar cierre' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar cierre' }));

    expect(await screen.findByRole('heading', { name: 'Caja CAJ-000007 cerrada' })).toHaveFocus();
    const post = calls.find((call) => call.method === 'POST');
    expect(post?.body).toEqual({ countedCash: '245', notes: 'Faltan 5 Bs' });
    expect(post?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    // El cliente nunca envía el esperado: lo calcula el servidor.
    expect(post?.body).not.toHaveProperty('expectedCash');
  });

  it('sin diferencia la observación es opcional y no se envía vacía', async () => {
    const calls = mockApi(
      {
        'GET /cash/sessions/current': () => [200, { data: openSession() }],
        [CLOSE]: () => [
          200,
          { data: closedSession({ countedCash: '250.00', difference: '0.00' }) },
        ],
      },
      { permissions: CLOSER },
    );
    renderWithProviders(<CashClosePage />);
    const user = await countAndContinue('250,00');
    expect(screen.getByText('Sin diferencia')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar cierre' }));
    await screen.findByRole('heading', { name: /cerrada/ });
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ countedCash: '250.00' });
  });

  it('el doble clic en «Confirmar cierre» envía una sola petición', async () => {
    let release: () => void = () => undefined;
    const calls = mockApi(
      {
        'GET /cash/sessions/current': () => [200, { data: openSession() }],
        [CLOSE]: () =>
          new Promise((resolve) => {
            release = () => {
              resolve([200, { data: closedSession() }]);
            };
          }),
      },
      { permissions: CLOSER },
    );
    renderWithProviders(<CashClosePage />);
    const user = await countAndContinue('250');
    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    const confirm = await screen.findByRole('button', { name: 'Confirmar cierre' });
    await user.click(confirm);
    await user.dblClick(screen.getByRole('button', { name: 'Cerrando…' }));
    release();
    await screen.findByRole('heading', { name: /cerrada/ });
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  });

  it('tras un corte de red reintenta con la MISMA clave de idempotencia', async () => {
    let attempts = 0;
    const calls = mockApi(
      {
        'GET /cash/sessions/current': () => [200, { data: openSession() }],
        [CLOSE]: () => {
          attempts += 1;
          return attempts === 1
            ? new TypeError('Failed to fetch')
            : [200, { data: closedSession() }];
        },
      },
      { permissions: CLOSER },
    );
    renderWithProviders(<CashClosePage />);
    const user = await countAndContinue('250');
    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar cierre' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se cerrará dos veces/);
    await user.click(screen.getByRole('button', { name: 'Confirmar cierre' }));
    await screen.findByRole('heading', { name: /cerrada/ });
    const keys = calls.filter((call) => call.method === 'POST').map((call) => call.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('si el servidor detecta una diferencia nueva, actualiza el esperado y pide la observación', async () => {
    const calls = mockApi(
      {
        'GET /cash/sessions/current': () => [200, { data: openSession() }],
        [CLOSE]: (call) =>
          (call.body as { notes?: string }).notes
            ? [200, { data: closedSession() }]
            : [
                422,
                apiError('CASH_DIFFERENCE_NOTE_REQUIRED', 'Hay diferencia', {
                  expectedCash: '270.00',
                  countedCash: '250.00',
                  difference: '-20.00',
                }),
              ],
      },
      { permissions: CLOSER },
    );
    renderWithProviders(<CashClosePage />);
    const user = await countAndContinue('250');
    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar cierre' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Se registraron ventas/);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/Faltante de .*20,00/)).toBeInTheDocument();
    const note = screen.getByLabelText(/Observación \(obligatoria/);
    await waitFor(() => {
      expect(note).toHaveFocus();
    });
    await user.type(note, 'Venta tardía');
    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar cierre' }));
    await screen.findByRole('heading', { name: /cerrada/ });
    const keys = calls.filter((call) => call.method === 'POST').map((call) => call.idempotencyKey);
    // Cambió la observación: es otra operación y lleva otra clave.
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('el resultado del cierre sigue visible cuando ya no hay caja abierta', async () => {
    let closed = false;
    mockApi(
      {
        'GET /cash/sessions/current': () =>
          closed
            ? [404, apiError('NOT_FOUND', 'Sin caja abierta')]
            : [200, { data: openSession() }],
        [CLOSE]: () => {
          closed = true;
          return [200, { data: closedSession() }];
        },
      },
      { permissions: CLOSER },
    );
    renderWithProviders(<CashClosePage />);
    const user = await countAndContinue('250');
    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar cierre' }));
    expect(await screen.findByRole('heading', { name: 'Caja CAJ-000007 cerrada' })).toBeVisible();
    // La recarga de la sesión actual (ya cerrada) no reemplaza el resultado.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole('heading', { name: 'Caja CAJ-000007 cerrada' })).toBeVisible();
    expect(screen.queryByText('No hay ninguna caja abierta para cerrar.')).not.toBeInTheDocument();
  });

  it('el contado vacío no es cero', async () => {
    mockApi(
      { 'GET /cash/sessions/current': () => [200, { data: openSession() }] },
      { permissions: CLOSER },
    );
    renderWithProviders(<CashClosePage />);
    const user = userEvent.setup();
    await screen.findByLabelText('Efectivo contado (Bs)');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByLabelText('Efectivo contado (Bs)')).toHaveAccessibleDescription(/escriba 0/);
  });
});
