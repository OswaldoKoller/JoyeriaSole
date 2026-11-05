import type { AdjustmentDetail } from '@joyeria/shared';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../test/render.tsx';
import { AdjustmentPage } from './adjustment-page.tsx';

const ID = '01900000-0000-7000-8000-0000000000aa';
const REQUESTER_ID = '01900000-0000-7000-8000-000000000001';
const ADMIN_ID = '01900000-0000-7000-8000-000000000002';

const adjustment = (overrides: Partial<AdjustmentDetail> = {}): AdjustmentDetail => ({
  id: ID,
  number: 7,
  status: 'PENDING',
  reasonId: '01900000-0000-7000-8000-0000000000b1',
  reasonName: 'Rotura',
  notes: 'Se cayó',
  requestedById: REQUESTER_ID,
  requestedByName: 'Responsable',
  createdAt: '2026-11-05T14:00:00.000Z',
  resolvedByName: null,
  resolvedAt: null,
  itemsCount: 1,
  netUnits: -2,
  valueImpact: null,
  resolutionNotes: null,
  cancelledAt: null,
  blockers: [],
  items: [
    {
      id: '01900000-0000-7000-8000-0000000000c1',
      variantId: '01900000-0000-7000-8000-0000000000d1',
      sku: 'SKU-000001',
      productName: 'Anillo Trébol',
      variantLabel: null,
      quantityDelta: -2,
      quantityAtRequest: 5,
      currentQuantity: 5,
      balanceBefore: null,
      balanceAfter: null,
      unitCost: null,
      valueImpact: null,
    },
  ],
  ...overrides,
});

function mockApi(userId: string, permissions: string[], detail: AdjustmentDetail) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith('/auth/me')) {
      return jsonResponse(200, {
        data: { id: userId, name: 'Usuario', email: 'u@test.local', roles: [], permissions },
      });
    }
    if (url.endsWith(`/inventory/adjustments/${ID}`)) return jsonResponse(200, { data: detail });
    throw new Error(`Petición inesperada: ${url}`);
  });
}

function renderDetail() {
  renderWithProviders(
    <Routes>
      <Route path="/inventario/ajustes/:id" element={<AdjustmentPage />} />
    </Routes>,
    { route: `/inventario/ajustes/${ID}` },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('detalle de un ajuste', () => {
  it('el Responsable ve su solicitud pendiente, puede cancelarla y NO ve aprobar ni rechazar', async () => {
    mockApi(REQUESTER_ID, ['inventory:read', 'inventory:adjust'], adjustment());
    renderDetail();

    expect(await screen.findByRole('heading', { name: /Ajuste AJ-000007/ })).toHaveTextContent(
      'Pendiente de aprobación',
    );
    // El usuario y sus permisos llegan en otra petición: se espera a que se resuelva.
    expect(
      await screen.findByText(/Esperando la aprobación del Administrador/),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Cancelar solicitud' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprobar ajuste' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechazar ajuste' })).not.toBeInTheDocument();
  });

  it('el Administrador puede aprobar y rechazar, pero no cancelar lo ajeno', async () => {
    mockApi(
      ADMIN_ID,
      ['inventory:read', 'inventory:adjust', 'inventory:adjust-approve'],
      adjustment(),
    );
    renderDetail();

    expect(await screen.findByRole('button', { name: 'Aprobar ajuste' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Rechazar ajuste' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar solicitud' })).not.toBeInTheDocument();
  });

  it('bloquea «Aprobar» y explica por qué cuando el saldo ya no alcanza', async () => {
    mockApi(
      ADMIN_ID,
      ['inventory:read', 'inventory:adjust', 'inventory:adjust-approve'],
      adjustment({ blockers: ['El saldo actual de SKU-000001 es 1: no alcanza para -2.'] }),
    );
    renderDetail();

    expect(await screen.findByRole('button', { name: 'Aprobar ajuste' })).toBeDisabled();
    expect(screen.getByText(/no alcanza para -2/)).toBeInTheDocument();
  });

  it('un ajuste resuelto no ofrece acciones y muestra cantidad anterior y nueva', async () => {
    mockApi(
      ADMIN_ID,
      ['inventory:read', 'inventory:adjust', 'inventory:adjust-approve'],
      adjustment({
        status: 'APPROVED',
        resolvedByName: 'Administradora',
        resolvedAt: '2026-11-05T15:00:00.000Z',
        blockers: [],
        items: [
          {
            ...adjustment().items[0]!,
            currentQuantity: null,
            balanceBefore: 5,
            balanceAfter: 3,
          },
        ],
      }),
    );
    renderDetail();

    expect(await screen.findByText(/Aprobado por Administradora/)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Cantidad anterior' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Cantidad nueva' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprobar ajuste' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar solicitud' })).not.toBeInTheDocument();
  });

  it('no muestra costos si la API no los envía (sin permiso de costos)', async () => {
    mockApi(REQUESTER_ID, ['inventory:read', 'inventory:adjust'], adjustment());
    renderDetail();
    await screen.findByRole('heading', { name: /Ajuste AJ-000007/ });
    expect(screen.queryByRole('columnheader', { name: 'Costo unitario' })).not.toBeInTheDocument();
    expect(screen.queryByText('Valor de la diferencia')).not.toBeInTheDocument();
  });
});
