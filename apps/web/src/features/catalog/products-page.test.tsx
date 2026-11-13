import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../app/query-client.ts';
import { jsonResponse } from '../../test/render.tsx';
import { ProductsPage } from './products-page.tsx';

const CATEGORY_ID = '00000000-0000-7000-8000-000000000009';

function product(n: number, name = `Producto ${n}`) {
  const id = `00000000-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`;
  return {
    id,
    categoryId: CATEGORY_ID,
    categoryName: 'Anillos',
    name,
    description: null,
    model: null,
    status: 'ACTIVE',
    isIncomplete: false,
    hasMissingPrice: false,
    profileIncomplete: false,
    attributes: [],
    axes: [],
    variants: [
      {
        id: `00000000-0000-7000-8000-0000000002${String(n).padStart(2, '0')}`,
        sku: `SKU-0000${String(n).padStart(2, '0')}`,
        barcode: null,
        label: 'Única',
        salePrice: '80.00',
        minStock: 1,
        stockQuantity: 3,
        stockLevel: 'OK',
        status: 'ACTIVE',
      },
    ],
    photos: [],
  };
}

type Options = {
  permissions?: string[];
  total?: number;
  /** Respuesta de la búsqueda exacta; por defecto 404 (no es un código). */
  lookup?: () => Response | Promise<Response>;
  /** Respuesta del listado por página; por defecto la página con productos. */
  list?: (page: number, params: URLSearchParams) => Response | Promise<Response>;
};

function mockApi({
  permissions = ['catalog:read', 'inventory:read'],
  total = 2,
  lookup,
  list,
}: Options = {}) {
  const requests: { url: string; params: URLSearchParams }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    const parsed = new URL(url, 'http://test.local');
    if (url.endsWith('/auth/me')) {
      return jsonResponse(200, {
        data: { id: 'u', name: 'Ana', email: 'ana@test.local', roles: [], permissions },
      });
    }
    if (parsed.pathname === '/api/v1/categories') {
      return jsonResponse(200, {
        data: [
          { id: CATEGORY_ID, name: 'Anillos', parentId: null, isActive: true, attributes: [] },
        ],
      });
    }
    if (parsed.pathname === '/api/v1/catalog/variants/lookup') {
      requests.push({ url, params: parsed.searchParams });
      return (
        (await lookup?.()) ??
        jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Código no encontrado' } })
      );
    }
    if (parsed.pathname === '/api/v1/products') {
      requests.push({ url, params: parsed.searchParams });
      const page = Number(parsed.searchParams.get('page') ?? '1');
      if (list) return list(page, parsed.searchParams);
      const data = total === 0 ? [] : [product(1), product(2)];
      return jsonResponse(200, { data, meta: { page, pageSize: 25, total } });
    }
    throw new Error(`Petición inesperada: ${url}`);
  });
  return requests;
}

function LocationProbe() {
  const { search } = useLocation();
  return <p data-testid="url-search">{search}</p>;
}

function renderPage(route = '/productos') {
  const client = createQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: { ...client.getDefaultOptions().queries, retry: false },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <ProductsPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const searchBox = () => screen.getByRole('textbox', { name: /Buscar por nombre, SKU/ });
const listRequests = (requests: { url: string; params: URLSearchParams }[]) =>
  requests.filter((request) => request.url.startsWith('/api/v1/products?'));

describe('listado de productos', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('muestra las tarjetas como lista y fija el título de la pestaña', async () => {
    mockApi();
    renderPage();
    const list = await screen.findByRole('list', { name: 'Productos' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Ver ficha de Producto 1' })).toBeVisible();
    expect(document.title).toBe('Productos · Joyería Sole');
  });

  it('estado vacío: avisa que no hay productos', async () => {
    mockApi({ total: 0 });
    renderPage();
    expect(await screen.findByText('No se encontraron productos.')).toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'Paginación' })).not.toBeInTheDocument();
  });

  it('error: muestra una alerta y permite reintentar', async () => {
    let calls = 0;
    mockApi({
      list: (page) => {
        calls += 1;
        return calls === 1
          ? jsonResponse(500, { error: { code: 'INTERNAL_ERROR', message: 'Error' } })
          : jsonResponse(200, { data: [product(1)], meta: { page, pageSize: 25, total: 1 } });
      },
    });
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudieron cargar los productos.');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('link', { name: 'Ver ficha de Producto 1' })).toBeVisible();
  });
});

