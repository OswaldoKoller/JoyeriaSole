import type { Product, ProductPhoto } from '@joyeria/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../test/render.tsx';
import { isSafePhotoUrl, photoSrc, photoSrcSet } from './photo-url.ts';
import { ProductThumb } from './product-thumb.tsx';

function photoWith(url: string): ProductPhoto {
  return {
    id: '00000000-0000-7000-8000-000000000101',
    url,
    contentType: 'image/webp',
    width: 800,
    height: 600,
    sizeBytes: 1000,
    position: 0,
    isCover: true,
  };
}

describe('URL de las fotos (S-01)', () => {
  it('solo acepta rutas de nuestra API', () => {
    expect(isSafePhotoUrl('/api/v1/products/1/photos/2')).toBe(true);
    for (const url of [
      'https://evil.test/foto.png',
      '//evil.test/foto.png',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      '/otra/ruta.png',
      '',
    ]) {
      expect(isSafePhotoUrl(url)).toBe(false);
    }
  });

  it('una foto con URL externa no se carga: se muestra el marcador «Sin foto»', () => {
    const product = {
      name: 'Anillo',
      photos: [photoWith('https://evil.test/foto.png')],
    } as Pick<Product, 'name' | 'photos'>;
    renderWithProviders(<ProductThumb product={product} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Sin foto')).toBeInTheDocument();
  });
});

describe('miniaturas (DT-DAT-18)', () => {
  const url = '/api/v1/products/1/photos/2';

  it('el srcset ofrece solo las miniaturas más angostas que la foto y la foto completa (o nada)', () => {
    expect(photoSrcSet(url, 1200)).toBe(
      `${url}?w=160 160w, ${url}?w=320 320w, ${url}?w=640 640w, ${url} 1200w`,
    );
    expect(photoSrcSet(url, 400)).toBe(`${url}?w=160 160w, ${url}?w=320 320w, ${url} 400w`);
    expect(photoSrcSet(url, 160)).toBeUndefined();
    expect(photoSrcSet(url, 1)).toBeUndefined();
  });

  it('el src de respaldo es la miniatura pedida o la foto si ya es más angosta', () => {
    expect(photoSrc(url, 1200, 320)).toBe(`${url}?w=320`);
    expect(photoSrc(url, 300, 320)).toBe(url);
  });

  it('la miniatura de un producto usa srcset, sizes y dimensiones', () => {
    const product = { name: 'Anillo', photos: [photoWith(url)] } as Pick<
      Product,
      'name' | 'photos'
    >;
    renderWithProviders(<ProductThumb product={product} sizes="64px" />);
    const image = screen.getByRole('img', { name: 'Foto de portada de Anillo' });
    expect(image).toHaveAttribute('src', `${url}?w=320`);
    expect(image).toHaveAttribute(
      'srcset',
      `${url}?w=160 160w, ${url}?w=320 320w, ${url}?w=640 640w, ${url} 800w`,
    );
    expect(image).toHaveAttribute('sizes', '64px');
    expect(image).toHaveAttribute('width', '800');
    expect(image).toHaveAttribute('loading', 'lazy');
  });
});
