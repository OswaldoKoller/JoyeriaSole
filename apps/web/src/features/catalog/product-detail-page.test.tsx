import type { Product } from '@joyeria/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../app/query-client.ts';
import { jsonResponse } from '../../test/render.tsx';
import { ProductDetailPage } from './product-detail-page.tsx';

const PRODUCT_ID = '00000000-0000-7000-8000-000000000001';
const DETAIL_URL = `/api/v1/products/${PRODUCT_ID}`;

function makeProduct(overrides: Partial<Product> = {}, stock = 0): Product {
  return {
    id: PRODUCT_ID,
    categoryId: '00000000-0000-7000-8000-000000000009',
    categoryName: 'Anillos',
    name: 'Anillo luna',
    description: 'Plata 925',
    model: 'L-12',
    status: 'ACTIVE',
    isIncomplete: false,
    hasMissingPrice: false,
    profileIncomplete: false,
    attributes: [],
    axes: [],
    variants: [
      {
        id: '00000000-0000-7000-8000-000000000201',
        sku: 'SKU-000001',
        barcode: null,
        label: 'Única',
        salePrice: '80.00',
        minStock: 1,
        stockQuantity: stock,
        stockLevel: stock === 0 ? 'OUT' : 'OK',
        status: 'ACTIVE',
      },
    ],
    photos: [],
    ...overrides,
  };
}

type Api = {
  permissions: string[];
  /** Respuesta del detalle; por defecto 200 con el producto. */
  detail?: () => Response | Promise<Response>;
  product?: Product;
};

/** Servidor simulado: anota cada petición para poder afirmar qué se pidió (y qué no). */
function mockApi({ permissions, detail, product = makeProduct() }: Api) {
  const requests: { method: string; url: string; body?: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const method = init?.method ?? 'GET';
    if (url.endsWith('/auth/me')) {
      return jsonResponse(200, {
        data: { id: 'u', name: 'Ana', email: 'ana@test.local', roles: [], permissions },
      });
    }
    requests.push({
      method,
      url,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    if (url === DETAIL_URL && method === 'GET') {
      return detail ? detail() : jsonResponse(200, { data: product });
    }
    if (url === DETAIL_URL && method === 'PATCH') {
      const input = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
        status?: Product['status'];
      };
      return jsonResponse(200, { data: { ...product, status: input.status ?? product.status } });
    }
    if (url === DETAIL_URL && method === 'DELETE') {
      return jsonResponse(200, { data: { id: PRODUCT_ID } });
    }
    throw new Error(`Petición inesperada: ${method} ${url}`);
  });
  return requests;
}

function renderDetail(
  entry: string | { pathname: string; state: unknown } = `/productos/${PRODUCT_ID}`,
) {
  const client = createQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: { ...client.getDefaultOptions().queries, retry: false },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/productos/:id" element={<ProductDetailPage />} />
          <Route path="/productos" element={<p>Pantalla del listado</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const NAME = 'Anillo luna';

describe('ficha del producto (permisos)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('con solo catalog:read consulta la ficha sin acciones de gestión ni de stock', async () => {
    mockApi({ permissions: ['catalog:read'], product: makeProduct({}, 4) });
    renderDetail();
    expect(await screen.findByRole('heading', { level: 1, name: new RegExp(NAME) })).toBeVisible();
    expect(screen.getByRole('link', { name: `Imprimir etiquetas de ${NAME}` })).toBeVisible();
    expect(screen.queryByRole('button', { name: `Editar ${NAME}` })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(`Desactivar ${NAME}`) })).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(`Eliminar ${NAME}`) })).toBeNull();
    expect(screen.queryByText(/Stock:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Disponible')).not.toBeInTheDocument();
  });

  it('con inventory:read muestra el stock y la disponibilidad', async () => {
    mockApi({ permissions: ['catalog:read', 'inventory:read'], product: makeProduct({}, 4) });
    renderDetail();
    expect(await screen.findByText('Disponible')).toBeVisible();
    expect(screen.getAllByText(/Stock:/)[0]?.parentElement).toHaveTextContent('Stock: 4');
  });

  it('con catalog:manage permite editar, desactivar y configurar variantes, pero no eliminar', async () => {
    mockApi({ permissions: ['catalog:read', 'catalog:manage'] });
    renderDetail();
    expect(await screen.findByRole('button', { name: `Editar ${NAME}` })).toBeEnabled();
    expect(screen.getByRole('button', { name: `Desactivar ${NAME}` })).toBeEnabled();
    expect(screen.getByRole('button', { name: `Configurar variantes de ${NAME}` })).toBeVisible();
    expect(screen.queryByRole('button', { name: `Eliminar ${NAME}` })).not.toBeInTheDocument();
  });

  it('con catalog:delete aparece Eliminar y no las acciones de edición', async () => {
    mockApi({ permissions: ['catalog:read', 'catalog:delete'] });
    renderDetail();
    expect(await screen.findByRole('button', { name: `Eliminar ${NAME}` })).toBeVisible();
    expect(screen.queryByRole('button', { name: `Editar ${NAME}` })).not.toBeInTheDocument();
  });

  it('el precio indica que es neto', async () => {
    mockApi({ permissions: ['catalog:read'] });
    renderDetail();
    expect((await screen.findAllByText('neto'))[0]).toBeVisible();
  });
});

