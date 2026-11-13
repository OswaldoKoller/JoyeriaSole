import type { Product, ProductPhoto } from '@joyeria/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../../test/render.tsx';
import { PhotoGallery } from './photo-gallery.tsx';
import { PhotoUploader } from './photo-uploader.tsx';
import { ProductThumb } from './product-thumb.tsx';

const PRODUCT_ID = '00000000-0000-7000-8000-000000000001';

function photo(n: number, isCover = false): ProductPhoto {
  const id = `00000000-0000-7000-8000-00000000010${n}`;
  return {
    id,
    url: `/api/v1/products/${PRODUCT_ID}/photos/${id}`,
    contentType: 'image/webp',
    width: 800,
    height: 600,
    sizeBytes: 50_000,
    position: n - 1,
    isCover,
  };
}

function product(photos: ProductPhoto[]) {
  return { id: PRODUCT_ID, name: 'Anillo luna', photos } as Product;
}

const jpeg = (name = 'foto.jpg') =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 1])], name, { type: 'image/jpeg' });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProductThumb', () => {
  it('muestra la portada con texto alternativo', () => {
    renderWithProviders(<ProductThumb product={product([photo(1), photo(2, true)])} />);
    const image = screen.getByRole('img', { name: 'Foto de portada de Anillo luna' });
    expect(image).toHaveAttribute('src', `${photo(2).url}?w=320`);
  });

  it('muestra un marcador sin imagen cuando no hay fotos', () => {
    renderWithProviders(<ProductThumb product={product([])} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Sin foto')).toBeInTheDocument();
  });
});

describe('PhotoUploader', () => {
  it('sube el archivo elegido como multipart y avisa al terminar', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(201, { data: photo(1, true) }));
    const onUploaded = vi.fn();
    renderWithProviders(
      <PhotoUploader
        productId={PRODUCT_ID}
        productName="Anillo luna"
        photoCount={0}
        onUploaded={onUploaded}
      />,
    );
    await userEvent.setup().upload(screen.getByLabelText('Subir foto de Anillo luna'), jpeg());
    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledWith(expect.objectContaining({ isCover: true }));
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`/api/v1/products/${PRODUCT_ID}/photos`);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get('file')).toBeInstanceOf(File);
    // Sin Content-Type propio: el navegador añade el boundary.
    expect(init?.headers).toBeUndefined();
  });

  it('rechaza en el navegador un formato no permitido sin llamar a la API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    renderWithProviders(
      <PhotoUploader productId={PRODUCT_ID} productName="Anillo luna" photoCount={0} />,
    );
    const gif = new File([new Uint8Array([71, 73, 70])], 'animada.gif', { type: 'image/gif' });
    // `applyAccept: false`: simula que el usuario eligió el archivo pese al filtro del selector.
    await userEvent
      .setup({ applyAccept: false })
      .upload(screen.getByLabelText('Subir foto de Anillo luna'), gif);
    expect(await screen.findByRole('alert')).toHaveTextContent('no es una foto JPG, PNG o WebP');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('muestra el mensaje de la API cuando falla la subida', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(413, {
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'El archivo es muy grande' },
      }),
    );
    renderWithProviders(
      <PhotoUploader productId={PRODUCT_ID} productName="Anillo luna" photoCount={1} />,
    );
    await userEvent.setup().upload(screen.getByLabelText('Subir foto de Anillo luna'), jpeg());
    expect(await screen.findByRole('alert')).toHaveTextContent('El archivo es muy grande');
  });

  it('se deshabilita al llegar a 5 fotos', () => {
    renderWithProviders(
      <PhotoUploader productId={PRODUCT_ID} productName="Anillo luna" photoCount={5} />,
    );
    expect(screen.getByLabelText('Subir foto de Anillo luna')).toBeDisabled();
    expect(screen.getByText(/ya tiene 5 fotos/)).toBeInTheDocument();
  });
});

describe('PhotoGallery', () => {
  const photos = [photo(1, true), photo(2), photo(3)];

  it('sin permiso solo muestra las fotos (sin botones de gestión ni subida)', () => {
    renderWithProviders(<PhotoGallery product={product(photos)} canManage={false} />);
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(screen.getByText('Portada')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Subir foto/)).not.toBeInTheDocument();
  });

  it('con permiso: portada, orden y eliminación con confirmación', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { data: [] }));
    renderWithProviders(<PhotoGallery product={product(photos)} canManage />);
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: 'Marcar como portada la foto 2 de Anillo luna' }),
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/v1/products/${PRODUCT_ID}/photos/${photo(2).id}/cover`,
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    expect(
      screen.getByRole('button', { name: 'Mover antes la foto 1 de Anillo luna' }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole('button', { name: 'Mover después la foto 1 de Anillo luna' }),
    );
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url]) => typeof url === 'string' && url.endsWith('/photos/order'),
      );
      expect(JSON.parse((call?.[1]?.body as string | undefined) ?? 'null')).toEqual({
        photoIds: [photo(2).id, photo(1).id, photo(3).id],
      });
    });

    // Eliminar pide confirmación y no llama a la API hasta confirmar.
    const before = fetchMock.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Eliminar la foto 3 de Anillo luna' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('¿Eliminar esta foto?');
    expect(fetchMock.mock.calls.length).toBe(before);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Eliminar la foto 3 de Anillo luna' }));
    await user.click(screen.getByRole('button', { name: 'Sí, eliminar foto' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/v1/products/${PRODUCT_ID}/photos/${photo(3).id}`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('informa el error de la API al cambiar la portada', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Foto no encontrada' } }),
    );
    renderWithProviders(<PhotoGallery product={product(photos)} canManage />);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Marcar como portada la foto 2 de Anillo luna' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Foto no encontrada');
  });
});
