import type { StockEntryDetail } from '@joyeria/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../app/query-client.ts';
import { useConfirmStockEntry } from '../features/stock-entries/use-stock-entries.ts';
import { jsonResponse } from '../test/render.tsx';
import { ApiError, api } from './api-client.ts';
import { createAttemptKeys, newIdempotencyKey } from './idempotency.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ID = '00000000-0000-7000-8000-000000000001';

/** Cabecera Idempotency-Key enviada en la llamada `index` a fetch. */
function sentKey(
  fetchMock: { mock: { calls: readonly (readonly unknown[])[] } },
  index: number,
): string | undefined {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.['Idempotency-Key'];
}

describe('claves de idempotencia', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('genera UUID v4 también fuera de un contexto seguro (HTTP en la red local)', () => {
    vi.stubGlobal('isSecureContext', false);
    const keys = new Set(Array.from({ length: 50 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(50);
    for (const key of keys) expect(key).toMatch(UUID);
  });

  it('una clave por intento: se reutiliza con los mismos datos y cambia con otros', () => {
    let n = 0;
    const keys = createAttemptKeys(() => `clave-${++n}`);
    expect(keys.keyFor({ id: 'a' })).toBe('clave-1');
    expect(keys.keyFor({ id: 'a' })).toBe('clave-1');
    keys.settle(new ApiError(503, { code: 'SERVICE_UNAVAILABLE', message: 'ocupado' }));
    expect(keys.keyFor({ id: 'a' })).toBe('clave-1'); // reintento tras un error transitorio
    expect(keys.keyFor({ id: 'b' })).toBe('clave-2'); // otros datos, otro intento
  });

  it('tras el éxito o una clave rechazada, el próximo intento usa una clave nueva', () => {
    let n = 0;
    const keys = createAttemptKeys(() => `clave-${++n}`);
    keys.keyFor('x');
    keys.settle(null);
    expect(keys.keyFor('x')).toBe('clave-2');
    keys.settle(new ApiError(409, { code: 'IDEMPOTENCY_KEY_REUSED', message: 'usada' }));
    expect(keys.keyFor('x')).toBe('clave-3');
  });

  it('el cliente HTTP envía la cabecera solo cuando se indica', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(200, { data: {} }));
    await api.post('/x', { a: 1 }, { idempotencyKey: 'k-1' });
    await api.post('/x', { a: 1 });
    expect(sentKey(fetchMock, 0)).toBe('k-1');
    expect(sentKey(fetchMock, 1)).toBeUndefined();
  });
});

describe('confirmar un ingreso reintenta con la misma clave', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>;
  }

  it('error de red → reintento con la misma clave; tras el éxito, un intento nuevo usa otra', async () => {
    const detail = { id: ID, status: 'CONFIRMED' } as unknown as StockEntryDetail;
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementation(async () => jsonResponse(200, { data: detail }));

    const { result } = renderHook(() => useConfirmStockEntry(ID), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow('Failed to fetch');
    });
    await act(async () => {
      await result.current.mutateAsync();
    });
    await act(async () => {
      await result.current.mutateAsync();
    });

    const first = sentKey(fetchMock, 0);
    expect(first).toMatch(UUID);
    expect(sentKey(fetchMock, 1)).toBe(first);
    expect(sentKey(fetchMock, 2)).toMatch(UUID);
    expect(sentKey(fetchMock, 2)).not.toBe(first);
  });
});