describe('ficha del producto (estados de carga y error)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mientras carga muestra un aviso de estado', async () => {
    mockApi({
      permissions: ['catalog:read'],
      detail: () => new Promise<Response>(() => undefined),
    });
    renderDetail();
    expect(await screen.findByRole('status')).toHaveTextContent('Cargando producto…');
  });

  it('404: dice que el producto no existe o fue eliminado y no ofrece reintentar', async () => {
    mockApi({
      permissions: ['catalog:read'],
      detail: () =>
        jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Producto no encontrado' } }),
    });
    renderDetail();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este producto no existe o fue eliminado.',
    );
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('500: no afirma que el producto no exista y permite reintentar', async () => {
    let calls = 0;
    mockApi({
      permissions: ['catalog:read'],
      detail: () => {
        calls += 1;
        return calls === 1
          ? jsonResponse(500, { error: { code: 'INTERNAL_ERROR', message: 'Error interno' } })
          : jsonResponse(200, { data: makeProduct() });
      },
    });
    renderDetail();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo cargar el producto.');
    expect(alert).not.toHaveTextContent('no existe');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { level: 1, name: new RegExp(NAME) })).toBeVisible();
  });
});

describe('ficha del producto (desactivar y eliminar)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('con stock, Desactivar queda bloqueado y explica el motivo', async () => {
    mockApi({ permissions: ['catalog:read', 'catalog:manage'], product: makeProduct({}, 5) });
    renderDetail();
    const button = await screen.findByRole('button', { name: `Desactivar ${NAME}` });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/tiene 5 piezas en stock/);
  });

  it('sin stock desactiva con PATCH y no vuelve a pedir la ficha (usa la respuesta)', async () => {
    const requests = mockApi({ permissions: ['catalog:read', 'catalog:manage'] });
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: `Desactivar ${NAME}` }));
    expect(await screen.findByRole('button', { name: `Activar ${NAME}` })).toBeVisible();
    expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({ status: 'INACTIVE' });
    expect(requests.filter((r) => r.method === 'GET' && r.url === DETAIL_URL)).toHaveLength(1);
  });

  it('Eliminar pide confirmación y Cancelar no elimina nada', async () => {
    const requests = mockApi({ permissions: ['catalog:read', 'catalog:delete'] });
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: `Eliminar ${NAME}` }));
    const dialog = screen.getByRole('alertdialog', {
      name: `Confirmar eliminación de ${NAME}`,
    });
    expect(dialog).toHaveTextContent('Esta acción no se puede deshacer');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar eliminación' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(requests.some((r) => r.method === 'DELETE')).toBe(false);
  });

  it('al confirmar elimina, vuelve al listado y no vuelve a pedir la ficha eliminada', async () => {
    const requests = mockApi({ permissions: ['catalog:read', 'catalog:delete'] });
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: `Eliminar ${NAME}` }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, eliminar definitivamente' }));
    expect(await screen.findByText('Pantalla del listado')).toBeVisible();
    expect(requests.filter((r) => r.method === 'DELETE')).toHaveLength(1);
    // Un GET posterior daría 404: la ficha eliminada se quita de la caché, no se refresca.
    expect(requests.filter((r) => r.method === 'GET' && r.url === DETAIL_URL)).toHaveLength(1);
  });
});

describe('ficha del producto (navegación y accesibilidad)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('«Volver a Productos» conserva la búsqueda con la que se llegó', async () => {
    mockApi({ permissions: ['catalog:read'] });
    renderDetail({
      pathname: `/productos/${PRODUCT_ID}`,
      state: { productsSearch: '?q=anillo&page=2' },
    });
    expect(await screen.findByRole('link', { name: '← Volver a Productos' })).toHaveAttribute(
      'href',
      '/productos?q=anillo&page=2',
    );
  });

  it('sin contexto (o con un estado inválido) vuelve al listado sin filtros', async () => {
    mockApi({ permissions: ['catalog:read'] });
    renderDetail({
      pathname: `/productos/${PRODUCT_ID}`,
      state: { productsSearch: 'https://x.test' },
    });
    expect(await screen.findByRole('link', { name: '← Volver a Productos' })).toHaveAttribute(
      'href',
      '/productos',
    );
  });

  it('el título de la pestaña lleva el nombre del producto', async () => {
    mockApi({ permissions: ['catalog:read'] });
    renderDetail();
    await screen.findByRole('heading', { level: 1, name: new RegExp(NAME) });
    expect(document.title).toBe(`${NAME} · Joyería Sole`);
  });

  it('la imagen principal se pide con prioridad (no es perezosa)', async () => {
    const photo = {
      id: '00000000-0000-7000-8000-000000000101',
      url: `/api/v1/products/${PRODUCT_ID}/photos/00000000-0000-7000-8000-000000000101`,
      contentType: 'image/webp',
      width: 800,
      height: 600,
      sizeBytes: 1000,
      position: 0,
      isCover: true,
    };
    mockApi({ permissions: ['catalog:read'], product: makeProduct({ photos: [photo] }) });
    renderDetail();
    const image = await screen.findByRole('img', { name: `Foto de portada de ${NAME}` });
    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveAttribute('fetchpriority', 'high');
  });
});
