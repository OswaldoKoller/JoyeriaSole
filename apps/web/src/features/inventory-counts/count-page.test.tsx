import type {
  Category,
  InventoryCountBlindDetail,
  InventoryCountDetail,
  InventoryCountReviewDetail,
} from '@joyeria/shared';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../test/render.tsx';
import { categoryOptions } from './category-options.ts';
import { CountPage } from './count-page.tsx';

const ID = '01900000-0000-7000-8000-0000000000aa';
const OPERATOR_ID = '01900000-0000-7000-8000-000000000001';
const OTHER_ID = '01900000-0000-7000-8000-000000000002';
const VARIANT_ID = '01900000-0000-7000-8000-0000000000d1';

const summary = {
  id: ID,
  number: 3,
  categoryId: '01900000-0000-7000-8000-0000000000e1',
  scope: 'Joyería › Anillos',
  notes: null,
  createdByName: 'Responsable',
  operatorId: OPERATOR_ID,
  operatorName: 'Responsable',
  createdAt: '2026-11-05T14:00:00.000Z',
  startedAt: '2026-11-05T14:05:00.000Z',
  firstClosedAt: null,
  reviewAt: null,
  approvedAt: null,
  cancelledAt: null,
  totalVariants: 4,
  scannedVariants: 1,
  piecesCounted: 2,
  recountTotal: 0,
  findingsCount: 0,
} as const;

const blind = (overrides: Partial<InventoryCountBlindDetail> = {}): InventoryCountBlindDetail => ({
  ...summary,
  status: 'IN_PROGRESS',
  view: 'BLIND',
  items: [
    {
      variantId: VARIANT_ID,
      sku: 'SKU-000001',
      barcode: null,
      productName: 'Anillo Trébol',
      variantLabel: null,
      quantity: 2,
      lastScanAt: '2026-11-05T14:06:00.000Z',
    },
  ],
  findings: [],
  lastScan: null,
  ...overrides,
});

const review = (): InventoryCountReviewDetail => ({
  ...summary,
  status: 'IN_REVIEW',
  view: 'REVIEW',
  items: [
    {
      variantId: VARIANT_ID,
      sku: 'SKU-000001',
      barcode: null,
      productName: 'Anillo Trébol',
      variantLabel: null,
      systemQty: 5,
      expectedQty: 5,
      countedQty: 4,
      recountQty: 4,
      finalQty: 4,
      reconciledMovements: 0,
      difference: -1,
      currentQty: 5,
      resultingQty: 4,
      unitCost: null,
      valueImpact: null,
      movementId: null,
    },
  ],
  findings: [],
  resolutionNotes: null,
  approvedByName: null,
  differencesCount: 1,
  netUnits: -1,
  valueImpact: null,
  blockers: [],
});

function mockApi(userId: string, permissions: string[], detail: InventoryCountDetail) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith('/auth/me')) {
      return jsonResponse(200, {
        data: { id: userId, name: 'Usuario', email: 'u@test.local', roles: [], permissions },
      });
    }
    if (url.endsWith(`/inventory/counts/${ID}`)) return jsonResponse(200, { data: detail });
    throw new Error(`Petición inesperada: ${url}`);
  });
}

/** Espera a que la sesión (y sus permisos) haya llegado y se haya pintado. */
async function userLoaded() {
  await vi.waitFor(() => {
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      expect.stringContaining('/auth/me'),
      expect.anything(),
    );
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
}

function renderDetail() {
  renderWithProviders(
    <Routes>
      <Route path="/inventario/conteos/:id" element={<CountPage />} />
    </Routes>,
    { route: `/inventario/conteos/${ID}` },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pantalla del conteo físico', () => {
  it('el operador captura a ciegas: campo de lectura, lo contado y ninguna cantidad del sistema', async () => {
    mockApi(OPERATOR_ID, ['inventory-counts:read', 'inventory-counts:manage'], blind());
    renderDetail();

    expect(await screen.findByRole('heading', { name: /Conteo CNT-000003/ })).toHaveTextContent(
      'En captura',
    );
    expect(await screen.findByLabelText('Código de la pieza')).toBeInTheDocument();
    expect(screen.getByLabelText('Cantidad contada de SKU-000001')).toHaveValue(2);
    expect(await screen.findByRole('button', { name: 'Cerrar conteo' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Deshacer última lectura' })).toBeInTheDocument();
    // Ciego: nada del sistema ni de diferencias
    expect(screen.queryByText(/Esperado/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sistema/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Diferencia/)).not.toBeInTheDocument();
  });

  it('otro usuario no captura a la vez: ve quién captura y puede tomar el conteo', async () => {
    mockApi(OTHER_ID, ['inventory-counts:read', 'inventory-counts:manage'], blind());
    renderDetail();

    expect(await screen.findByText(/lo está capturando Responsable/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Código de la pieza')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar conteo' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Tomar el conteo' })).toBeInTheDocument();
  });

  it('quien solo puede leer no puede tomar el conteo', async () => {
    mockApi(OTHER_ID, ['inventory-counts:read'], blind());
    renderDetail();

    expect(await screen.findByText(/lo está capturando/)).toBeInTheDocument();
    await userLoaded();
    expect(screen.queryByRole('button', { name: 'Tomar el conteo' })).not.toBeInTheDocument();
  });

  it('el segundo recuento muestra solo las piezas a recontar', async () => {
    mockApi(
      OPERATOR_ID,
      ['inventory-counts:read', 'inventory-counts:manage'],
      blind({ status: 'RECOUNT', recountTotal: 1, scannedVariants: 0, piecesCounted: 0 }),
    );
    renderDetail();

    expect(
      await screen.findByRole('heading', { name: /Segundo recuento CNT-000003/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Piezas a recontar' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Cerrar recuento' })).toBeInTheDocument();
  });

  it('la revisión muestra el sistema, lo esperado y las diferencias; aprobar solo con permiso', async () => {
    mockApi(
      OPERATOR_ID,
      ['inventory-counts:read', 'inventory-counts:manage', 'inventory-counts:approve'],
      review(),
    );
    renderDetail();

    expect(
      await screen.findByRole('heading', { name: /Revisión del conteo CNT-000003/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Esperado' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Diferencia' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Aprobar conteo' })).toBeEnabled();
  });

  it('sin permiso de aprobar la revisión no ofrece Aprobar', async () => {
    mockApi(OPERATOR_ID, ['inventory-counts:read'], review());
    renderDetail();

    expect(await screen.findByText(/Esperando la aprobación/)).toBeInTheDocument();
    await userLoaded();
    expect(screen.queryByRole('button', { name: 'Aprobar conteo' })).not.toBeInTheDocument();
  });
});

describe('categoryOptions', () => {
  const category = (
    id: string,
    name: string,
    parentId: string | null,
    isActive = true,
  ): Category => ({
    id,
    name,
    parentId,
    slug: name.toLowerCase(),
    description: null,
    isActive,
    sortOrder: 0,
    attributes: [],
  });

  it('muestra la ruta completa, ordenada, sin categorías inactivas', () => {
    const options = categoryOptions([
      category('b', 'Anillos', 'a'),
      category('a', 'Joyería', null),
      category('c', 'Antiguas', 'a', false),
      category('d', 'Bolsos', null),
    ]);
    expect(options.map((option) => option.label)).toEqual([
      'Bolsos',
      'Joyería',
      'Joyería › Anillos',
    ]);
  });
});
