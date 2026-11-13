import type { ProductPhoto } from '@joyeria/shared';
import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../../test/render.tsx';
import { PieceImage } from './piece-image.tsx';

const VARIANT_ID = '00000000-0000-7000-8000-000000000042';
const OTHER_ID = '00000000-0000-7000-8000-000000000043';
const PHOTO_URL =
  '/api/v1/products/00000000-0000-7000-8000-000000000001/photos/00000000-0000-7000-8000-000000000101';

function photo(width = 1200, height = 800): ProductPhoto {
  return {
    id: '00000000-0000-7000-8000-000000000101',
    url: PHOTO_URL,
    contentType: 'image/webp',
    width,
    height,
    sizeBytes: 90_000,
    position: 0,
    isCover: true,
  };
}

const urlOf = (input: RequestInfo | URL | undefined) =>
  new URL(input instanceof Request ? input.url : (input ?? '').toString(), 'http://localhost');

/** Simula `GET /products/variants/covers?ids=…` con las portadas indicadas. */
function mockCovers(covers: Record<string, ProductPhoto | null>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = urlOf(input);
    const ids = (url.searchParams.get('ids') ?? '').split(',');
    return Promise.resolve(
      jsonResponse(200, {
        data: ids.map((variantId) => ({ variantId, photo: covers[variantId] ?? null })),
      }),
    );
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PieceImage', () => {
  it('usa la miniatura inmutable de la portada con srcset, sizes, lazy y dimensiones (decorativa)', async () => {
    mockCovers({ [VARIANT_ID]: photo() });
    const { container } = renderWithProviders(
      <PieceImage variantId={VARIANT_ID} className="size-20" />,
    );
    await waitFor(() => {
      expect(container.querySelector('img')).not.toBeNull();
    });
    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', `${PHOTO_URL}?w=160`);
    expect(image).toHaveAttribute(
      'srcset',
      `${PHOTO_URL}?w=160 160w, ${PHOTO_URL}?w=320 320w, ${PHOTO_URL}?w=640 640w, ${PHOTO_URL} 1200w`,
    );
    expect(image).toHaveAttribute('sizes', '80px');
    expect(image).toHaveAttribute('width', '1200');
    expect(image).toHaveAttribute('height', '800');
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveClass('size-20');
  });

  it('agrupa las portadas de una pantalla en una sola petición', async () => {
    const fetchSpy = mockCovers({ [VARIANT_ID]: photo(), [OTHER_ID]: null });
    const { container } = renderWithProviders(
      <>
        <PieceImage variantId={VARIANT_ID} />
        <PieceImage variantId={OTHER_ID} />
        <PieceImage variantId={VARIANT_ID} />
      </>,
    );
    await waitFor(() => {
      expect(container.querySelectorAll('img')).toHaveLength(2);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requested = urlOf(fetchSpy.mock.calls[0]?.[0]);
    expect(requested.pathname).toBe('/api/v1/products/variants/covers');
    expect(requested.searchParams.get('ids')?.split(',').sort()).toEqual([VARIANT_ID, OTHER_ID]);
    expect(container.querySelectorAll('[data-piece-image="sin-foto"]')).toHaveLength(1);
  });

  it('una foto angosta no ofrece miniaturas más anchas que ella', async () => {
    mockCovers({ [VARIANT_ID]: photo(300, 300) });
    const { container } = renderWithProviders(<PieceImage variantId={VARIANT_ID} />);
    await waitFor(() => {
      expect(container.querySelector('img')).not.toBeNull();
    });
    expect(container.querySelector('img')).toHaveAttribute(
      'srcset',
      `${PHOTO_URL}?w=160 160w, ${PHOTO_URL} 300w`,
    );
  });

  it('sin foto muestra el marcador local y no descarga ninguna imagen', async () => {
    mockCovers({});
    const { container } = renderWithProviders(<PieceImage variantId={VARIANT_ID} />);
    await waitFor(() => {
      expect(container.querySelector('[data-piece-image="sin-foto"]')).not.toBeNull();
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('si falla la consulta de portadas, recurre a la imagen por variante', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(jsonResponse(400, { error: { code: 'VALIDATION_ERROR', message: 'Error' } })),
    );
    const { container } = renderWithProviders(<PieceImage variantId={VARIANT_ID} />);
    await waitFor(() => {
      expect(container.querySelector('img')).not.toBeNull();
    });
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      `/api/v1/products/variants/${VARIANT_ID}/cover?w=160`,
    );
  });

  it('sin variante muestra un marcador y no pide nada', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { container } = renderWithProviders(<PieceImage variantId={null} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