describe('búsqueda de productos', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('código exacto (lector): informa la coincidencia, filtra por el SKU y deja el texto seleccionado', async () => {
    const requests = mockApi({
      lookup: () =>
        jsonResponse(200, {
          data: {
            variantId: '00000000-0000-7000-8000-000000000201',
            sku: 'SKU-000001',
            productName: 'Producto 1',
            label: 'Talla 7',
            matchedBy: 'BARCODE',
          },
        }),
    });
    renderPage();
    await screen.findByRole('link', { name: 'Ver ficha de Producto 1' });

    await userEvent.type(searchBox(), '7701234567890{Enter}');

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Encontrada por el código de barras: Producto 1 · Talla 7 (SKU-000001).',
    );
    await waitFor(() => {
      expect(screen.getByTestId('url-search')).toHaveTextContent('q=SKU-000001');
    });
    expect(listRequests(requests).at(-1)?.params.get('q')).toBe('SKU-000001');
    // El campo queda enfocado y con el texto seleccionado: la próxima lectura lo reemplaza.
    const input = searchBox() as HTMLInputElement;
    await waitFor(() => {
      expect(input).toHaveFocus();
    });
    expect(input.value).toBe('SKU-000001');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('si no es un código exacto (404) busca por texto y no muestra aviso', async () => {
    const requests = mockApi();
    renderPage();
    await screen.findByRole('link', { name: 'Ver ficha de Producto 1' });

    await userEvent.type(searchBox(), 'anillo luna{Enter}');

    await waitFor(() => {
      expect(listRequests(requests).at(-1)?.params.get('q')).toBe('anillo luna');
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByTestId('url-search')).toHaveTextContent('q=anillo+luna');
  });

  it('409 (código de varios proveedores): muestra el mensaje de la API y busca por texto', async () => {
    const requests = mockApi({
      lookup: () =>
        jsonResponse(409, {
          error: { code: 'CONFLICT', message: 'El código A-1 pertenece a más de una pieza.' },
        }),
    });
    renderPage();
    await screen.findByRole('link', { name: 'Ver ficha de Producto 1' });

    await userEvent.type(searchBox(), 'A-1{Enter}');

    expect(await screen.findByRole('status')).toHaveTextContent(
      'El código A-1 pertenece a más de una pieza.',
    );
    await waitFor(() => {
      expect(listRequests(requests).at(-1)?.params.get('q')).toBe('A-1');
    });
  });
});

describe('filtros y paginación de productos', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('los filtros viajan a la API y quedan en la URL (se conservan al volver de una ficha)', async () => {
    const requests = mockApi();
    renderPage();
    await screen.findByRole('link', { name: 'Ver ficha de Producto 1' });

    await userEvent.selectOptions(screen.getByLabelText('Filtrar por rubro'), 'Anillos');
    await waitFor(() => {
      expect(listRequests(requests).at(-1)?.params.get('categoryId')).toBe(CATEGORY_ID);
    });
    await userEvent.selectOptions(
      screen.getByLabelText('Estado de la ficha'),
      'Fichas incompletas',
    );
    await waitFor(() => {
      expect(listRequests(requests).at(-1)?.params.get('incomplete')).toBe('true');
    });

    const search = new URLSearchParams(screen.getByTestId('url-search').textContent);
    expect(search.get('categoryId')).toBe(CATEGORY_ID);
    expect(search.get('incomplete')).toBe('1');
  });

  it('un filtro cambiado mientras la búsqueda por código responde no se pierde', async () => {
    // Regresión: la búsqueda terminaba tarde y reescribía la URL con los filtros del render anterior.
    let release: () => void = () => undefined;
    const requests = mockApi({
      lookup: () =>
        new Promise<Response>((resolve) => {
          release = () => {
            resolve(
              jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Código no encontrado' } }),
            );
          };
        }),
    });
    renderPage();
    await screen.findByRole('link', { name: 'Ver ficha de Producto 1' });

    await userEvent.type(searchBox(), 'anillo{enter}');
    await userEvent.selectOptions(
      screen.getByLabelText('Estado de la ficha'),
      'Fichas incompletas',
    );
    release();

    await waitFor(() => {
      const search = new URLSearchParams(screen.getByTestId('url-search').textContent);
      expect(search.get('q')).toBe('anillo');
      expect(search.get('incomplete')).toBe('1');
    });
    await waitFor(() => {
      const last = listRequests(requests).at(-1)?.params;
      expect(last?.get('q')).toBe('anillo');
      expect(last?.get('incomplete')).toBe('true');
    });
  });

  it('limpiar la búsqueda y cambiar de inmediato el estado de la ficha conserva ambos cambios', async () => {
    // Regresión (fallaba en CI): el cambio de URL de React Router es diferido (transición). Un render
    // urgente intermedio con la URL anterior reescribía la «URL vigente» y el filtro siguiente partía
    // de la búsqueda vieja, que volvía a aplicarse junto con él.
    const requests = mockApi();
    renderPage('/productos?q=SKU-000001');
    await screen.findByRole('link', { name: 'Ver ficha de Producto 1' });

    const form = searchBox().closest('form');
    if (!form) throw new Error('No se encontró el formulario de búsqueda');
    act(() => {
      fireEvent.change(searchBox(), { target: { value: '' } });
    });
    act(() => {
      fireEvent.submit(form);
      fireEvent.change(screen.getByLabelText('Estado de la ficha'), {
        target: { value: 'incomplete' },
      });
    });

    await waitFor(() => {
      const search = new URLSearchParams(screen.getByTestId('url-search').textContent);
      expect(search.get('incomplete')).toBe('1');
      expect(search.has('q')).toBe(false);
    });
    await waitFor(() => {
      const last = listRequests(requests).at(-1)?.params;
      expect(last?.get('incomplete')).toBe('true');
      expect(last?.get('q') ?? '').toBe('');
    });
  });

  it('vaciar el campo justo después de una coincidencia por código no lo repone cuando llega la URL', async () => {
    // Regresión (fallaba en CI): la URL de la búsqueda llega diferida y la pantalla reescribía el
    // campo con ese valor aunque el usuario ya lo hubiera vaciado; el siguiente «Buscar» repetía
    // la búsqueda por el SKU en vez de limpiar.
    const requests = mockApi({
      lookup: () =>
        jsonResponse(200, {
          data: {
            variantId: '00000000-0000-7000-8000-000000000201',
            sku: 'SKU-000001',
            productName: 'Producto 1',
            label: 'Talla 7',
            matchedBy: 'BARCODE',
          },
        }),
    });
    renderPage();
    await screen.findByRole('link', { name: 'Ver ficha de Producto 1' });
    const form = searchBox().closest('form');
    if (!form) throw new Error('No se encontró el formulario de búsqueda');

    // Dentro de un mismo `act` React no aplica la transición de la URL hasta salir de él: el campo
    // se vacía después de la coincidencia y antes de que la URL nueva se renderice.
    await act(async () => {
      fireEvent.change(searchBox(), { target: { value: '7701234567890' } });
      fireEvent.submit(form);
      await vi.waitFor(() => {
        expect(requests.some((request) => request.url.includes('/variants/lookup'))).toBe(true);
      });
      await Promise.resolve();
      fireEvent.change(searchBox(), { target: { value: '' } });
    });

    await waitFor(() => {
      expect(new URLSearchParams(screen.getByTestId('url-search').textContent).get('q')).toBe(
        'SKU-000001',
      );
    });
    expect(searchBox()).toHaveValue('');
  });

  it('arranca con los filtros de la URL (enlace compartido, recarga o botón Atrás)', async () => {
    const requests = mockApi({ total: 60 });
    renderPage(`/productos?q=luna&withoutPrice=1&page=2&categoryId=${CATEGORY_ID}`);
    await screen.findByRole('link', { name: 'Ver ficha de Producto 1' });
    const first = listRequests(requests)[0]?.params;
    expect(first?.get('q')).toBe('luna');
    expect(first?.get('withoutPrice')).toBe('true');
    expect(first?.get('page')).toBe('2');
    expect(first?.get('categoryId')).toBe(CATEGORY_ID);
    expect(searchBox()).toHaveValue('luna');
    expect(screen.getByLabelText('Estado de la ficha')).toHaveValue('withoutPrice');
  });

  it('cambiar de página conserva la lista y el foco mientras llega la siguiente', async () => {
    let releaseSecondPage: (response: Response) => void = () => undefined;
    const requests = mockApi({
      total: 60,
      list: (page) => {
        if (page === 2) {
          return new Promise<Response>((resolve) => {
            releaseSecondPage = resolve;
          });
        }
        return jsonResponse(200, {
          data: [product(1), product(2)],
          meta: { page, pageSize: 25, total: 60 },
        });
      },
    });
    renderPage();
    await screen.findByRole('link', { name: 'Ver ficha de Producto 1' });
    const pagination = screen.getByRole('navigation', { name: 'Paginación' });
    expect(pagination).toHaveTextContent('Página 1 de 3 · 60 productos');
    expect(within(pagination).getByRole('button', { name: 'Anterior' })).toBeDisabled();

    const next = within(pagination).getByRole('button', { name: 'Siguiente' });
    next.focus();
    await userEvent.click(next);

    // Mientras llega la página 2 la cuadrícula sigue visible, marcada como ocupada.
    await waitFor(() => {
      expect(screen.getByRole('list', { name: 'Productos' })).toHaveAttribute('aria-busy', 'true');
    });
    expect(screen.getByRole('link', { name: 'Ver ficha de Producto 1' })).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toBe(pagination);
    expect(next).toHaveFocus();

    releaseSecondPage(
      jsonResponse(200, { data: [product(3)], meta: { page: 2, pageSize: 25, total: 60 } }),
    );
    expect(await screen.findByRole('link', { name: 'Ver ficha de Producto 3' })).toBeVisible();
    expect(screen.getByRole('list', { name: 'Productos' })).toHaveAttribute('aria-busy', 'false');
    expect(pagination).toHaveTextContent('Página 2 de 3');
    expect(listRequests(requests).at(-1)?.params.get('page')).toBe('2');
    expect(screen.getByTestId('url-search')).toHaveTextContent('page=2');
    expect(within(pagination).getByRole('button', { name: 'Anterior' })).toBeEnabled();
  });

  it('al llegar a la última página el foco pasa a «Anterior» (Siguiente se deshabilita)', async () => {
    mockApi({ total: 30 });
    renderPage();
    await screen.findByRole('link', { name: 'Ver ficha de Producto 1' });
    const pagination = screen.getByRole('navigation', { name: 'Paginación' });
    await userEvent.click(within(pagination).getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => {
      expect(within(pagination).getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    });
    expect(within(pagination).getByRole('button', { name: 'Anterior' })).toHaveFocus();
  });
});
