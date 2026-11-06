import type { Product } from '@joyeria/shared';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../app/query-client.ts';
import { jsonResponse } from '../../test/render.tsx';
import { useProduct, useUpdateProduct } from './use-products.ts';

const ID = '00000000-0000-7000-8000-000000000001';

const product: Product = {
  id: ID,
  categoryId: '00000000-0000-7000-8000-000000000009',
  categoryName: 'Anillos',
  name: 'Anillo luna',
  description: null,
  model: null,
  status: 'ACTIVE',
  isIncomplete: false,
  hasMissingPrice: false,
  profileIncomplete: false,
  attributes: [],
  axes: [],
  variants: [],
  photos: [],
};

const filters = { page: 1, q: '', categoryId: '', incomplete: false, withoutPrice: false };

function setup(): { client: QueryClient; wrapper: (props: { children: ReactNode }) => ReactNode } {
  const client = createQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: { ...client.getDefaultOptions().queries, retry: false },
  });
  return {
    client,
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

describe('ficha desde la caché del listado', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('si el producto ya está en un listado reciente se muestra al instante, sin pedirlo', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const { client, wrapper } = setup();
    client.setQueryData(['products', filters], {
      data: [product],
      meta: { page: 1, pageSize: 25, total: 1 },
    });

    const { result } = renderHook(() => useProduct(ID), { wrapper });

    expect(result.current.data?.name).toBe('Anillo luna');
    expect(result.current.isPending).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('si el listado en caché ya no es reciente, muestra lo que tiene y lo confirma con la API', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(jsonResponse(200, { data: { ...product, name: 'Anillo luna (editado)' } })),
      );
    const { client, wrapper } = setup();
    client.setQueryData(
      ['products', filters],
      { data: [product], meta: { page: 1, pageSize: 25, total: 1 } },
      { updatedAt: Date.now() - 5 * 60_000 },
    );

    const { result } = renderHook(() => useProduct(ID), { wrapper });

    expect(result.current.data?.name).toBe('Anillo luna');
    await waitFor(() => {
      expect(result.current.data?.name).toBe('Anillo luna (editado)');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('si no está en ningún listado, la pide (queda cargando)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(jsonResponse(200, { data: product })));
    const { wrapper } = setup();

    const { result } = renderHook(() => useProduct(ID), { wrapper });

    expect(result.current.isPending).toBe(true);
    await waitFor(() => {
      expect(result.current.data?.name).toBe('Anillo luna');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('mutaciones del producto', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('la respuesta de la API reemplaza la ficha en caché y solo se refrescan los listados', async () => {
    const edited = { ...product, name: 'Anillo luna (editado)' };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      if (init?.method === 'PATCH') return Promise.resolve(jsonResponse(200, { data: edited }));
      return Promise.resolve(
        jsonResponse(200, { data: [], meta: { page: 1, pageSize: 25, total: 0 } }),
      );
    });
    const { client, wrapper } = setup();
    client.setQueryData(['products', 'detail', ID], { data: product });
    client.setQueryData(['products', filters], {
      data: [product],
      meta: { page: 1, pageSize: 25, total: 1 },
    });

    const { result } = renderHook(() => useUpdateProduct(), { wrapper });
    await result.current.mutateAsync({ id: ID, input: { name: 'Anillo luna (editado)' } });

    expect(client.getQueryData(['products', 'detail', ID])).toEqual({ data: edited });
    // Ni el detalle ni el listado se vuelven a pedir si nadie los está mostrando.
    expect(client.getQueryState(['products', filters])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['products', 'detail', ID])?.isInvalidated).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
